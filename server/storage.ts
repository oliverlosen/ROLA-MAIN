import { eq, and, desc, asc, sql, gte, lte, inArray, count, isNull, ne, gt } from "drizzle-orm";
import { db } from "./db";
import {
  users, countries, brands, titles, studios, executions, assets, statusHistory, fxDefaults,
  tasks, notifications, conversations, conversationMembers, messages, messageLinks,
  type InsertUser, type User, type InsertCountry, type Country,
  type InsertBrand, type Brand, type InsertTitle, type Title,
  type InsertStudio, type Studio, type InsertExecution, type Execution,
  type InsertAsset, type Asset, type InsertStatusHistory, type StatusHistoryEntry,
  type ExecutionWithDetails,
  type Task, type InsertTask, type TaskWithAssignee,
  type Notification, type InsertNotification, type NotificationWithActor,
  type Conversation, type InsertConversation, type ConversationWithDetails,
  type Message, type InsertMessage, type MessageWithSender,
  type MessageLink, type InsertMessageLink,
} from "@shared/schema";
import bcrypt from "bcryptjs";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: { displayName?: string; password?: string; role?: string }): Promise<Omit<User, "password"> | undefined>;
  deleteUser(id: number): Promise<void>;
  getUsers(): Promise<Omit<User, "password">[]>;

  getCountries(): Promise<Country[]>;
  createCountry(c: InsertCountry): Promise<Country>;
  updateCountry(id: number, c: Partial<InsertCountry>): Promise<Country | undefined>;
  deleteCountry(id: number): Promise<void>;

  getBrands(): Promise<Brand[]>;
  createBrand(b: InsertBrand): Promise<Brand>;
  updateBrand(id: number, b: Partial<InsertBrand>): Promise<Brand | undefined>;
  deleteBrand(id: number): Promise<void>;

  getTitles(): Promise<Title[]>;
  createTitle(t: InsertTitle): Promise<Title>;
  updateTitle(id: number, t: Partial<InsertTitle>): Promise<Title | undefined>;
  deleteTitle(id: number): Promise<void>;

  getStudios(): Promise<Studio[]>;
  createStudio(s: InsertStudio): Promise<Studio>;
  updateStudio(id: number, s: Partial<InsertStudio>): Promise<Studio | undefined>;
  deleteStudio(id: number): Promise<void>;

  getExecutions(filters: any): Promise<{ executions: ExecutionWithDetails[]; total: number }>;
  getExecution(id: number): Promise<ExecutionWithDetails | undefined>;
  createExecution(e: InsertExecution): Promise<Execution>;
  updateExecution(id: number, e: Partial<InsertExecution>): Promise<Execution | undefined>;
  updateExecutionStatus(id: number, status: string, userId: number): Promise<void>;

  getAssets(executionId: number): Promise<Asset[]>;
  createAsset(a: InsertAsset): Promise<Asset>;

  getStatusHistory(executionId: number): Promise<(StatusHistoryEntry & { changedByName?: string })[]>;

  getDashboardStats(filters: any): Promise<any>;

  // Tasks
  getTasks(executionId: number): Promise<TaskWithAssignee[]>;
  getTask(id: number): Promise<TaskWithAssignee | undefined>;
  createTask(t: InsertTask): Promise<Task>;
  updateTask(id: number, t: Partial<InsertTask>): Promise<Task | undefined>;

  // Notifications
  getNotifications(userId: number, limit?: number): Promise<NotificationWithActor[]>;
  getUnreadNotificationCount(userId: number): Promise<number>;
  markNotificationRead(id: number, userId: number): Promise<void>;
  markAllNotificationsRead(userId: number): Promise<void>;
  createNotification(n: InsertNotification): Promise<Notification>;

  // Conversations
  getConversationsForUser(userId: number): Promise<ConversationWithDetails[]>;
  getConversation(id: number): Promise<Conversation | undefined>;
  getOrCreateConversationForExecution(executionId: number): Promise<Conversation>;
  getOrCreateDirectConversation(userId1: number, userId2: number): Promise<Conversation>;
  createGroupConversation(data: { name: string; createdBy: number; executionId?: number; countryId?: number; titleId?: number; studioId?: number; memberIds: number[] }): Promise<Conversation>;
  addConversationMember(conversationId: number, userId: number, role?: string): Promise<void>;
  ensureAllUsersInConversation(conversationId: number): Promise<void>;
  updateLastRead(conversationId: number, userId: number): Promise<void>;
  getConversationMembers(conversationId: number): Promise<Omit<User, "password">[]>;

  // Messages
  getMessages(conversationId: number, limit?: number, before?: number): Promise<MessageWithSender[]>;
  createMessage(m: InsertMessage): Promise<Message>;
  createMessageLink(link: InsertMessageLink): Promise<MessageLink>;
  getUnreadMessageCount(userId: number): Promise<number>;

  // Mentions search
  searchMentions(query: string): Promise<{ type: string; id: number; name: string }[]>;

  seedData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    const [created] = await db.insert(users).values({ ...user, password: hashedPassword }).returning();
    return created;
  }

  async updateUser(id: number, data: { displayName?: string; password?: string; role?: string }): Promise<Omit<User, "password"> | undefined> {
    const updates: any = {};
    if (data.displayName !== undefined) updates.displayName = data.displayName;
    if (data.role !== undefined) updates.role = data.role;
    if (data.password) updates.password = await bcrypt.hash(data.password, 10);
    if (Object.keys(updates).length === 0) return undefined;
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!updated) return undefined;
    const { password: _, ...safe } = updated;
    return safe;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getUsers(): Promise<Omit<User, "password">[]> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
    }).from(users);
    return result;
  }

  async getCountries(): Promise<Country[]> {
    return db.select().from(countries).orderBy(asc(countries.name));
  }
  async createCountry(c: InsertCountry): Promise<Country> {
    const [r] = await db.insert(countries).values(c).returning();
    return r;
  }
  async updateCountry(id: number, c: Partial<InsertCountry>): Promise<Country | undefined> {
    const [r] = await db.update(countries).set(c).where(eq(countries.id, id)).returning();
    return r;
  }
  async deleteCountry(id: number): Promise<void> {
    await db.delete(countries).where(eq(countries.id, id));
  }

  async getBrands(): Promise<Brand[]> {
    return db.select().from(brands).orderBy(asc(brands.name));
  }
  async createBrand(b: InsertBrand): Promise<Brand> {
    const [r] = await db.insert(brands).values(b).returning();
    return r;
  }
  async updateBrand(id: number, b: Partial<InsertBrand>): Promise<Brand | undefined> {
    const [r] = await db.update(brands).set(b).where(eq(brands.id, id)).returning();
    return r;
  }
  async deleteBrand(id: number): Promise<void> {
    await db.delete(brands).where(eq(brands.id, id));
  }

  async getTitles(): Promise<Title[]> {
    return db.select().from(titles).orderBy(asc(titles.name));
  }
  async createTitle(t: InsertTitle): Promise<Title> {
    const [r] = await db.insert(titles).values(t).returning();
    return r;
  }
  async updateTitle(id: number, t: Partial<InsertTitle>): Promise<Title | undefined> {
    const [r] = await db.update(titles).set(t).where(eq(titles.id, id)).returning();
    return r;
  }
  async deleteTitle(id: number): Promise<void> {
    await db.delete(titles).where(eq(titles.id, id));
  }

  async getStudios(): Promise<Studio[]> {
    return db.select().from(studios).orderBy(asc(studios.name));
  }
  async createStudio(s: InsertStudio): Promise<Studio> {
    const [r] = await db.insert(studios).values(s).returning();
    return r;
  }
  async updateStudio(id: number, s: Partial<InsertStudio>): Promise<Studio | undefined> {
    const [r] = await db.update(studios).set(s).where(eq(studios.id, id)).returning();
    return r;
  }
  async deleteStudio(id: number): Promise<void> {
    await db.delete(studios).where(eq(studios.id, id));
  }

  async getExecutions(filters: any): Promise<{ executions: ExecutionWithDetails[]; total: number }> {
    const conditions: any[] = [];

    if (filters.dateFrom) conditions.push(gte(executions.executionDate, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(executions.executionDate, filters.dateTo));
    if (filters.countries?.length) conditions.push(inArray(executions.countryId, filters.countries));
    if (filters.brands?.length) conditions.push(inArray(executions.brandId, filters.brands));
    if (filters.titles?.length) conditions.push(inArray(executions.titleId, filters.titles));
    if (filters.studios?.length) conditions.push(inArray(executions.studioId, filters.studios));
    if (filters.executionTypes?.length) conditions.push(inArray(executions.executionType, filters.executionTypes));
    if (filters.statuses?.length) conditions.push(inArray(executions.status, filters.statuses));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(executions).where(whereClause);
    const total = totalResult?.count || 0;

    const sortCol = filters.sortBy === "media_value_usd" ? executions.mediaValueUsd
      : filters.sortBy === "execution_type" ? executions.executionType
      : executions.executionDate;
    const sortFn = filters.sortDir === "asc" ? asc : desc;

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const rows = await db.select().from(executions)
      .where(whereClause)
      .orderBy(sortFn(sortCol))
      .limit(limit)
      .offset(offset);

    const enriched: ExecutionWithDetails[] = await Promise.all(
      rows.map(async (row) => {
        const [country] = row.countryId ? await db.select().from(countries).where(eq(countries.id, row.countryId)) : [undefined];
        const [brand] = row.brandId ? await db.select().from(brands).where(eq(brands.id, row.brandId)) : [undefined];
        const [title] = row.titleId ? await db.select().from(titles).where(eq(titles.id, row.titleId)) : [undefined];
        const [studio] = row.studioId ? await db.select().from(studios).where(eq(studios.id, row.studioId)) : [undefined];
        const [owner] = row.ownerId ? await db.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users).where(eq(users.id, row.ownerId)) : [undefined];

        return {
          ...row,
          country: country || undefined,
          brand: brand || undefined,
          title: title || null,
          studio: studio || null,
          owner: owner || null,
        };
      })
    );

    return { executions: enriched, total };
  }

  async getExecution(id: number): Promise<ExecutionWithDetails | undefined> {
    const [row] = await db.select().from(executions).where(eq(executions.id, id));
    if (!row) return undefined;

    const [country] = row.countryId ? await db.select().from(countries).where(eq(countries.id, row.countryId)) : [undefined];
    const [brand] = row.brandId ? await db.select().from(brands).where(eq(brands.id, row.brandId)) : [undefined];
    const [title] = row.titleId ? await db.select().from(titles).where(eq(titles.id, row.titleId)) : [undefined];
    const [studio] = row.studioId ? await db.select().from(studios).where(eq(studios.id, row.studioId)) : [undefined];
    const [owner] = row.ownerId ? await db.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users).where(eq(users.id, row.ownerId)) : [undefined];

    return { ...row, country, brand, title, studio, owner };
  }

  async createExecution(e: InsertExecution): Promise<Execution> {
    const [r] = await db.insert(executions).values(e).returning();
    await db.insert(statusHistory).values({
      executionId: r.id,
      status: r.status,
      changedBy: e.createdBy || null,
    });
    return r;
  }

  async updateExecution(id: number, e: Partial<InsertExecution>): Promise<Execution | undefined> {
    const [r] = await db.update(executions)
      .set({ ...e, updatedAt: new Date() })
      .where(eq(executions.id, id))
      .returning();
    return r;
  }

  async updateExecutionStatus(id: number, status: string, userId: number): Promise<void> {
    await db.update(executions)
      .set({ status: status as any, updatedAt: new Date(), updatedBy: userId })
      .where(eq(executions.id, id));
    await db.insert(statusHistory).values({
      executionId: id,
      status: status as any,
      changedBy: userId,
    });
  }

  async getAssets(executionId: number): Promise<Asset[]> {
    return db.select().from(assets).where(eq(assets.executionId, executionId)).orderBy(desc(assets.uploadedAt));
  }

  async createAsset(a: InsertAsset): Promise<Asset> {
    const [r] = await db.insert(assets).values(a).returning();
    return r;
  }

  async getStatusHistory(executionId: number): Promise<(StatusHistoryEntry & { changedByName?: string })[]> {
    const rows = await db.select().from(statusHistory)
      .where(eq(statusHistory.executionId, executionId))
      .orderBy(desc(statusHistory.changedAt));

    return Promise.all(rows.map(async (row) => {
      let changedByName = "System";
      if (row.changedBy) {
        const [u] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, row.changedBy));
        if (u) changedByName = u.displayName;
      }
      return { ...row, changedByName };
    }));
  }

  async getDashboardStats(filters: any): Promise<any> {
    const conditions: any[] = [];
    if (filters.dateFrom) conditions.push(gte(executions.executionDate, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(executions.executionDate, filters.dateTo));
    if (filters.countries?.length) conditions.push(inArray(executions.countryId, filters.countries));
    if (filters.brands?.length) conditions.push(inArray(executions.brandId, filters.brands));
    if (filters.titles?.length) conditions.push(inArray(executions.titleId, filters.titles));
    if (filters.studios?.length) conditions.push(inArray(executions.studioId, filters.studios));
    if (filters.executionTypes?.length) conditions.push(inArray(executions.executionType, filters.executionTypes));
    if (filters.statuses?.length) conditions.push(inArray(executions.status, filters.statuses));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const mediaValueUsdSum = sql<number>`COALESCE(SUM(CAST(${executions.mediaValueUsd} AS REAL)), 0)`;
    const trendPeriod = sql<string>`substr(${executions.executionDate}, 1, 7)`;

    const [totals] = await db.select({
      totalMediaValueUsd: mediaValueUsdSum,
      executionCount: count(),
    }).from(executions).where(whereClause);

    const totalMediaValueUsd = Number(totals?.totalMediaValueUsd || 0);
    const executionCount = Number(totals?.executionCount || 0);
    const avgMediaValueUsd = executionCount > 0 ? totalMediaValueUsd / executionCount : 0;

    const byType = await db.select({
      type: executions.executionType,
      count: count(),
      value: mediaValueUsdSum,
    }).from(executions).where(whereClause).groupBy(executions.executionType);

    const byStatus = await db.select({
      status: executions.status,
      count: count(),
    }).from(executions).where(whereClause).groupBy(executions.status);

    const byCountryRaw = await db.select({
      countryId: executions.countryId,
      value: mediaValueUsdSum,
    }).from(executions).where(whereClause).groupBy(executions.countryId).orderBy(sql`SUM(CAST(${executions.mediaValueUsd} AS REAL)) DESC`);

    const byCountry = await Promise.all(byCountryRaw.map(async (r) => {
      const [c] = await db.select({ name: countries.name }).from(countries).where(eq(countries.id, r.countryId));
      return { name: c?.name || "Unknown", value: Number(r.value) };
    }));

    const byBrandRaw = await db.select({
      brandId: executions.brandId,
      value: mediaValueUsdSum,
    }).from(executions).where(whereClause).groupBy(executions.brandId).orderBy(sql`SUM(CAST(${executions.mediaValueUsd} AS REAL)) DESC`);

    const byBrand = await Promise.all(byBrandRaw.map(async (r) => {
      const [b] = await db.select({ name: brands.name }).from(brands).where(eq(brands.id, r.brandId));
      return { name: b?.name || "Unknown", value: Number(r.value) };
    }));

    const trendRaw = await db.select({
      period: trendPeriod,
      value: mediaValueUsdSum,
    }).from(executions).where(whereClause).groupBy(trendPeriod).orderBy(trendPeriod);

    return {
      totalMediaValueUsd,
      executionCount,
      avgMediaValueUsd,
      byType: byType.map(t => ({ type: t.type, count: Number(t.count), value: Number(t.value) })),
      byStatus: byStatus.map(s => ({ status: s.status, count: Number(s.count) })),
      byCountry,
      byBrand,
      trend: trendRaw.map(t => ({ period: t.period, value: Number(t.value) })),
    };
  }

  // === TASKS ===
  async getTasks(executionId: number): Promise<TaskWithAssignee[]> {
    const rows = await db.select().from(tasks)
      .where(eq(tasks.executionId, executionId))
      .orderBy(desc(tasks.createdAt));
    return Promise.all(rows.map(async (row) => {
      let assignee = null;
      let creator = null;
      if (row.assignedTo) {
        const [u] = await db.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users).where(eq(users.id, row.assignedTo));
        assignee = u || null;
      }
      if (row.createdBy) {
        const [u] = await db.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users).where(eq(users.id, row.createdBy));
        creator = u || null;
      }
      return { ...row, assignee, creator };
    }));
  }

  async getTask(id: number): Promise<TaskWithAssignee | undefined> {
    const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!row) return undefined;
    let assignee = null;
    let creator = null;
    if (row.assignedTo) {
      const [u] = await db.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users).where(eq(users.id, row.assignedTo));
      assignee = u || null;
    }
    if (row.createdBy) {
      const [u] = await db.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users).where(eq(users.id, row.createdBy));
      creator = u || null;
    }
    return { ...row, assignee, creator };
  }

  async createTask(t: InsertTask): Promise<Task> {
    const [r] = await db.insert(tasks).values(t).returning();
    return r;
  }

  async updateTask(id: number, t: Partial<InsertTask>): Promise<Task | undefined> {
    const [r] = await db.update(tasks).set(t).where(eq(tasks.id, id)).returning();
    return r;
  }

  // === NOTIFICATIONS ===
  async getNotifications(userId: number, limit = 30): Promise<NotificationWithActor[]> {
    const rows = await db.select().from(notifications)
      .where(eq(notifications.recipientId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    return Promise.all(rows.map(async (row) => {
      let actor = null;
      if (row.actorId) {
        const [u] = await db.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users).where(eq(users.id, row.actorId));
        actor = u || null;
      }
      return { ...row, actor };
    }));
  }

  async getUnreadNotificationCount(userId: number): Promise<number> {
    const [result] = await db.select({ count: count() }).from(notifications)
      .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
    return result?.count || 0;
  }

  async markNotificationRead(id: number, userId: number): Promise<void> {
    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.recipientId, userId)));
  }

  async markAllNotificationsRead(userId: number): Promise<void> {
    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.recipientId, userId), isNull(notifications.readAt)));
  }

  async createNotification(n: InsertNotification): Promise<Notification> {
    const [r] = await db.insert(notifications).values(n).returning();
    return r;
  }

  // === CONVERSATIONS ===
  private async buildConversationContextSummary(conv: Conversation): Promise<string | null> {
    const tags: string[] = [];

    if (conv.executionId) {
      const exec = await this.getExecution(conv.executionId);
      const projectName = [exec?.brand?.name, exec?.title?.name].filter(Boolean).join(" - ");
      if (projectName) tags.push(projectName);
    }

    if (conv.countryId) {
      const [country] = await db.select({ name: countries.name }).from(countries).where(eq(countries.id, conv.countryId));
      if (country?.name) tags.push(country.name);
    }

    if (conv.titleId) {
      const [title] = await db.select({ name: titles.name }).from(titles).where(eq(titles.id, conv.titleId));
      if (title?.name) tags.push(title.name);
    }

    if (conv.studioId) {
      const [studio] = await db.select({ name: studios.name }).from(studios).where(eq(studios.id, conv.studioId));
      if (studio?.name) tags.push(studio.name);
    }

    return tags.length > 0 ? tags.join(" · ") : null;
  }

  async getConversationsForUser(userId: number): Promise<ConversationWithDetails[]> {
    const memberRows = await db.select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId));

    if (memberRows.length === 0) return [];

    const convIds = memberRows.map(r => r.conversationId);
    const convRows = await db.select().from(conversations)
      .where(inArray(conversations.id, convIds))
      .orderBy(desc(conversations.createdAt));

    const enriched = await Promise.all(convRows.map(async (conv) => {
      let executionName: string | undefined;
      let displayName: string | undefined;
      let subtitle: string | null = null;
      let contextSummary: string | null = null;
      let memberNamesPreview: string[] = [];
      let avatarInitials: string | undefined;

      const memberRows = await db.select({
        userId: conversationMembers.userId,
        displayName: users.displayName,
        username: users.username,
      }).from(conversationMembers)
        .innerJoin(users, eq(conversationMembers.userId, users.id))
        .where(eq(conversationMembers.conversationId, conv.id));

      const otherMembers = memberRows.filter((member) => member.userId !== userId);
      memberNamesPreview = otherMembers.slice(0, 3).map((member) => member.displayName);

      if (conv.type === "execution" && conv.executionId) {
        const fullExec = await this.getExecution(conv.executionId);
        const projectName = [fullExec?.brand?.name, fullExec?.title?.name].filter(Boolean).join(" - ");
        executionName = projectName || `Proyecto #${conv.executionId}`;
        displayName = executionName;
        subtitle = fullExec?.country?.name || null;
        contextSummary = [fullExec?.studio?.name].filter(Boolean).join(" · ") || null;
        avatarInitials = (fullExec?.brand?.name?.charAt(0) || "E") + (fullExec?.title?.name?.charAt(0) || "");
      } else if (conv.type === "direct") {
        const otherUser = otherMembers[0];
        if (otherUser) {
          displayName = otherUser.displayName || "Unknown";
          subtitle = otherUser.username ? `@${otherUser.username}` : null;
          contextSummary = null;
          avatarInitials = displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
        } else {
          displayName = "Direct Message";
          subtitle = null;
          avatarInitials = "DM";
        }
      } else if (conv.type === "group") {
        displayName = conv.name || "Group";
        avatarInitials = displayName.slice(0, 2).toUpperCase();
        contextSummary = await this.buildConversationContextSummary(conv);
      }

      const [memberRow] = await db.select({ lastReadAt: conversationMembers.lastReadAt })
        .from(conversationMembers)
        .where(and(eq(conversationMembers.conversationId, conv.id), eq(conversationMembers.userId, userId)));

      const lastReadAt = memberRow?.lastReadAt;
      let unreadCount = 0;
      if (lastReadAt) {
        const [unreadResult] = await db.select({ count: count() }).from(messages)
          .where(and(
            eq(messages.conversationId, conv.id),
            gt(messages.createdAt, lastReadAt),
            ne(messages.senderId, userId)
          ));
        unreadCount = unreadResult?.count || 0;
      } else {
        const [unreadResult] = await db.select({ count: count() }).from(messages)
          .where(and(eq(messages.conversationId, conv.id), ne(messages.senderId, userId)));
        unreadCount = unreadResult?.count || 0;
      }

      const [lastMsg] = await db.select().from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      let lastMessage = null;
      if (lastMsg) {
        let senderName = "Unknown";
        const [sender] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, lastMsg.senderId));
        if (sender) senderName = sender.displayName;
        lastMessage = { body: lastMsg.body, createdAt: lastMsg.createdAt, senderName };
      }

      const [memberCountResult] = await db.select({ count: count() }).from(conversationMembers)
        .where(eq(conversationMembers.conversationId, conv.id));

      const memberCount = Number(memberCountResult?.count || 0);
      if (conv.type === "group" && !subtitle) {
        subtitle = null;
      }

      return {
        ...conv,
        executionName,
        displayName,
        subtitle,
        contextSummary,
        memberNamesPreview,
        avatarInitials,
        unreadCount,
        lastMessage,
        memberCount,
      };
    }));

    return enriched.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return bTime - aTime;
    });
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
    return row;
  }

  async getOrCreateConversationForExecution(executionId: number): Promise<Conversation> {
    const [existing] = await db.select().from(conversations)
      .where(and(eq(conversations.executionId, executionId), eq(conversations.type, "execution")));
    if (existing) return existing;

    const [conv] = await db.insert(conversations)
      .values({ executionId, type: "execution" })
      .returning();

    await this.ensureAllUsersInConversation(conv.id);
    return conv;
  }

  async getOrCreateDirectConversation(userId1: number, userId2: number): Promise<Conversation> {
    const user1Convs = await db.select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId1));

    if (user1Convs.length > 0) {
      const user1ConvIds = user1Convs.map(r => r.conversationId);
      const directConvs = await db.select().from(conversations)
        .where(and(inArray(conversations.id, user1ConvIds), eq(conversations.type, "direct")));

      for (const conv of directConvs) {
        const members = await db.select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(eq(conversationMembers.conversationId, conv.id));
        const memberIds = members.map(m => m.userId);
        if (memberIds.length === 2 && memberIds.includes(userId1) && memberIds.includes(userId2)) {
          return conv;
        }
      }
    }

    const [conv] = await db.insert(conversations)
      .values({ type: "direct" })
      .returning();

    await this.addConversationMember(conv.id, userId1);
    await this.addConversationMember(conv.id, userId2);
    return conv;
  }

  async createGroupConversation(data: { name: string; createdBy: number; executionId?: number; countryId?: number; titleId?: number; studioId?: number; memberIds: number[] }): Promise<Conversation> {
    const [conv] = await db.insert(conversations)
      .values({
        type: "group",
        name: data.name,
        executionId: data.executionId || null,
        countryId: data.countryId || null,
        titleId: data.titleId || null,
        studioId: data.studioId || null,
        createdBy: data.createdBy,
      })
      .returning();

    await this.addConversationMember(conv.id, data.createdBy, "admin");
    for (const memberId of data.memberIds) {
      if (memberId !== data.createdBy) {
        await this.addConversationMember(conv.id, memberId);
      }
    }

    return conv;
  }

  async addConversationMember(conversationId: number, userId: number, role = "member"): Promise<void> {
    const [existing] = await db.select().from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
    if (!existing) {
      await db.insert(conversationMembers).values({ conversationId, userId, role });
    }
  }

  async ensureAllUsersInConversation(conversationId: number): Promise<void> {
    const allUsers = await db.select({ id: users.id }).from(users);
    for (const u of allUsers) {
      await this.addConversationMember(conversationId, u.id);
    }
  }

  async updateLastRead(conversationId: number, userId: number): Promise<void> {
    await db.update(conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
  }

  async getConversationMembers(conversationId: number): Promise<Omit<User, "password">[]> {
    const rows = await db.select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
    }).from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.id))
      .where(eq(conversationMembers.conversationId, conversationId));
    return rows;
  }

  async searchMentions(query: string): Promise<{ type: string; id: number; name: string }[]> {
    const q = `%${query.toLowerCase()}%`;
    const results: { type: string; id: number; name: string }[] = [];

    const userResults = await db.select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(sql`LOWER(${users.displayName}) LIKE ${q}`)
      .limit(5);
    results.push(...userResults.map(u => ({ type: "user", id: u.id, name: u.displayName })));

    const countryResults = await db.select({ id: countries.id, name: countries.name })
      .from(countries)
      .where(sql`LOWER(${countries.name}) LIKE ${q}`)
      .limit(5);
    results.push(...countryResults.map(c => ({ type: "country", id: c.id, name: c.name })));

    const titleResults = await db.select({ id: titles.id, name: titles.name })
      .from(titles)
      .where(sql`LOWER(${titles.name}) LIKE ${q}`)
      .limit(5);
    results.push(...titleResults.map(t => ({ type: "title", id: t.id, name: t.name })));

    const studioResults = await db.select({ id: studios.id, name: studios.name })
      .from(studios)
      .where(sql`LOWER(${studios.name}) LIKE ${q}`)
      .limit(5);
    results.push(...studioResults.map(s => ({ type: "studio", id: s.id, name: s.name })));

    const brandResults = await db.select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(sql`LOWER(${brands.name}) LIKE ${q}`)
      .limit(5);
    results.push(...brandResults.map(b => ({ type: "brand", id: b.id, name: b.name })));

    const executionRows = await db.select({
      id: executions.id,
      brandId: executions.brandId,
      titleId: executions.titleId,
      countryId: executions.countryId,
    }).from(executions)
      .orderBy(desc(executions.createdAt))
      .limit(40);

    const projectResults = await Promise.all(executionRows.map(async (execution) => {
      const [brand] = await db.select({ name: brands.name }).from(brands).where(eq(brands.id, execution.brandId));
      const [title] = execution.titleId
        ? await db.select({ name: titles.name }).from(titles).where(eq(titles.id, execution.titleId))
        : [undefined];
      const [country] = await db.select({ name: countries.name }).from(countries).where(eq(countries.id, execution.countryId));

      const name = [brand?.name, title?.name].filter(Boolean).join(" - ") || `Proyecto #${execution.id}`;
      const fullName = country?.name ? `${name} (${country.name})` : name;
      if (!fullName.toLowerCase().includes(query.toLowerCase())) return null;

      return { type: "project", id: execution.id, name: fullName };
    }));

    results.push(...projectResults.filter((item): item is { type: string; id: number; name: string } => Boolean(item)));

    return results.slice(0, 15);
  }

  // === MESSAGES ===
  async getMessages(conversationId: number, limit = 50, before?: number): Promise<MessageWithSender[]> {
    const conditions = [eq(messages.conversationId, conversationId)];
    if (before) {
      conditions.push(sql`${messages.id} < ${before}`);
    }
    const rows = await db.select().from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    const enriched = await Promise.all(rows.map(async (msg) => {
      const [sender] = await db.select({ id: users.id, displayName: users.displayName, username: users.username }).from(users).where(eq(users.id, msg.senderId));
      const links = await db.select().from(messageLinks).where(eq(messageLinks.messageId, msg.id));
      return { ...msg, sender: sender || null, links };
    }));

    return enriched.reverse();
  }

  async createMessage(m: InsertMessage): Promise<Message> {
    const [r] = await db.insert(messages).values(m).returning();
    return r;
  }

  async createMessageLink(link: InsertMessageLink): Promise<MessageLink> {
    const [r] = await db.insert(messageLinks).values(link).returning();
    return r;
  }

  async getUnreadMessageCount(userId: number): Promise<number> {
    const memberRows = await db.select({
      conversationId: conversationMembers.conversationId,
      lastReadAt: conversationMembers.lastReadAt,
    }).from(conversationMembers).where(eq(conversationMembers.userId, userId));

    let total = 0;
    for (const mr of memberRows) {
      const conditions = [
        eq(messages.conversationId, mr.conversationId),
        ne(messages.senderId, userId),
      ];
      if (mr.lastReadAt) {
        conditions.push(gt(messages.createdAt, mr.lastReadAt));
      }
      const [result] = await db.select({ count: count() }).from(messages).where(and(...conditions));
      total += result?.count || 0;
    }
    return total;
  }

  async seedData(): Promise<void> {
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) return;

    const adminPassword = await bcrypt.hash("admin123", 10);
    const editorPassword = await bcrypt.hash("editor123", 10);

    await db.insert(users).values([
      { username: "admin", password: adminPassword, displayName: "Admin User", role: "admin" },
      { username: "editor", password: editorPassword, displayName: "Maria Garcia", role: "editor" },
      { username: "viewer", password: await bcrypt.hash("viewer123", 10), displayName: "Carlos Lopez", role: "viewer" },
      { username: "approver", password: await bcrypt.hash("approver123", 10), displayName: "Ana Martinez", role: "approver" },
    ]);

    const countryData = [
      { name: "Guatemala", code: "GT" },
      { name: "El Salvador", code: "SV" },
      { name: "Honduras", code: "HN" },
      { name: "Nicaragua", code: "NI" },
      { name: "Costa Rica", code: "CR" },
      { name: "Panama", code: "PA" },
      { name: "Belize", code: "BZ" },
      { name: "Regional", code: "REG" },
    ];
    await db.insert(countries).values(countryData);

    const brandData = [
      { name: "Coca-Cola" }, { name: "Pepsi" }, { name: "Claro" }, { name: "Tigo" },
      { name: "Samsung" }, { name: "Toyota" }, { name: "Netflix" }, { name: "Spotify" },
    ];
    await db.insert(brands).values(brandData);

    const titleData = [
      { name: "Avatar: The Way of Water" }, { name: "Spider-Man: Across the Spider-Verse" },
      { name: "Barbie" }, { name: "Oppenheimer" }, { name: "The Super Mario Bros. Movie" },
      { name: "Guardians of the Galaxy Vol. 3" },
    ];
    await db.insert(titles).values(titleData);

    const studioData = [
      { name: "Universal Pictures" }, { name: "Warner Bros." }, { name: "Disney" },
      { name: "Sony Pictures" }, { name: "Paramount" },
    ];
    await db.insert(studios).values(studioData);

    const allCountries = await db.select().from(countries);
    const allBrands = await db.select().from(brands);
    const allTitles = await db.select().from(titles);
    const allStudios = await db.select().from(studios);
    const allUsers = await db.select().from(users);
    const editor = allUsers.find(u => u.username === "editor");

    const executionSeeds = [
      {
        countryId: allCountries[0].id, brandId: allBrands[0].id, titleId: allTitles[0].id, studioId: allStudios[2].id,
        executionDate: "2025-11-15", executionType: "publicity" as const, mediaValueLocal: "125000", localCurrency: "GTQ" as const,
        fxRateUsed: "7.75", mediaValueUsd: "16129.03", status: "executed" as const, ownerId: editor?.id,
        hasClipping: true, hasPhotos: true, notes: "Major cinema campaign launch in Guatemala City", createdBy: editor?.id,
      },
      {
        countryId: allCountries[1].id, brandId: allBrands[2].id, titleId: allTitles[1].id, studioId: allStudios[3].id,
        executionDate: "2025-12-01", executionType: "canje" as const, mediaValueLocal: "8500", localCurrency: "USD" as const,
        fxRateUsed: "1", mediaValueUsd: "8500", status: "closed" as const, ownerId: editor?.id,
        hasClipping: true, hasPhotos: true, hasLinks: true, notes: "Social media trade deal with Claro for Spider-Verse", createdBy: editor?.id,
      },
      {
        countryId: allCountries[2].id, brandId: allBrands[3].id, titleId: allTitles[2].id, studioId: allStudios[1].id,
        executionDate: "2026-01-10", executionType: "third_party" as const, mediaValueLocal: "185000", localCurrency: "HNL" as const,
        fxRateUsed: "24.85", mediaValueUsd: "7444.67", status: "in_review" as const, ownerId: editor?.id,
        hasInvoice: true, hasContract: true, notes: "Third party activation with Tigo in Tegucigalpa", createdBy: editor?.id,
      },
      {
        countryId: allCountries[4].id, brandId: allBrands[4].id, titleId: allTitles[3].id, studioId: allStudios[0].id,
        executionDate: "2026-01-20", executionType: "publicity" as const, mediaValueLocal: "12500000", localCurrency: "CRC" as const,
        fxRateUsed: "510.25", mediaValueUsd: "24501.47", status: "approved" as const, ownerId: editor?.id,
        hasClipping: true, notes: "Press coverage for Oppenheimer premiere", createdBy: editor?.id,
      },
      {
        countryId: allCountries[5].id, brandId: allBrands[6].id, titleId: allTitles[4].id, studioId: allStudios[0].id,
        executionDate: "2026-02-01", executionType: "publicity" as const, mediaValueLocal: "15000", localCurrency: "USD" as const,
        fxRateUsed: "1", mediaValueUsd: "15000", status: "draft" as const, ownerId: editor?.id,
        notes: "Netflix cross-promotion with Super Mario Bros", createdBy: editor?.id,
      },
      {
        countryId: allCountries[3].id, brandId: allBrands[5].id, titleId: allTitles[5].id, studioId: allStudios[2].id,
        executionDate: "2025-10-20", executionType: "canje" as const, mediaValueLocal: "320000", localCurrency: "NIO" as const,
        fxRateUsed: "36.65", mediaValueUsd: "8731.24", status: "evidence_uploaded" as const, ownerId: editor?.id,
        hasPhotos: true, hasLinks: true, notes: "Toyota trade deal for GOTG Vol 3 in Nicaragua", createdBy: editor?.id,
      },
      {
        countryId: allCountries[0].id, brandId: allBrands[7].id, titleId: allTitles[0].id, studioId: allStudios[2].id,
        executionDate: "2025-09-15", executionType: "publicity" as const, mediaValueLocal: "95000", localCurrency: "GTQ" as const,
        fxRateUsed: "7.75", mediaValueUsd: "12258.06", status: "closed" as const, ownerId: editor?.id,
        hasClipping: true, hasPhotos: true, hasLinks: true, notes: "Spotify digital campaign for Avatar", createdBy: editor?.id,
      },
      {
        countryId: allCountries[6].id, brandId: allBrands[1].id, titleId: allTitles[2].id, studioId: allStudios[1].id,
        executionDate: "2025-12-15", executionType: "third_party" as const, mediaValueLocal: "6000", localCurrency: "BZD" as const,
        fxRateUsed: "2", mediaValueUsd: "3000", status: "executed" as const, ownerId: editor?.id,
        hasInvoice: true, notes: "Pepsi activation for Barbie in Belize", createdBy: editor?.id,
      },
    ];

    for (const seed of executionSeeds) {
      const [exec] = await db.insert(executions).values(seed).returning();
      await db.insert(statusHistory).values({
        executionId: exec.id,
        status: seed.status,
        changedBy: editor?.id || null,
      });
    }
  }
}

export const storage = new DatabaseStorage();
