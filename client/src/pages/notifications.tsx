import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { NotificationWithActor } from "@shared/schema";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function buildNotificationText(
  notification: NotificationWithActor,
  t: (key: string) => string,
): string {
  const actorName = notification.actor?.displayName || "Someone";
  const payload = notification.payload as any;
  const taskTitle = payload?.taskTitle || "";
  const executionName = payload?.executionName || "";

  switch (notification.type) {
    case "task_assigned":
      return `${actorName} ${t("notifications.taskAssignedText")} "${taskTitle}" ${t("notifications.inExecution")} ${executionName}`;

    case "status_changed": {
      const oldStatus = payload?.oldStatus || "";
      const newStatus = payload?.newStatus || "";
      return `${actorName} ${t("notifications.statusChanged")} ${executionName} ${t("notifications.statusFrom")} "${oldStatus}" ${t("notifications.statusTo")} "${newStatus}"`;
    }

    case "task_completed":
      return `${actorName} ${t("notifications.taskCompleted")} "${taskTitle}" ${t("notifications.inExecution")} ${executionName}`;

    case "mention": {
      const convName = payload?.conversationName || "";
      return `${actorName} ${t("notifications.mentionedYou")} ${convName}`;
    }

    case "email_reply": {
      const senderName = payload?.senderName || "External sender";
      const subject = payload?.subject || "";
      return `${senderName} ${t("notifications.repliedToEmail")} "${subject}"`;
    }

    default:
      return `${actorName} — ${notification.type}`;
  }
}

export default function NotificationsPage() {
  const { t } = useLanguage();
  const [, navigate] = useLocation();

  const { data: notifications, isLoading } = useQuery<NotificationWithActor[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 5000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markOneReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const handleNotificationClick = (notification: NotificationWithActor) => {
    if (!notification.readAt) {
      markOneReadMutation.mutate(notification.id);
    }
    const payload = notification.payload as any;

    if (notification.type === "mention" && payload?.conversationId) {
      navigate(`/chat/${payload.conversationId}`);
      return;
    }

    if (notification.type === "email_reply" && payload?.threadId) {
      navigate(`/email?threadId=${payload.threadId}`);
      return;
    }

    if (notification.executionId) {
      navigate(`/executions/${notification.executionId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-3">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-md" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold" data-testid="text-notifications-title">
          {t("notifications.title")}
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending || !notifications?.some((n) => !n.readAt)}
          data-testid="button-mark-all-read"
        >
          <CheckCheck className="w-4 h-4 mr-1" />
          {t("notifications.markAllRead")}
        </Button>
      </div>

      {!notifications || notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Bell className="w-10 h-10 mb-3 opacity-50" />
            <p data-testid="text-no-notifications">{t("notifications.noNotifications")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const isUnread = !notification.readAt;
            return (
              <Card
                key={notification.id}
                data-testid={`notification-item-${notification.id}`}
                className={`cursor-pointer hover-elevate transition-colors ${isUnread ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                onClick={() => handleNotificationClick(notification)}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <Avatar className="shrink-0">
                    <AvatarFallback>
                      {notification.actor?.displayName
                        ? getInitials(notification.actor.displayName)
                        : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      {buildNotificationText(notification, t)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {notification.createdAt
                        ? formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                          })
                        : ""}
                    </p>
                  </div>
                  {isUnread && (
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
