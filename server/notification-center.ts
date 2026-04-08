import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  notifications,
  users,
  type InsertNotification,
  type Notification,
  type NotificationWithActor,
  type User,
} from "@shared/schema";
import {
  notificationTypesByCategory,
  type NotificationCategory,
  type NotificationType,
} from "@shared/notifications";

type NotificationAudienceCache = {
  accountRecipients: Map<number, number[]>;
  campaignRecipients: Map<number, number[]>;
  executionRecipients: Map<number, number[]>;
  taskRecipients: Map<number, number[]>;
  conversationMembers: Map<number, number[]>;
};

type NotificationListOptions = {
  category?: NotificationCategory;
  limit?: number;
  actorUserId?: number;
};

type SendNotificationInput = Omit<InsertNotification, "recipientId"> & {
  type: NotificationType;
  recipientIds: number[];
  includeAdmins?: boolean;
};

function sortUniqueNumbers(values: Array<number | null | undefined>): number[] {
  return Array.from(new Set(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))));
}

function buildWhereClause(conditions: any[]) {
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>) };
  }
  return {};
}

function extractNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return sortUniqueNumbers(value.map((entry) => (typeof entry === "number" ? entry : null)));
}

function createAudienceCache(): NotificationAudienceCache {
  return {
    accountRecipients: new Map(),
    campaignRecipients: new Map(),
    executionRecipients: new Map(),
    taskRecipients: new Map(),
    conversationMembers: new Map(),
  };
}

class NotificationCenter {
  async sendNotification(input: SendNotificationInput): Promise<void> {
    const adminIds = input.includeAdmins === false ? [] : await this.getAdminIds();
    const recipientIds = sortUniqueNumbers([
      ...input.recipientIds.filter((recipientId) => recipientId !== input.actorId),
      ...adminIds,
    ]);

    if (!recipientIds.length) return;

    const basePayload = normalizePayload(input.payload);
    const payload = {
      ...basePayload,
      visibleToUserIds: recipientIds,
    };

    for (const recipientId of recipientIds) {
      await storage.createNotification({
        recipientId,
        actorId: input.actorId,
        executionId: input.executionId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        type: input.type,
        payload,
      });
    }
  }

  async listNotificationsForUser(user: Pick<User, "id" | "role">, options: NotificationListOptions = {}): Promise<NotificationWithActor[]> {
    const visibleRows = await this.getVisibleRowsForUser(user, options);
    return this.attachActors(visibleRows.slice(0, options.limit ?? 30));
  }

  async getUnreadCountForUser(user: Pick<User, "id" | "role">): Promise<number> {
    const visibleRows = await this.getVisibleRowsForUser(user, { category: "all" }, true);
    return visibleRows.length;
  }

