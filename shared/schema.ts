import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleValues = ["admin", "editor", "approver", "viewer"] as const;
export const executionStatusValues = [
  "draft", "in_review", "approved", "executed", "evidence_uploaded", "closed",
] as const;
export const executionTypeValues = ["canje", "publicity", "third_party"] as const;
export const currencyValues = ["GTQ", "USD", "HNL", "NIO", "CRC", "PAB", "BZD", "SVC"] as const;
export const assetTypeValues = ["photo", "video", "clipping", "post", "contract", "other"] as const;
export const taskStatusValues = ["pending", "in_progress", "completed", "cancelled"] as const;
export const crmCampaignStatusValues = ["planning", "active", "completed", "on_hold"] as const;
export const automationSeverityValues = ["low", "medium", "high"] as const;
export const automationAlertStatusValues = ["open", "resolved"] as const;
export const emailProviderValues = ["google", "microsoft"] as const;
export const emailAccountStatusValues = ["connected", "needs_reconnect", "disconnected", "error"] as const;
export const emailThreadVisibilityValues = ["private", "shared"] as const;
export const emailDirectionValues = ["inbound", "outbound"] as const;
export const emailRecipientTypeValues = ["to", "cc", "bcc"] as const;
export const emailSyncCursorTypeValues = ["history", "delta", "subscription"] as const;

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: roleValues }).notNull().default("viewer"),
});

export const countries = sqliteTable("countries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  code: text("code", { length: 3 }).notNull().unique(),
});

