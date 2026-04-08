import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronsUpDown,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRelativeNotificationTime } from "@/lib/dates";
import { useLanguage } from "@/lib/i18n";
import { apiRequest, parseJsonResponse, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { NotificationWithActor, User } from "@shared/schema";
import {
  getNotificationCategory,
  notificationCategoryValues,
  type NotificationCategory,
  type NotificationFeedCategory,
} from "@shared/notifications";

type SafeUser = Omit<User, "password">;

const CATEGORY_BADGE_STYLES: Record<NotificationFeedCategory, string> = {
  tasks: "border-blue-200 bg-blue-50 text-blue-700",
  executions: "border-amber-200 bg-amber-50 text-amber-700",
  campaigns: "border-emerald-200 bg-emerald-50 text-emerald-700",
  accounts: "border-cyan-200 bg-cyan-50 text-cyan-700",
  communications: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  alerts: "border-rose-200 bg-rose-50 text-rose-700",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getPayload(notification: NotificationWithActor): Record<string, unknown> {
  if (notification.payload && typeof notification.payload === "object" && !Array.isArray(notification.payload)) {
    return notification.payload as Record<string, unknown>;
  }
  return {};
}

function extractNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatActorOption(user: SafeUser): string {
  return `${user.displayName} (@${user.username})`;
}

function buildNotificationText(
  notification: NotificationWithActor,
  t: (key: string) => string,
): string {
  const actorName = notification.actor?.displayName || "System";
  const payload = getPayload(notification);
  const taskTitle = typeof payload.taskTitle === "string" ? payload.taskTitle : "";
  const executionName = typeof payload.executionName === "string" ? payload.executionName : "";
  const accountName = typeof payload.accountName === "string" ? payload.accountName : "";
  const campaignName = typeof payload.campaignName === "string" ? payload.campaignName : "";

  switch (notification.type) {
    case "task_assigned":
      return `${actorName} ${t("notifications.taskAssignedText")} "${taskTitle}" ${t("notifications.inExecution")} ${executionName}`;

    case "status_changed": {
      const oldStatus = typeof payload.oldStatus === "string" ? payload.oldStatus : "";
      const newStatus = typeof payload.newStatus === "string" ? payload.newStatus : "";
      return `${actorName} ${t("notifications.statusChanged")} ${executionName} ${t("notifications.statusFrom")} "${oldStatus}" ${t("notifications.statusTo")} "${newStatus}"`;
    }

    case "task_completed":
      return `${actorName} ${t("notifications.taskCompleted")} "${taskTitle}" ${t("notifications.inExecution")} ${executionName}`;

    case "mention": {
      const convName = typeof payload.conversationName === "string" ? payload.conversationName : "";
      return `${actorName} ${t("notifications.mentionedYou")} ${convName}`;
    }

    case "email_reply": {
      const senderName = typeof payload.senderName === "string" ? payload.senderName : "External sender";
      const subject = typeof payload.subject === "string" ? payload.subject : "";
      return `${senderName} ${t("notifications.repliedToEmail")} "${subject}"`;
    }

    case "automation_alert": {
      const title = typeof payload.title === "string" ? payload.title : t("automation.alerts");
      const severity = typeof payload.severity === "string" ? t(`automation.severity.${payload.severity}`) : "";
      return severity ? `${title} (${severity})` : title;
    }

    case "account_created":
      return `${actorName} ${t("notifications.accountCreatedText")} "${accountName}"`;

    case "account_updated":
      return `${actorName} ${t("notifications.accountUpdatedText")} "${accountName}"`;

    case "account_deleted":
      return `${actorName} ${t("notifications.accountDeletedText")} "${accountName}"`;

    case "campaign_created":
      return `${actorName} ${t("notifications.campaignCreatedText")} "${campaignName}"`;

    case "campaign_updated":
      return `${actorName} ${t("notifications.campaignUpdatedText")} "${campaignName}"`;

    default:
      return `${actorName} - ${notification.type}`;
  }
}

export default function NotificationsPage() {
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>("all");
  const [selectedActorUserId, setSelectedActorUserId] = useState<number | null>(null);
  const [actorPopoverOpen, setActorPopoverOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: users } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
  });

  const actorOptions = (users || []).slice().sort((a, b) =>
    a.displayName.localeCompare(b.displayName) || a.username.localeCompare(b.username));
  const selectedActor = actorOptions.find((user) => user.id === selectedActorUserId) || null;

  const { data: notifications, isLoading } = useQuery<NotificationWithActor[]>({
    queryKey: ["/api/notifications", selectedCategory, selectedActorUserId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") {
        params.set("category", selectedCategory);
      }
      if (typeof selectedActorUserId === "number") {
        params.set("actorUserId", String(selectedActorUserId));
      }

      const url = params.size ? `/api/notifications?${params.toString()}` : "/api/notifications";
      return parseJsonResponse<NotificationWithActor[]>(await apiRequest("GET", url));
    },
    refetchInterval: 5000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read", {
        category: selectedCategory,
        actorUserId: selectedActorUserId ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteFilteredMutation = useMutation({
    mutationFn: async () => {
      return parseJsonResponse<{ ok: true; deleted: number }>(await apiRequest("POST", "/api/notifications/delete-filtered", {
        category: selectedCategory,
        actorUserId: selectedActorUserId ?? undefined,
      }));
    },
    onSuccess: () => {
      setDeleteDialogOpen(false);
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

    const payload = getPayload(notification);
    const conversationId = extractNumber(payload.conversationId);
    const threadId = extractNumber(payload.threadId);
    const campaignId = extractNumber(payload.campaignId);
    const accountId = extractNumber(payload.accountId);

    if (notification.type === "mention" && conversationId) {
      navigate(`/chat/${conversationId}`);
      return;
    }

    if ((notification.type === "email_reply" || notification.type === "automation_alert") && threadId) {
      navigate(`/email?threadId=${threadId}`);
      return;
    }

    if (notification.type === "account_deleted") {
      navigate("/accounts");
      return;
    }

    if ((notification.type === "account_created" || notification.type === "account_updated") && accountId) {
      navigate(`/accounts/${accountId}`);
      return;
    }

    if ((notification.type === "campaign_created" || notification.type === "campaign_updated") && campaignId) {
      navigate(`/campaigns/${campaignId}`);
      return;
    }

    if (notification.type === "automation_alert" && campaignId && !notification.executionId) {
      navigate(`/campaigns/${campaignId}`);
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

  const visibleNotifications = notifications || [];
  const hasUnread = visibleNotifications.some((notification) => !notification.readAt);
  const activeFilterDetails: string[] = [];

  if (selectedCategory !== "all") {
    activeFilterDetails.push(`${t("notifications.filterLabel")}: ${t(`notifications.category.${selectedCategory}`)}`);
  }

  if (selectedActor) {
    activeFilterDetails.push(`${t("notifications.userFilterLabel")}: ${formatActorOption(selectedActor)}`);
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-notifications-title">
            {t("notifications.title")}
          </h1>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("notifications.filterLabel")}</p>
            <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as NotificationCategory)}>
              <SelectTrigger className="w-[180px]" data-testid="select-notification-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {notificationCategoryValues.map((category) => (
                  <SelectItem key={category} value={category}>
                    {t(`notifications.category.${category}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("notifications.userFilterLabel")}</p>
            <Popover open={actorPopoverOpen} onOpenChange={setActorPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-[220px] justify-between"
                  data-testid="button-notification-user-filter"
                >
                  <span className="truncate text-left">
                    {selectedActor ? formatActorOption(selectedActor) : t("notifications.allUsers")}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("notifications.searchUsers")} />
                  <CommandList>
                    <CommandEmpty>{t("notifications.noUsersFound")}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value={t("notifications.allUsers")}
                        onSelect={() => {
                          setSelectedActorUserId(null);
                          setActorPopoverOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2", selectedActorUserId === null ? "opacity-100" : "opacity-0")} />
                        <span>{t("notifications.allUsers")}</span>
                      </CommandItem>
                      {actorOptions.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={`${user.displayName} ${user.username}`}
                          onSelect={() => {
                            setSelectedActorUserId(user.id);
                            setActorPopoverOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2", selectedActorUserId === user.id ? "opacity-100" : "opacity-0")} />
                          <div className="min-w-0">
                            <p className="truncate">{user.displayName}</p>
                            <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteFilteredMutation.isPending || visibleNotifications.length === 0}
                data-testid="button-delete-notifications"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {t("notifications.deleteFiltered")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("notifications.deleteDialogTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {activeFilterDetails.length === 0
                    ? t("notifications.deleteDialogDescriptionAll")
                    : t("notifications.deleteDialogDescriptionFiltered")}
                  {activeFilterDetails.length > 0 ? (
                    <span className="mt-2 block">
                      {t("notifications.deleteDialogFiltersPrefix")}: {activeFilterDetails.join(" · ")}
                    </span>
                  ) : null}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete-notifications">
                  {t("executionForm.cancel")}
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  onClick={() => deleteFilteredMutation.mutate()}
                  disabled={deleteFilteredMutation.isPending}
                  data-testid="button-confirm-delete-notifications"
                >
                  {deleteFilteredMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  {t("notifications.deleteFiltered")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending || !hasUnread}
            data-testid="button-mark-all-read"
          >
            {markAllReadMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-1" />}
            {t("notifications.markAllRead")}
          </Button>
        </div>
      </div>

      {visibleNotifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Bell className="w-10 h-10 mb-3 opacity-50" />
            <p data-testid="text-no-notifications">{t("notifications.noNotifications")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleNotifications.map((notification) => {
            const isUnread = !notification.readAt;
            const category = getNotificationCategory(notification.type);
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
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="text-sm min-w-0 flex-1">
                        {buildNotificationText(notification, t)}
                      </p>
                      {category ? (
                        <Badge variant="outline" className={CATEGORY_BADGE_STYLES[category]}>
                          {t(`notifications.category.${category}`)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeNotificationTime(notification.createdAt)}
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
