import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import createMemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { storage } from "./storage";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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

  app.get("/api/executions/:id", requireAuth, async (req, res) => {
    const exec = await storage.getExecution(Number(req.params.id));
    if (!exec) return res.status(404).json({ message: "Not found" });
    res.json(exec);
  });

  app.post("/api/executions", requireRole("admin", "editor"), async (req, res) => {
    try {
      const exec = await storage.createExecution(req.body);
      res.json(exec);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/executions/:id", requireRole("admin", "editor"), async (req, res) => {
    const exec = await storage.updateExecution(Number(req.params.id), req.body);
    if (!exec) return res.status(404).json({ message: "Not found" });
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
      const recipientIds = new Set<number>();
      if (exec.ownerId && exec.ownerId !== user.id) recipientIds.add(exec.ownerId);
      if (exec.createdBy && exec.createdBy !== user.id) recipientIds.add(exec.createdBy);

      for (const recipientId of Array.from(recipientIds)) {
        await storage.createNotification({
          recipientId,
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
    }

    res.json({ ok: true });
  });

  // === ASSETS ===
  app.get("/api/executions/:id/assets", requireAuth, async (req, res) => {
    res.json(await storage.getAssets(Number(req.params.id)));
  });

  app.post("/api/executions/:id/assets", requireRole("admin", "editor"), async (req, res) => {
    const asset = await storage.createAsset({ ...req.body, executionId: Number(req.params.id) });
    res.json(asset);
  });

  // === STATUS HISTORY ===
  app.get("/api/executions/:id/history", requireAuth, async (req, res) => {
    res.json(await storage.getStatusHistory(Number(req.params.id)));
  });

  // === DASHBOARD ===
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    const filters = parseFilters(req.query);
    res.json(await storage.getDashboardStats(filters));
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
      await storage.createNotification({
        recipientId: task.assignedTo,
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
      await storage.createNotification({
        recipientId: req.body.assignedTo,
        actorId: user.id,
        executionId: existingTask.executionId,
        entityType: "task",
        entityId: taskId,
        type: "task_assigned",
        payload: { taskTitle: existingTask.title, executionName: execName },
      });
    }

    if (req.body.status === "completed" && existingTask.status !== "completed") {
      const notifyIds = new Set<number>();
      if (existingTask.createdBy && existingTask.createdBy !== user.id) notifyIds.add(existingTask.createdBy);
      if (existingTask.assignedTo && existingTask.assignedTo !== user.id) notifyIds.add(existingTask.assignedTo);

      for (const recipientId of Array.from(notifyIds)) {
        await storage.createNotification({
          recipientId,
          actorId: user.id,
          executionId: existingTask.executionId,
          entityType: "task",
          entityId: taskId,
          type: "task_completed",
          payload: { taskTitle: existingTask.title, executionName: execName },
        });
      }
    }

    res.json(updated);
  });

  // === NOTIFICATIONS ===
  app.get("/api/notifications", requireAuth, async (req, res) => {
    const user = req.user as any;
    const limit = req.query.limit ? Number(req.query.limit) : 30;
    res.json(await storage.getNotifications(user.id, limit));
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    const user = req.user as any;
    res.json({ count: await storage.getUnreadNotificationCount(user.id) });
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    const user = req.user as any;
    await storage.markNotificationRead(Number(req.params.id), user.id);
    res.json({ ok: true });
  });

  app.post("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
    const user = req.user as any;
    await storage.markAllNotificationsRead(user.id);
    res.json({ ok: true });
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
    for (const recipientId of Array.from(mentionedUserIds)) {
      await storage.createNotification({
        recipientId,
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

  return httpServer;
}