  async markNotificationReadForUser(id: number, user: Pick<User, "id" | "role">): Promise<void> {
    const [row] = await db.select().from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.recipientId, user.id)));

    if (!row) return;
    if (!(await this.isVisibleToUser(row, user, createAudienceCache()))) return;

    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, row.id));
  }

  async markAllReadForUser(
    user: Pick<User, "id" | "role">,
    category: NotificationCategory = "all",
    actorUserId?: number,
  ): Promise<void> {
    const visibleRows = await this.getVisibleRowsForUser(user, { category, actorUserId }, true);
    const ids = visibleRows.map((row) => row.id);

    if (!ids.length) return;

    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(inArray(notifications.id, ids));
  }

  async deleteFilteredNotificationsForUser(
    user: Pick<User, "id" | "role">,
    options: NotificationListOptions = {},
  ): Promise<number> {
    const visibleRows = await this.getVisibleRowsForUser(user, options);
    const ids = visibleRows.map((row) => row.id);

    if (!ids.length) return 0;

    await db.delete(notifications)
      .where(and(eq(notifications.recipientId, user.id), inArray(notifications.id, ids)));

    return ids.length;
  }

  async getAdminIds(): Promise<number[]> {
    const rows = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"));
    return rows.map((row) => row.id);
  }

  async getExecutionRelatedUserIds(executionId: number): Promise<number[]> {
    return this.loadExecutionRecipients(executionId, createAudienceCache());
  }

  async getTaskRelatedUserIds(taskId: number): Promise<number[]> {
    return this.loadTaskRecipients(taskId, createAudienceCache());
  }

  async getCampaignRelatedUserIds(campaignId: number): Promise<number[]> {
    return this.loadCampaignRecipients(campaignId, createAudienceCache());
  }

  async getAccountRelatedUserIds(accountId: number): Promise<number[]> {
    return this.loadAccountRecipients(accountId, createAudienceCache());
  }

  private async getNotificationRows(
    recipientId: number,
    options: NotificationListOptions = {},
    unreadOnly = false,
  ): Promise<Notification[]> {
    const category = options.category ?? "all";
    const conditions = [eq(notifications.recipientId, recipientId)];

    if (unreadOnly) {
      conditions.push(isNull(notifications.readAt));
    }

    if (category !== "all") {
      conditions.push(inArray(notifications.type, notificationTypesByCategory[category]));
    }

    if (typeof options.actorUserId === "number") {
      conditions.push(eq(notifications.actorId, options.actorUserId));
    }

    return db.select().from(notifications)
      .where(buildWhereClause(conditions))
      .orderBy(desc(notifications.createdAt));
  }

  private async getVisibleRowsForUser(
    user: Pick<User, "id" | "role">,
    options: NotificationListOptions = {},
    unreadOnly = false,
  ): Promise<Notification[]> {
    const rows = await this.getNotificationRows(user.id, options, unreadOnly);
    return this.filterVisibleRows(rows, user);
  }

  private async attachActors(rows: Notification[]): Promise<NotificationWithActor[]> {
    const actorIds = sortUniqueNumbers(rows.map((row) => row.actorId));
    const actorMap = new Map<number, Pick<User, "id" | "displayName" | "username">>();

    if (actorIds.length) {
      const actorRows = await db.select({
        id: users.id,
        displayName: users.displayName,
        username: users.username,
      }).from(users).where(inArray(users.id, actorIds));

      for (const actor of actorRows) {
        actorMap.set(actor.id, actor);
      }
    }

    return rows.map((row) => ({
      ...row,
      actor: row.actorId ? actorMap.get(row.actorId) || null : null,
    }));
  }

  private async filterVisibleRows(rows: Notification[], user: Pick<User, "id" | "role">): Promise<Notification[]> {
    const cache = createAudienceCache();
    const visibleRows: Notification[] = [];

    for (const row of rows) {
      if (await this.isVisibleToUser(row, user, cache)) {
        visibleRows.push(row);
      }
    }

    return visibleRows;
  }

  private async isVisibleToUser(
    notification: Notification,
    user: Pick<User, "id" | "role">,
    cache: NotificationAudienceCache,
  ): Promise<boolean> {
    if (notification.recipientId !== user.id) return false;
    if (user.role === "admin") return true;

    const audience = await this.getVisibleAudience(notification, cache);
    return audience.includes(user.id);
  }

  private async getVisibleAudience(notification: Notification, cache: NotificationAudienceCache): Promise<number[]> {
    const payload = normalizePayload(notification.payload);
    const payloadAudience = extractNumberArray(payload.visibleToUserIds);
    if (payloadAudience.length) return payloadAudience;

    switch (notification.type) {
      case "task_assigned":
      case "task_completed": {
        const taskId = notification.entityType === "task" ? notification.entityId : extractNumber(payload.taskId);
        return taskId ? this.loadTaskRecipients(taskId, cache) : [];
      }

      case "status_changed":
        return notification.executionId ? this.loadExecutionRecipients(notification.executionId, cache) : [];

      case "campaign_created":
      case "campaign_updated":
        if (notification.entityType === "campaign") {
          return this.loadCampaignRecipients(notification.entityId, cache);
        }
        return [notification.recipientId];

      case "account_created":
      case "account_updated":
        if (notification.entityType === "account") {
          const recipients = await this.loadAccountRecipients(notification.entityId, cache);
          return recipients.length ? recipients : [notification.recipientId];
        }
        return [notification.recipientId];

      case "account_deleted":
        return [notification.recipientId];

      case "mention": {
        const conversationId = extractNumber(payload.conversationId);
        if (!conversationId) return [notification.recipientId];
        return sortUniqueNumbers([
          notification.recipientId,
          ...(await this.loadConversationMembers(conversationId, cache)),
        ]);
      }

      case "email_reply": {
        const taskId = extractNumber(payload.taskId);
        const explicitRecipients = [notification.recipientId];

        if (taskId) {
          return sortUniqueNumbers([
            ...explicitRecipients,
            ...(await this.loadTaskRecipients(taskId, cache)),
          ]);
        }

        if (notification.executionId) {
          return sortUniqueNumbers([
            ...explicitRecipients,
            ...(await this.loadExecutionRecipients(notification.executionId, cache)),
          ]);
        }

        return explicitRecipients;
      }

      case "automation_alert": {
        const taskId = extractNumber(payload.taskId);
        if (taskId) return this.loadTaskRecipients(taskId, cache);

        const campaignId = extractNumber(payload.campaignId);
        if (campaignId && !notification.executionId) {
          return this.loadCampaignRecipients(campaignId, cache);
        }

        if (notification.executionId) {
          return this.loadExecutionRecipients(notification.executionId, cache);
        }

        return [notification.recipientId];
      }

      default:
        return [notification.recipientId];
    }
  }

  private async loadExecutionRecipients(executionId: number, cache: NotificationAudienceCache): Promise<number[]> {
    const cached = cache.executionRecipients.get(executionId);
    if (cached) return cached;

    const execution = await storage.getExecution(executionId);
    if (!execution) {
      cache.executionRecipients.set(executionId, []);
      return [];
    }

    const tasks = await storage.getTasks(executionId);
    const recipients = sortUniqueNumbers([
      execution.ownerId,
      execution.createdBy,
      execution.account?.ownerId,
      ...tasks.flatMap((task) => [task.assignedTo, task.createdBy]),
    ]);

    cache.executionRecipients.set(executionId, recipients);
    return recipients;
  }

  private async loadTaskRecipients(taskId: number, cache: NotificationAudienceCache): Promise<number[]> {
    const cached = cache.taskRecipients.get(taskId);
    if (cached) return cached;

    const task = await storage.getTask(taskId);
    if (!task) {
      cache.taskRecipients.set(taskId, []);
      return [];
    }

    const recipients = sortUniqueNumbers([
      task.assignedTo,
      task.createdBy,
      ...(await this.loadExecutionRecipients(task.executionId, cache)),
    ]);

    cache.taskRecipients.set(taskId, recipients);
    return recipients;
  }

  private async loadCampaignRecipients(campaignId: number, cache: NotificationAudienceCache): Promise<number[]> {
    const cached = cache.campaignRecipients.get(campaignId);
    if (cached) return cached;

    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      cache.campaignRecipients.set(campaignId, []);
      return [];
    }

    const recipientSets = await Promise.all((campaign.executions || []).map((execution) =>
      this.loadExecutionRecipients(execution.id, cache)));

    const recipients = sortUniqueNumbers([
      campaign.account?.ownerId,
      ...recipientSets.flat(),
    ]);

    cache.campaignRecipients.set(campaignId, recipients);
    return recipients;
  }

  private async loadAccountRecipients(accountId: number, cache: NotificationAudienceCache): Promise<number[]> {
    const cached = cache.accountRecipients.get(accountId);
    if (cached) return cached;

    const account = await storage.getAccount(accountId);
    if (!account) {
      cache.accountRecipients.set(accountId, []);
      return [];
    }

    const recipientSets = await Promise.all((account.executions || []).map((execution) =>
      this.loadExecutionRecipients(execution.id, cache)));

    const recipients = sortUniqueNumbers([
      account.ownerId,
      ...recipientSets.flat(),
    ]);

    cache.accountRecipients.set(accountId, recipients);
    return recipients;
  }

  private async loadConversationMembers(conversationId: number, cache: NotificationAudienceCache): Promise<number[]> {
    const cached = cache.conversationMembers.get(conversationId);
    if (cached) return cached;

    const members = await storage.getConversationMembers(conversationId);
    const memberIds = members.map((member) => member.id);
    cache.conversationMembers.set(conversationId, memberIds);
    return memberIds;
  }
}

export const notificationCenter = new NotificationCenter();
