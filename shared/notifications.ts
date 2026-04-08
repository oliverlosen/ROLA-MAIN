export const notificationTypeValues = [
  "task_assigned",
  "status_changed",
  "task_completed",
  "mention",
  "email_reply",
  "automation_alert",
  "account_created",
  "account_updated",
  "account_deleted",
  "campaign_created",
  "campaign_updated",
] as const;

export type NotificationType = (typeof notificationTypeValues)[number];

export const notificationCategoryValues = [
  "all",
  "tasks",
  "executions",
  "campaigns",
  "accounts",
  "communications",
  "alerts",
] as const;

export type NotificationCategory = (typeof notificationCategoryValues)[number];
export type NotificationFeedCategory = Exclude<NotificationCategory, "all">;

export const notificationTypesByCategory: Record<NotificationCategory, NotificationType[]> = {
  all: [...notificationTypeValues],
  tasks: [
    "task_assigned",
    "task_completed",
  ],
  executions: [
    "status_changed",
  ],
  campaigns: [
    "campaign_created",
    "campaign_updated",
  ],
  accounts: [
    "account_created",
    "account_updated",
    "account_deleted",
  ],
  communications: [
    "mention",
    "email_reply",
  ],
  alerts: [
    "automation_alert",
  ],
};

export const notificationCategoryByType: Record<NotificationType, NotificationFeedCategory> = {
  task_assigned: "tasks",
  task_completed: "tasks",
  status_changed: "executions",
  campaign_created: "campaigns",
  campaign_updated: "campaigns",
  account_created: "accounts",
  account_updated: "accounts",
  account_deleted: "accounts",
  mention: "communications",
  email_reply: "communications",
  automation_alert: "alerts",
};

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === "string" && notificationCategoryValues.includes(value as NotificationCategory);
}

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && notificationTypeValues.includes(value as NotificationType);
}

export function getNotificationCategory(type: string): NotificationFeedCategory | null {
  if (!isNotificationType(type)) return null;
  return notificationCategoryByType[type];
}
