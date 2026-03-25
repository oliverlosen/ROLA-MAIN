import { format } from "date-fns";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import type { AutomationAlertWithContext } from "@shared/schema";

type AutomationAlertListProps = {
  alerts?: AutomationAlertWithContext[];
  emptyMessage: string;
  openLabel?: string;
  onOpen?: (alert: AutomationAlertWithContext) => void;
  limit?: number;
};

const severityClasses: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export function AutomationAlertList({
  alerts,
  emptyMessage,
  openLabel,
  onOpen,
  limit,
}: AutomationAlertListProps) {
  const { t } = useLanguage();
  const visibleAlerts = typeof limit === "number" ? (alerts || []).slice(0, limit) : alerts || [];

  if (!visibleAlerts.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {visibleAlerts.map((alert) => {
        const isOpen = alert.status === "open";
        return (
          <div key={alert.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {isOpen ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  <p className="text-sm font-medium">{alert.title}</p>
                  <Badge className={severityClasses[alert.severity] || severityClasses.low}>
                    {t(`automation.severity.${alert.severity}`)}
                  </Badge>
                  <Badge variant="outline">
                    {isOpen ? t("automation.open") : t("automation.resolved")}
                  </Badge>
                </div>
                {alert.description ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{alert.description}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {alert.lastTriggeredAt ? format(new Date(alert.lastTriggeredAt), "MMM d, yyyy h:mm a") : "-"}
                </p>
                {alert.suggestedAction ? (
                  <p className="text-xs text-muted-foreground">
                    {t("automation.suggestedAction")}: {alert.suggestedAction}
                  </p>
                ) : null}
              </div>
              {onOpen ? (
                <Button variant="ghost" size="sm" onClick={() => onOpen(alert)}>
                  {openLabel || t("executions.view")}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