export const brands = sqliteTable("brands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const titles = sqliteTable("titles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const studios = sqliteTable("studios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const crmAccounts = sqliteTable("crm_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  ownerId: integer("owner_id").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const crmContacts = sqliteTable("crm_contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => crmAccounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  jobTitle: text("job_title"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const crmCampaigns = sqliteTable("crm_campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => crmAccounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: crmCampaignStatusValues }).notNull().default("planning"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  progressOverride: integer("progress_override"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const executions = sqliteTable("executions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  countryId: integer("country_id").notNull().references(() => countries.id),
  brandId: integer("brand_id").notNull().references(() => brands.id),
  titleId: integer("title_id").references(() => titles.id),
  studioId: integer("studio_id").references(() => studios.id),
  accountId: integer("account_id").references(() => crmAccounts.id),
  campaignId: integer("campaign_id").references(() => crmCampaigns.id),
  primaryContactId: integer("primary_contact_id").references(() => crmContacts.id),
  executionDate: text("execution_date").notNull(),
  executionType: text("execution_type", { enum: executionTypeValues }).notNull(),
  mediaValueLocal: text("media_value_local").notNull(),
  localCurrency: text("local_currency", { enum: currencyValues }).notNull(),
  fxRateUsed: text("fx_rate_used").notNull().default("1"),
  fxSource: text("fx_source"),
  fxDate: text("fx_date"),
  mediaValueUsd: text("media_value_usd").notNull(),
  notes: text("notes"),
  ownerId: integer("owner_id").references(() => users.id),
  status: text("status", { enum: executionStatusValues }).notNull().default("draft"),
  dueDate: text("due_date"),
  plannedStartDate: text("planned_start_date"),
  plannedEndDate: text("planned_end_date"),
  progressOverride: integer("progress_override"),
  hasClipping: integer("has_clipping", { mode: "boolean" }).default(false),
  hasPhotos: integer("has_photos", { mode: "boolean" }).default(false),
  hasLinks: integer("has_links", { mode: "boolean" }).default(false),
  hasInvoice: integer("has_invoice", { mode: "boolean" }).default(false),
  hasContract: integer("has_contract", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
});

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  executionId: integer("execution_id").notNull().references(() => executions.id, { onDelete: "cascade" }),
  assetType: text("asset_type", { enum: assetTypeValues }).notNull(),
  url: text("url"),
  filePath: text("file_path"),
  description: text("description"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  uploadedAt: integer("uploaded_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const statusHistory = sqliteTable("status_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  executionId: integer("execution_id").notNull().references(() => executions.id, { onDelete: "cascade" }),
  status: text("status", { enum: executionStatusValues }).notNull(),
  changedBy: integer("changed_by").references(() => users.id),
  changedAt: integer("changed_at", { mode: "timestamp_ms" }).defaultNow(),
  notes: text("notes"),
});

export const fxDefaults = sqliteTable("fx_defaults", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  currency: text("currency", { enum: currencyValues }).notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  rate: text("rate").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  executionId: integer("execution_id").notNull().references(() => executions.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: taskStatusValues }).notNull().default("pending"),
  assignedTo: integer("assigned_to").references(() => users.id),
  createdBy: integer("created_by").references(() => users.id),
  dueDate: text("due_date"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  progressOverride: integer("progress_override"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipientId: integer("recipient_id").notNull().references(() => users.id),
  actorId: integer("actor_id").references(() => users.id),
  executionId: integer("execution_id").references(() => executions.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  type: text("type").notNull(),
  payload: text("payload", { mode: "json" }),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  executionId: integer("execution_id").references(() => executions.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("execution"),
  name: text("name"),
  countryId: integer("country_id").references(() => countries.id),
  titleId: integer("title_id").references(() => titles.id),
  studioId: integer("studio_id").references(() => studios.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const conversationMembers = sqliteTable("conversation_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").default("member"),
  lastReadAt: integer("last_read_at", { mode: "timestamp_ms" }).defaultNow(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const messageLinks = sqliteTable("message_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: integer("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  executionId: integer("execution_id").references(() => executions.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const emailAccounts = sqliteTable("email_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  provider: text("provider", { enum: emailProviderValues }).notNull(),
  emailAddress: text("email_address").notNull(),
  displayName: text("display_name"),
  providerAccountId: text("provider_account_id"),
  accessTokenEncrypted: text("access_token_encrypted"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  tokenType: text("token_type"),
  scopes: text("scopes", { mode: "json" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  status: text("status", { enum: emailAccountStatusValues }).notNull().default("connected"),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  webhookId: text("webhook_id"),
  webhookResource: text("webhook_resource"),
  webhookExpiresAt: integer("webhook_expires_at", { mode: "timestamp_ms" }),
  disconnectedAt: integer("disconnected_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const emailThreads = sqliteTable("email_threads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => emailAccounts.id),
  providerThreadId: text("provider_thread_id").notNull(),
  providerConversationId: text("provider_conversation_id"),
  subject: text("subject").notNull().default(""),
  snippet: text("snippet"),
  visibility: text("visibility", { enum: emailThreadVisibilityValues }).notNull().default("private"),
  lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
  lastInboundAt: integer("last_inbound_at", { mode: "timestamp_ms" }),
  lastOutboundAt: integer("last_outbound_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const emailMessages = sqliteTable("email_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => emailAccounts.id),
  threadId: integer("thread_id").notNull().references(() => emailThreads.id, { onDelete: "cascade" }),
  providerMessageId: text("provider_message_id").notNull(),
  internetMessageId: text("internet_message_id"),
  direction: text("direction", { enum: emailDirectionValues }).notNull(),
  senderEmail: text("sender_email"),
  senderName: text("sender_name"),
  subject: text("subject"),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  snippet: text("snippet"),
  inReplyTo: text("in_reply_to"),
  references: text("references", { mode: "json" }),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  syncedAt: integer("synced_at", { mode: "timestamp_ms" }).defaultNow(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const emailRecipients = sqliteTable("email_recipients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: integer("message_id").notNull().references(() => emailMessages.id, { onDelete: "cascade" }),
  type: text("type", { enum: emailRecipientTypeValues }).notNull(),
  email: text("email").notNull(),
  name: text("name"),
});

export const emailLinks = sqliteTable("email_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: integer("thread_id").notNull().references(() => emailThreads.id, { onDelete: "cascade" }),
  executionId: integer("execution_id").notNull().references(() => executions.id, { onDelete: "cascade" }),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  linkedBy: integer("linked_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const emailSyncCursors = sqliteTable("email_sync_cursors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull().references(() => emailAccounts.id, { onDelete: "cascade" }),
  cursorType: text("cursor_type", { enum: emailSyncCursorTypeValues }).notNull(),
  cursorValue: text("cursor_value"),
  payload: text("payload", { mode: "json" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const automationAlerts = sqliteTable("automation_alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleCode: text("rule_code").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  executionId: integer("execution_id").references(() => executions.id, { onDelete: "cascade" }),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").references(() => crmCampaigns.id, { onDelete: "cascade" }),
  severity: text("severity", { enum: automationSeverityValues }).notNull().default("medium"),
  title: text("title").notNull(),
  description: text("description"),
  suggestedAction: text("suggested_action"),
  status: text("status", { enum: automationAlertStatusValues }).notNull().default("open"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  payload: text("payload", { mode: "json" }),
  firstTriggeredAt: integer("first_triggered_at", { mode: "timestamp_ms" }).defaultNow(),
  lastTriggeredAt: integer("last_triggered_at", { mode: "timestamp_ms" }).defaultNow(),
  lastNotifiedAt: integer("last_notified_at", { mode: "timestamp_ms" }),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertCountrySchema = createInsertSchema(countries).omit({ id: true });
export const insertBrandSchema = createInsertSchema(brands).omit({ id: true });
export const insertTitleSchema = createInsertSchema(titles).omit({ id: true });
export const insertStudioSchema = createInsertSchema(studios).omit({ id: true });
export const insertCrmAccountSchema = createInsertSchema(crmAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCrmContactSchema = createInsertSchema(crmContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCrmCampaignSchema = createInsertSchema(crmCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertExecutionSchema = createInsertSchema(executions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAssetSchema = createInsertSchema(assets).omit({ id: true, uploadedAt: true });
export const insertStatusHistorySchema = createInsertSchema(statusHistory).omit({ id: true, changedAt: true });
export const insertFxDefaultSchema = createInsertSchema(fxDefaults).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, readAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertMessageLinkSchema = createInsertSchema(messageLinks).omit({ id: true, createdAt: true });
export const insertEmailAccountSchema = createInsertSchema(emailAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertEmailThreadSchema = createInsertSchema(emailThreads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertEmailMessageSchema = createInsertSchema(emailMessages).omit({
  id: true,
  createdAt: true,
  syncedAt: true,
});
export const insertEmailRecipientSchema = createInsertSchema(emailRecipients).omit({ id: true });
export const insertEmailLinkSchema = createInsertSchema(emailLinks).omit({ id: true, createdAt: true });
export const insertEmailSyncCursorSchema = createInsertSchema(emailSyncCursors).omit({
  id: true,
  updatedAt: true,
});
export const insertAutomationAlertSchema = createInsertSchema(automationAlerts).omit({
  id: true,
  firstTriggeredAt: true,
  lastTriggeredAt: true,
  lastNotifiedAt: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Country = typeof countries.$inferSelect;
export type InsertCountry = z.infer<typeof insertCountrySchema>;
export type Brand = typeof brands.$inferSelect;
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type Title = typeof titles.$inferSelect;
export type InsertTitle = z.infer<typeof insertTitleSchema>;
export type Studio = typeof studios.$inferSelect;
export type InsertStudio = z.infer<typeof insertStudioSchema>;
export type CrmAccount = typeof crmAccounts.$inferSelect;
export type InsertCrmAccount = z.infer<typeof insertCrmAccountSchema>;
export type CrmContact = typeof crmContacts.$inferSelect;
export type InsertCrmContact = z.infer<typeof insertCrmContactSchema>;
export type CrmCampaign = typeof crmCampaigns.$inferSelect;
export type InsertCrmCampaign = z.infer<typeof insertCrmCampaignSchema>;
export type Execution = typeof executions.$inferSelect;
export type InsertExecution = z.infer<typeof insertExecutionSchema>;
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type StatusHistoryEntry = typeof statusHistory.$inferSelect;
export type InsertStatusHistory = z.infer<typeof insertStatusHistorySchema>;
export type FxDefault = typeof fxDefaults.$inferSelect;
export type InsertFxDefault = z.infer<typeof insertFxDefaultSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type ConversationMember = typeof conversationMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type MessageLink = typeof messageLinks.$inferSelect;
export type InsertMessageLink = z.infer<typeof insertMessageLinkSchema>;
export type EmailAccount = typeof emailAccounts.$inferSelect;
export type InsertEmailAccount = z.infer<typeof insertEmailAccountSchema>;
export type EmailThread = typeof emailThreads.$inferSelect;
export type InsertEmailThread = z.infer<typeof insertEmailThreadSchema>;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type InsertEmailMessage = z.infer<typeof insertEmailMessageSchema>;
export type EmailRecipient = typeof emailRecipients.$inferSelect;
export type InsertEmailRecipient = z.infer<typeof insertEmailRecipientSchema>;
export type EmailLink = typeof emailLinks.$inferSelect;
export type InsertEmailLink = z.infer<typeof insertEmailLinkSchema>;
export type EmailSyncCursor = typeof emailSyncCursors.$inferSelect;
export type InsertEmailSyncCursor = z.infer<typeof insertEmailSyncCursorSchema>;
export type AutomationAlert = typeof automationAlerts.$inferSelect;
export type InsertAutomationAlert = z.infer<typeof insertAutomationAlertSchema>;

export type TaskWithAssignee = Task & {
  assignee?: Pick<User, "id" | "displayName" | "username"> | null;
  creator?: Pick<User, "id" | "displayName" | "username"> | null;
};

export type NotificationWithActor = Notification & {
  actor?: Pick<User, "id" | "displayName" | "username"> | null;
};

export type MessageWithSender = Message & {
  sender?: Pick<User, "id" | "displayName" | "username"> | null;
  links?: MessageLink[];
};

export type ConversationWithDetails = Conversation & {
  executionName?: string;
  displayName?: string;
  subtitle?: string | null;
  contextSummary?: string | null;
  memberNamesPreview?: string[];
  avatarInitials?: string;
  unreadCount?: number;
  lastMessage?: { body: string; createdAt: Date | null; senderName?: string } | null;
  memberCount?: number;
};

export type EmailAccountSafe = Omit<EmailAccount, "accessTokenEncrypted" | "refreshTokenEncrypted"> & {
  readOnly?: boolean;
};

export type EmailMessageWithRecipients = EmailMessage & {
  recipients?: EmailRecipient[];
};

export type EmailThreadWithDetails = EmailThread & {
  account?: EmailAccountSafe | null;
  messages?: EmailMessageWithRecipients[];
  links?: EmailLinkWithContext[];
  pendingResponse?: boolean;
  messageCount?: number;
  latestMessage?: EmailMessageWithRecipients | null;
  canReply?: boolean;
};

export type EmailLinkWithContext = EmailLink & {
  execution?: Pick<Execution, "id"> & {
    brandName?: string | null;
    titleName?: string | null;
  };
  task?: Pick<Task, "id" | "title" | "status"> | null;
};

export type EmailSyncStatus = {
  accountId: number;
  provider: (typeof emailProviderValues)[number];
  syncedMessages: number;
  newMessages: number;
  lastSyncAt: Date | null;
  status: (typeof emailAccountStatusValues)[number];
  error?: string | null;
};

export type AutomationSeverity = (typeof automationSeverityValues)[number];
export type AutomationAlertStatus = (typeof automationAlertStatusValues)[number];

export type ExecutionActivityItem = {
  type: string;
  timestamp: Date | null;
  actor?: string | null;
  title: string;
  description?: string | null;
  entityType: string;
  entityId: number;
  href?: string | null;
  executionId?: number | null;
};

export type AutomationAlertWithContext = AutomationAlert & {
  execution?: Pick<Execution, "id" | "status" | "dueDate"> & {
    brandName?: string | null;
    titleName?: string | null;
  } | null;
  task?: Pick<Task, "id" | "title" | "status" | "dueDate"> | null;
  campaign?: Pick<CrmCampaign, "id" | "name" | "status" | "startDate" | "endDate"> | null;
};

export type GanttTaskBar = TaskWithAssignee & {
  rangeStart: string | null;
  rangeEnd: string | null;
  progress: number;
  isDerivedSchedule?: boolean;
  isDerivedProgress?: boolean;
};

export type ExecutionGanttItem = {
  execution: ExecutionWithDetails;
  progress: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  tasks: GanttTaskBar[];
  activeTaskCount: number;
  completedTaskCount: number;
};

export type CampaignWithDetails = CrmCampaign & {
  account?: CrmAccountWithSummary | null;
  executions?: ExecutionWithDetails[];
  progress?: number;
  openAlertCount?: number;
};

export type CampaignGanttExecutionItem = ExecutionWithDetails & {
  rangeStart: string | null;
  rangeEnd: string | null;
  progress: number;
  openAlertCount?: number;
  atRisk?: boolean;
};

export type CampaignGanttItem = {
  campaign: CampaignWithDetails;
  progress: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  executions: CampaignGanttExecutionItem[];
  alerts: AutomationAlertWithContext[];
};

export type ExecutionPortfolioGanttItem = ExecutionWithDetails & {
  rangeStart: string | null;
  rangeEnd: string | null;
  progress: number;
  openAlertCount: number;
  atRisk: boolean;
  activeTaskCount: number;
  completedTaskCount: number;
  accountName?: string | null;
  campaignName?: string | null;
};

export type ExecutionPortfolioGanttSummary = {
  executionCount: number;
  openExecutionCount: number;
  avgProgress: number;
  atRiskCount: number;
  openAlertCount: number;
  rangeStart: string | null;
  rangeEnd: string | null;
};

export type ExecutionPortfolioGanttResponse = {
  summary: ExecutionPortfolioGanttSummary;
  executions: ExecutionPortfolioGanttItem[];
};

export type OperationalRiskSummary = {
  openAlertCount: number;
  highSeverityCount: number;
  overdueTaskCount: number;
  overdueExecutionCount: number;
  pendingReplyCount: number;
  alertsByRule: { ruleCode: string; count: number }[];
  topAlerts: AutomationAlertWithContext[];
};

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type ExecutionWithDetails = Execution & {
  country?: Country;
  brand?: Brand;
  title?: Title | null;
  studio?: Studio | null;
  owner?: Pick<User, "id" | "displayName" | "username"> | null;
  account?: CrmAccountWithSummary | null;
  campaign?: CrmCampaign | null;
  primaryContact?: CrmContact | null;
  assetCount?: number;
};

export type CrmAccountWithSummary = CrmAccount & {
  owner?: Pick<User, "id" | "displayName" | "username"> | null;
  contactCount?: number;
  campaignCount?: number;
  executionCount?: number;
};

export type AccountWithDetails = CrmAccountWithSummary & {
  contacts?: CrmContact[];
  campaigns?: CrmCampaign[];
  executions?: ExecutionWithDetails[];
  activity?: ExecutionActivityItem[];
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  executed: "Executed",
  evidence_uploaded: "Evidence Uploaded",
  closed: "Closed/Reported",
};

export const EXECUTION_TYPE_LABELS: Record<string, string> = {
  canje: "Canje",
  publicity: "Publicity",
  third_party: "Third Party",
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  GTQ: "Q",
  USD: "$",
  HNL: "L",
  NIO: "C$",
  CRC: "₡",
  PAB: "B/.",
  BZD: "BZ$",
  SVC: "₡",
};
