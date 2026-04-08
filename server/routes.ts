import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import createMemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { emailService } from "./email";
import { automationService } from "./automation";
import { notificationCenter } from "./notification-center";
import { emailProviderValues } from "@shared/schema";
import { isNotificationCategory, type NotificationCategory } from "@shared/notifications";

const MemoryStore = createMemoryStore(session);

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  next();
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    if (!roles.includes(user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

function parseFilters(query: any) {
  return {
    dateFrom: query.dateFrom || undefined,
    dateTo: query.dateTo || undefined,
    countries: query.countries ? query.countries.split(",").map(Number) : [],
    brands: query.brands ? query.brands.split(",").map(Number) : [],
    titles: query.titles ? query.titles.split(",").map(Number) : [],
    studios: query.studios ? query.studios.split(",").map(Number) : [],
    executionTypes: query.executionTypes ? query.executionTypes.split(",") : [],
    statuses: query.statuses ? query.statuses.split(",") : [],
    page: query.page ? parseInt(query.page) : 1,
    limit: query.limit ? parseInt(query.limit) : 20,
    sortBy: query.sortBy || "execution_date",
    sortDir: query.sortDir || "desc",
  };
}

function getBaseUrl(req: Request) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : req.protocol;
  return `${protocol}://${req.get("host")}`;
}

function parseEmailProvider(provider: string | string[]) {
  const value = Array.isArray(provider) ? provider[0] : provider;
  if (emailProviderValues.includes(value as any)) {
    return value as (typeof emailProviderValues)[number];
  }
  throw new Error("Unsupported email provider");
}

function parseNotificationCategory(value: unknown): NotificationCategory {
  const normalized = Array.isArray(value) ? value[0] : value;
  return isNotificationCategory(normalized) ? normalized : "all";
}

function parseOptionalId(value: unknown): number | undefined {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (normalized === undefined || normalized === null || normalized === "") return undefined;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return res.status(status).json({ code, message, details });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const handleDeleteAccount = async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const accountId = Number(req.params.id);
      const existing = await storage.getAccount(accountId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const recipientIds = await notificationCenter.getAccountRelatedUserIds(accountId);
      await storage.deleteAccount(accountId);
      await notificationCenter.sendNotification({
        recipientIds,
        actorId: user.id,
        executionId: null,
        entityType: "account",
        entityId: accountId,
        type: "account_deleted",
        payload: {
          accountId,
          accountName: existing.name,
        },
      });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  };

  app.use(
    session({
      store: new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 }),
      secret: process.env.SESSION_SECRET || "rola-spotlight-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) return done(null, false);
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return done(null, false);
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || null);
    } catch (err) {
      done(err);
    }
  });

  app.use(passport.initialize());
  app.use(passport.session());

  // Seed data (schema push happens separately via npm run db:push)
  try {
    await storage.seedData();
    console.log("Database seeded successfully");
  } catch (err) {
    console.error("DB seed error:", err);
  }

  // Auto-create conversations for existing executions that don't have one
  try {
    const { executions: allExecs } = await storage.getExecutions({ page: 1, limit: 1000 });
    for (const exec of allExecs) {
      await storage.getOrCreateConversationForExecution(exec.id);
    }
    console.log(`Ensured conversations exist for ${allExecs.length} executions`);
  } catch (err) {
    console.error("Conv init error:", err);
  }

  automationService.startScheduler();

  // === AUTH ROUTES ===
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const { password, ...safe } = user;
        return res.json(safe);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { password, ...safe } = req.user as any;
    res.json(safe);
  });

  // === CATALOG ROUTES ===
  app.get("/api/countries", requireAuth, async (_req, res) => {
    res.json(await storage.getCountries());
  });
  app.post("/api/countries", requireRole("admin"), async (req, res) => {
    res.json(await storage.createCountry(req.body));
  });
  app.patch("/api/countries/:id", requireRole("admin"), async (req, res) => {
    res.json(await storage.updateCountry(Number(req.params.id), req.body));
  });
  app.delete("/api/countries/:id", requireRole("admin"), async (req, res) => {
    await storage.deleteCountry(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/brands", requireAuth, async (_req, res) => {
    res.json(await storage.getBrands());
  });
  app.post("/api/brands", requireRole("admin", "editor"), async (req, res) => {
    res.json(await storage.createBrand(req.body));
  });
  app.patch("/api/brands/:id", requireRole("admin"), async (req, res) => {
    res.json(await storage.updateBrand(Number(req.params.id), req.body));
  });
  app.delete("/api/brands/:id", requireRole("admin"), async (req, res) => {
    await storage.deleteBrand(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/titles", requireAuth, async (_req, res) => {
    res.json(await storage.getTitles());
  });
  app.post("/api/titles", requireRole("admin", "editor"), async (req, res) => {
    res.json(await storage.createTitle(req.body));
  });
  app.patch("/api/titles/:id", requireRole("admin"), async (req, res) => {
    res.json(await storage.updateTitle(Number(req.params.id), req.body));
  });
  app.delete("/api/titles/:id", requireRole("admin"), async (req, res) => {
    await storage.deleteTitle(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/studios", requireAuth, async (_req, res) => {
    res.json(await storage.getStudios());
  });
  app.post("/api/studios", requireRole("admin", "editor"), async (req, res) => {
    res.json(await storage.createStudio(req.body));
  });
  app.patch("/api/studios/:id", requireRole("admin"), async (req, res) => {
    res.json(await storage.updateStudio(Number(req.params.id), req.body));
  });
  app.delete("/api/studios/:id", requireRole("admin"), async (req, res) => {
    await storage.deleteStudio(Number(req.params.id));
    res.json({ ok: true });
  });

  // === CRM ACCOUNTS ===
  app.get("/api/accounts", requireAuth, async (_req, res) => {
    res.json(await storage.getAccounts());
  });

  app.post("/api/accounts", requireRole("admin", "editor"), async (req, res) => {
    try {
      const user = req.user as any;
      const account = await storage.createAccount({
        ...req.body,
        ownerId: req.body.ownerId || user.id,
      });
      await notificationCenter.sendNotification({
        recipientIds: await notificationCenter.getAccountRelatedUserIds(account.id),
        actorId: user.id,
        executionId: null,
        entityType: "account",
        entityId: account.id,
        type: "account_created",
        payload: {
          accountId: account.id,
          accountName: account.name,
        },
      });
      res.json(account);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/accounts/:id", requireAuth, async (req, res) => {
    const account = await storage.getAccount(Number(req.params.id));
    if (!account) return res.status(404).json({ message: "Not found" });
    res.json(account);
  });

  app.patch("/api/accounts/:id", requireRole("admin", "editor"), async (req, res) => {
    try {
      const user = req.user as any;
      const accountId = Number(req.params.id);
      const existing = await storage.getAccount(accountId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const previousRecipientIds = await notificationCenter.getAccountRelatedUserIds(accountId);
      const updated = await storage.updateAccount(accountId, req.body);
      if (!updated) return res.status(404).json({ message: "Not found" });
      const recipientIds = Array.from(new Set([
        ...previousRecipientIds,
        ...(await notificationCenter.getAccountRelatedUserIds(updated.id)),
      ]));
      await notificationCenter.sendNotification({
        recipientIds,
        actorId: user.id,
        executionId: null,
        entityType: "account",
        entityId: updated.id,
        type: "account_updated",
        payload: {
          accountId: updated.id,
          accountName: updated.name,
        },
      });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/accounts/:id", requireRole("admin", "editor"), async (req, res) => {
    await handleDeleteAccount(req, res);
  });

  app.post("/api/accounts/:id/delete", requireRole("admin", "editor"), async (req, res) => {
    await handleDeleteAccount(req, res);
  });

  app.get("/api/accounts/:id/contacts", requireAuth, async (req, res) => {
    res.json(await storage.getContactsByAccount(Number(req.params.id)));
  });

  app.post("/api/accounts/:id/contacts", requireRole("admin", "editor"), async (req, res) => {
    try {
      const contact = await storage.createContact({
        ...req.body,
        accountId: Number(req.params.id),
      });
      res.json(contact);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/contacts/:id", requireRole("admin", "editor"), async (req, res) => {
    try {
      const updated = await storage.updateContact(Number(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/accounts/:id/campaigns", requireAuth, async (req, res) => {
    res.json(await storage.getCampaignsByAccount(Number(req.params.id)));
  });

  app.post("/api/accounts/:id/campaigns", requireRole("admin", "editor"), async (req, res) => {
    try {
      const user = req.user as any;
      const campaign = await storage.createCampaign({
        ...req.body,
        accountId: Number(req.params.id),
      });
      await automationService.evaluateCampaign(campaign.id);
      await notificationCenter.sendNotification({
        recipientIds: await notificationCenter.getCampaignRelatedUserIds(campaign.id),
        actorId: user.id,
        executionId: null,
        entityType: "campaign",
        entityId: campaign.id,
        type: "campaign_created",
        payload: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          accountId: campaign.accountId,
        },
      });
      res.json(campaign);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/campaigns/:id", requireAuth, async (req, res) => {
    const campaign = await automationService.getCampaignDetails(Number(req.params.id));
    if (!campaign) return res.status(404).json({ message: "Not found" });
    res.json(campaign);
  });

  app.patch("/api/campaigns/:id", requireRole("admin", "editor"), async (req, res) => {
    try {
      const user = req.user as any;
      const campaignId = Number(req.params.id);
      const existing = await storage.getCampaign(campaignId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const previousRecipientIds = await notificationCenter.getCampaignRelatedUserIds(campaignId);
      const updated = await storage.updateCampaign(campaignId, req.body);
      if (!updated) return res.status(404).json({ message: "Not found" });
      await automationService.evaluateCampaign(updated.id);
      const recipientIds = Array.from(new Set([
        ...previousRecipientIds,
        ...(await notificationCenter.getCampaignRelatedUserIds(updated.id)),
      ]));
      await notificationCenter.sendNotification({
        recipientIds,
        actorId: user.id,
        executionId: null,
        entityType: "campaign",
        entityId: updated.id,
        type: "campaign_updated",
        payload: {
          campaignId: updated.id,
          campaignName: updated.name,
          accountId: updated.accountId,
        },
      });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // === USERS ===
  app.get("/api/users", requireAuth, async (_req, res) => {
    res.json(await storage.getUsers());
  });
  app.post("/api/users", requireRole("admin"), async (req, res) => {
    try {
      const user = await storage.createUser(req.body);
      const { password, ...safe } = user;
      res.json(safe);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/users/:id", requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    const updated = await storage.updateUser(id, req.body);
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(updated);
  });

  app.delete("/api/users/:id", requireRole("admin"), async (req, res) => {
    const currentUser = req.user as any;
    const id = Number(req.params.id);
    if (id === currentUser.id) return res.status(400).json({ message: "Cannot delete yourself" });
    await storage.deleteUser(id);
    res.json({ ok: true });
  });

  // === EXECUTIONS ===
  app.get("/api/executions", requireAuth, async (req, res) => {
    const filters = parseFilters(req.query);
    res.json(await storage.getExecutions(filters));
  });

  app.get("/api/executions/export", requireAuth, async (req, res) => {
    const filters = parseFilters({ ...req.query, page: 1, limit: 100000 });
    const { executions: data } = await storage.getExecutions(filters);

    const headers = ["ID", "Date", "Country", "Brand", "Title", "Studio", "Type", "Local Value", "Currency", "FX Rate", "USD Value", "Status", "Owner", "Notes"];
    const rows = data.map(e => [
      e.id, e.executionDate, e.country?.name || "", e.brand?.name || "", e.title?.name || "", e.studio?.name || "",
      e.executionType, e.mediaValueLocal, e.localCurrency, e.fxRateUsed, e.mediaValueUsd, e.status,
      e.owner?.displayName || "", (e.notes || "").replace(/"/g, '""'),
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=executions.csv");
    res.send(csv);
  });

  app.get("/api/executions/gantt", requireAuth, async (req, res) => {
    const filters = parseFilters(req.query);
    res.json(await automationService.getExecutionPortfolioGantt(filters));
  });

  app.get("/api/executions/:id", requireAuth, async (req, res) => {
    const exec = await storage.getExecution(Number(req.params.id));
    if (!exec) return res.status(404).json({ message: "Not found" });
    res.json(exec);
  });

  app.post("/api/executions", requireRole("admin", "editor"), async (req, res) => {
    try {
      const exec = await storage.createExecution(req.body);
      await automationService.evaluateExecution(exec.id);
      if (exec.campaignId) {
        await automationService.evaluateCampaign(exec.campaignId);
      }
      res.json(exec);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/executions/:id", requireRole("admin", "editor"), async (req, res) => {
    const executionId = Number(req.params.id);
    const previous = await storage.getExecution(executionId);
    const exec = await storage.updateExecution(executionId, req.body);
    if (!exec) return res.status(404).json({ message: "Not found" });
    await automationService.evaluateExecution(exec.id);
    if (previous?.campaignId && previous.campaignId !== exec.campaignId) {
      await automationService.evaluateCampaign(previous.campaignId);
    }
    if (exec.campaignId) {
      await automationService.evaluateCampaign(exec.campaignId);
    }
    res.json(exec);
  });

  app.patch("/api/executions/:id/status", requireRole("admin", "editor", "approver"), async (req, res) => {
    const user = req.user as any;
    const executionId = Number(req.params.id);
    const exec = await storage.getExecution(executionId);
    const oldStatus = exec?.status;

    await storage.updateExecutionStatus(executionId, req.body.status, user.id);

    if (exec) {
      const execName = `${exec.brand?.name || ''} - ${exec.title?.name || ''}`;
      await notificationCenter.sendNotification({
        recipientIds: await notificationCenter.getExecutionRelatedUserIds(executionId),
        actorId: user.id,
        executionId,
        entityType: "execution",
        entityId: executionId,
        type: "status_changed",
        payload: {
          executionName: execName,
          oldStatus: oldStatus || "draft",
          newStatus: req.body.status,
        },
      });
    }

    await automationService.evaluateExecution(executionId);
    res.json({ ok: true });
  });

  // === ASSETS ===
  app.get("/api/executions/:id/assets", requireAuth, async (req, res) => {
    res.json(await storage.getAssets(Number(req.params.id)));
  });

  app.post("/api/executions/:id/assets", requireRole("admin", "editor"), async (req, res) => {
    const asset = await storage.createAsset({ ...req.body, executionId: Number(req.params.id) });
    await automationService.evaluateExecution(Number(req.params.id));
    res.json(asset);
  });

  // === STATUS HISTORY ===
  app.get("/api/executions/:id/history", requireAuth, async (req, res) => {
    res.json(await storage.getStatusHistory(Number(req.params.id)));
  });

  app.get("/api/executions/:id/activity", requireAuth, async (req, res) => {
    res.json(await storage.getExecutionActivity(Number(req.params.id)));
  });

  app.get("/api/executions/:id/alerts", requireAuth, async (req, res) => {
    res.json(await automationService.listAlertsForExecution(Number(req.params.id)));
  });

  app.get("/api/executions/:id/gantt", requireAuth, async (req, res) => {
    const gantt = await automationService.getExecutionGantt(Number(req.params.id));
    if (!gantt) return res.status(404).json({ message: "Not found" });
    res.json(gantt);
  });

  // === DASHBOARD ===
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    const filters = parseFilters(req.query);
    res.json(await storage.getDashboardStats(filters));
  });

  app.get("/api/dashboard/operational-risk", requireAuth, async (_req, res) => {
    res.json(await automationService.getOperationalRiskSummary());
  });

  app.post("/api/automation/run", requireRole("admin"), async (_req, res) => {
    const result = await automationService.runSweep({ forceNotify: false });
    res.json({
      result,
      summary: await automationService.getOperationalRiskSummary(),
    });
  });

  // === TASKS ===
  app.get("/api/executions/:id/tasks", requireAuth, async (req, res) => {
    res.json(await storage.getTasks(Number(req.params.id)));
  });

  app.post("/api/executions/:id/tasks", requireRole("admin", "editor"), async (req, res) => {
    const user = req.user as any;
    const executionId = Number(req.params.id);
    const task = await storage.createTask({
      ...req.body,
      executionId,
      createdBy: user.id,
    });

    if (task.assignedTo && task.assignedTo !== user.id) {
      const exec = await storage.getExecution(executionId);
      await notificationCenter.sendNotification({
        recipientIds: await notificationCenter.getTaskRelatedUserIds(task.id),
        actorId: user.id,
        executionId,
        entityType: "task",
        entityId: task.id,
        type: "task_assigned",
        payload: {
          taskTitle: task.title,
          executionName: exec ? `${exec.brand?.name || ''} - ${exec.title?.name || ''}` : `#${executionId}`,
        },
      });
    }

    await automationService.evaluateTask(task.id);
    res.json(task);
  });

  app.patch("/api/tasks/:id", requireRole("admin", "editor"), async (req, res) => {
    const user = req.user as any;
    const taskId = Number(req.params.id);
    const existingTask = await storage.getTask(taskId);
    if (!existingTask) return res.status(404).json({ message: "Not found" });

    const updated = await storage.updateTask(taskId, req.body);

    const exec = await storage.getExecution(existingTask.executionId);
    const execName = exec ? `${exec.brand?.name || ''} - ${exec.title?.name || ''}` : `#${existingTask.executionId}`;

    if (req.body.assignedTo && req.body.assignedTo !== existingTask.assignedTo && req.body.assignedTo !== user.id) {
      await notificationCenter.sendNotification({
        recipientIds: await notificationCenter.getTaskRelatedUserIds(taskId),
        actorId: user.id,
        executionId: existingTask.executionId,
        entityType: "task",
        entityId: taskId,
        type: "task_assigned",
        payload: { taskTitle: existingTask.title, executionName: execName },
      });
    }

    if (req.body.status === "completed" && existingTask.status !== "completed") {
      await notificationCenter.sendNotification({
        recipientIds: await notificationCenter.getTaskRelatedUserIds(taskId),
        actorId: user.id,
        executionId: existingTask.executionId,
        entityType: "task",
        entityId: taskId,
        type: "task_completed",
        payload: { taskTitle: existingTask.title, executionName: execName },
      });
    }

    await automationService.evaluateTask(taskId);
    res.json(updated);
  });

  // === NOTIFICATIONS ===
  app.get("/api/notifications", requireAuth, async (req, res) => {
    const user = req.user as any;
    const limit = req.query.limit ? Number(req.query.limit) : 30;
    const category = parseNotificationCategory(req.query.category);
    const actorUserId = parseOptionalId(req.query.actorUserId);
    res.json(await notificationCenter.listNotificationsForUser(user, { limit, category, actorUserId }));
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json({ count: await notificationCenter.getUnreadCountForUser(user) });
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    const user = req.user as any;
    await notificationCenter.markNotificationReadForUser(Number(req.params.id), user);
    res.json({ ok: true });
  });

  app.post("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
    const user = req.user as any;
    await notificationCenter.markAllReadForUser(
      user,
      parseNotificationCategory(req.body?.category),
      parseOptionalId(req.body?.actorUserId),
    );
    res.json({ ok: true });
  });

  app.post("/api/notifications/delete-filtered", requireAuth, async (req, res) => {
    const user = req.user as any;
    const deleted = await notificationCenter.deleteFilteredNotificationsForUser(user, {
      category: parseNotificationCategory(req.body?.category),
      actorUserId: parseOptionalId(req.body?.actorUserId),
    });
    res.json({ ok: true, deleted });
  });

  // === CONVERSATIONS / CHAT ===
  app.get("/api/conversations", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json(await storage.getConversationsForUser(user.id));
  });

  app.get("/api/conversations/unread-count", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json({ count: await storage.getUnreadMessageCount(user.id) });
  });

  app.get("/api/conversations/:id", requireAuth, async (req, res) => {
    const conv = await storage.getConversation(Number(req.params.id));
    if (!conv) return res.status(404).json({ message: "Not found" });
    res.json(conv);
  });

  app.get("/api/executions/:id/conversation", requireAuth, async (req, res) => {
    const conv = await storage.getOrCreateConversationForExecution(Number(req.params.id));
    res.json(conv);
  });

  app.post("/api/conversations/direct", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { userId: targetUserId } = req.body;
    if (!targetUserId || targetUserId === user.id) {
      return res.status(400).json({ message: "Invalid user" });
    }
    const conv = await storage.getOrCreateDirectConversation(user.id, targetUserId);
    res.json(conv);
  });

  app.post("/api/conversations/group", requireAuth, async (req, res) => {
    const user = req.user as any;
    const { name, memberIds, executionId, countryId, titleId, studioId } = req.body;
    if (!name || !memberIds || !Array.isArray(memberIds)) {
      return res.status(400).json({ message: "Name and memberIds are required" });
    }
    const conv = await storage.createGroupConversation({
      name,
      createdBy: user.id,
      executionId: executionId || undefined,
      countryId: countryId || undefined,
      titleId: titleId || undefined,
      studioId: studioId || undefined,
      memberIds: Array.from(new Set([user.id, ...memberIds])),
    });
    res.json(conv);
  });

  app.get("/api/conversations/:id/members", requireAuth, async (req, res) => {
    const members = await storage.getConversationMembers(Number(req.params.id));
    res.json(members);
  });

  app.get("/api/mentions", requireAuth, async (req, res) => {
    const q = (req.query.q as string) || "";
    if (q.length < 1) return res.json([]);
    res.json(await storage.searchMentions(q));
  });

  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    const user = req.user as any;
    const convId = Number(req.params.id);
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const before = req.query.before ? Number(req.query.before) : undefined;
    const msgs = await storage.getMessages(convId, limit, before);
    await storage.updateLastRead(convId, user.id);
    res.json(msgs);
  });

  app.post("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    const user = req.user as any;
    const convId = Number(req.params.id);
    const messageBody = typeof req.body.body === "string" ? req.body.body.trim() : "";
    if (!messageBody) {
      return res.status(400).json({ message: "Message body is required" });
    }

    const msg = await storage.createMessage({
      conversationId: convId,
      senderId: user.id,
      body: messageBody,
    });

    if (req.body.links && Array.isArray(req.body.links)) {
      for (const link of req.body.links) {
        await storage.createMessageLink({
          messageId: msg.id,
          entityType: link.entityType,
          entityId: link.entityId,
          executionId: link.executionId || null,
        });
      }
    }

    const mentionRegex = /@\[([^\]]+)\]\(user:(\d+)\)/g;
    let match;
    const mentionedUserIds = new Set<number>();
    while ((match = mentionRegex.exec(messageBody)) !== null) {
      const mentionedUserId = Number(match[2]);
      if (mentionedUserId !== user.id) mentionedUserIds.add(mentionedUserId);
    }

    const conv = await storage.getConversation(convId);
    if (mentionedUserIds.size > 0) {
      await notificationCenter.sendNotification({
        recipientIds: Array.from(mentionedUserIds),
        actorId: user.id,
        executionId: conv?.executionId || null,
        entityType: "message",
        entityId: msg.id,
        type: "mention",
        payload: {
          conversationId: convId,
          conversationName: conv?.name || "Direct Message",
          messagePreview: messageBody.substring(0, 100),
        },
      });
    }

    await storage.updateLastRead(convId, user.id);
    const [enriched] = await storage.getMessages(convId, 1);
    res.json(enriched || msg);
  });

  // === EMAIL ===
  app.get("/api/email/providers/status", requireAuth, async (req, res) => {
    res.json({
      providers: emailService.getProviderStatuses(getBaseUrl(req)),
    });
  });

  app.post("/api/email/accounts/:provider/connect", requireAuth, async (req, res) => {
    try {
      const provider = parseEmailProvider(req.params.provider);
      const providerStatus = emailService.getProviderStatus(provider, getBaseUrl(req));
      if (!providerStatus.enabled) {
        return sendApiError(
          res,
          503,
          "EMAIL_PROVIDER_NOT_CONFIGURED",
          providerStatus.message,
          {
            provider,
            reason: providerStatus.reason,
            callbackUrl: providerStatus.callbackUrl,
            missingEnv: providerStatus.missingEnv,
          },
        );
      }

      const state = `${provider}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      (req.session as any).emailOAuthState = state;
      (req.session as any).emailOAuthProvider = provider;
      const authUrl = emailService.getAuthorizationUrl(provider, state, getBaseUrl(req));
      res.json({ authUrl });
    } catch (err: any) {
      return sendApiError(
        res,
        400,
        "EMAIL_CONNECT_INIT_FAILED",
        err.message || "Could not start the email OAuth flow",
      );
    }
  });

  app.get("/api/email/accounts/:provider/callback", async (req, res) => {
    try {
      const provider = parseEmailProvider(req.params.provider);
      if (!req.isAuthenticated()) {
        return res.redirect("/email?error=not_authenticated");
      }

      const sessionState = (req.session as any).emailOAuthState;
      const sessionProvider = (req.session as any).emailOAuthProvider;
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (!code || !state || state !== sessionState || provider !== sessionProvider) {
        return res.redirect("/email?error=invalid_oauth_state");
      }

      const user = req.user as any;
      await emailService.completeConnection(user.id, provider, code, getBaseUrl(req));
      delete (req.session as any).emailOAuthState;
      delete (req.session as any).emailOAuthProvider;
      res.redirect("/email?connected=1");
    } catch (err: any) {
      res.redirect(`/email?error=${encodeURIComponent(err.message || "email_connection_failed")}`);
    }
  });

  app.get("/api/email/accounts", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json(await emailService.listAccountsForUser(user.id));
  });

  app.delete("/api/email/accounts/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      await emailService.disconnectAccount(Number(req.params.id), user.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/email/accounts/:id/sync", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await emailService.syncAccount(Number(req.params.id), user.id, getBaseUrl(req));
      await automationService.refreshEmailPendingReplyAlerts();
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/email/webhooks/google", async (req, res) => {
    const result = await emailService.handleWebhook("google", req.body, req.query as Record<string, unknown>, getBaseUrl(req));
    if (result.validationToken) {
      return res.type("text/plain").send(result.validationToken);
    }
    await automationService.refreshEmailPendingReplyAlerts();
    res.json({ ok: true, syncedAccounts: result.syncedAccounts });
  });

  app.post("/api/email/webhooks/microsoft", async (req, res) => {
    const result = await emailService.handleWebhook("microsoft", req.body, req.query as Record<string, unknown>, getBaseUrl(req));
    if (result.validationToken) {
      return res.type("text/plain").send(result.validationToken);
    }
    await automationService.refreshEmailPendingReplyAlerts();
    res.json({ ok: true, syncedAccounts: result.syncedAccounts });
  });

  app.get("/api/email/threads", requireAuth, async (req, res) => {
    const user = req.user as any;
    const executionId = req.query.executionId ? Number(req.query.executionId) : undefined;
    const taskId = req.query.taskId ? Number(req.query.taskId) : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    res.json(await emailService.listThreadsForUser(user.id, { executionId, taskId, search }));
  });

  app.get("/api/email/threads/:id", requireAuth, async (req, res) => {
    const user = req.user as any;
    const thread = await emailService.getThreadForUser(Number(req.params.id), user.id);
    if (!thread) return res.status(404).json({ message: "Not found" });
    res.json(thread);
  });

  app.post("/api/email/messages/send", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const thread = await emailService.sendMessage(user.id, req.body, getBaseUrl(req));
      await automationService.evaluateThread(thread.id);
      res.json(thread);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/email/threads/:id/reply", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const thread = await emailService.replyToThread(user.id, Number(req.params.id), req.body.body || "", getBaseUrl(req));
      await automationService.evaluateThread(thread.id);
      res.json(thread);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/email/threads/:id/link", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const thread = await emailService.linkThread(
        Number(req.params.id),
        user.id,
        Number(req.body.executionId),
        req.body.taskId ? Number(req.body.taskId) : undefined,
      );
      await automationService.evaluateThread(thread.id);
      res.json(thread);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/campaigns/:id/gantt", requireAuth, async (req, res) => {
    const gantt = await automationService.getCampaignGantt(Number(req.params.id));
    if (!gantt) return res.status(404).json({ message: "Not found" });
    res.json(gantt);
  });

  return httpServer;
}
