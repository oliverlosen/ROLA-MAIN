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

export const executions = sqliteTable("executions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  countryId: integer("country_id").notNull().references(() => countries.id),
  brandId: integer("brand_id").notNull().references(() => brands.id),
  titleId: integer("title_id").references(() => titles.id),
  studioId: integer("studio_id").references(() => studios.id),
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
  createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow(),
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

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertCountrySchema = createInsertSchema(countries).omit({ id: true });
export const insertBrandSchema = createInsertSchema(brands).omit({ id: true });
export const insertTitleSchema = createInsertSchema(titles).omit({ id: true });
export const insertStudioSchema = createInsertSchema(studios).omit({ id: true });
export const insertExecutionSchema = createInsertSchema(executions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAssetSchema = createInsertSchema(assets).omit({ id: true, uploadedAt: true });
export const insertStatusHistorySchema = createInsertSchema(statusHistory).omit({ id: true, changedAt: true });
export const insertFxDefaultSchema = createInsertSchema(fxDefaults).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, readAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertMessageLinkSchema = createInsertSchema(messageLinks).omit({ id: true, createdAt: true });

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
  assetCount?: number;
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
