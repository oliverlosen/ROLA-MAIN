import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { ArrowLeft, BriefcaseBusiness, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AutomationAlertList } from "@/components/automation-alert-list";
import { GanttChart } from "@/components/gantt-chart";
import { useLanguage } from "@/lib/i18n";
import type { AutomationAlertWithContext, CampaignGanttItem, CampaignWithDetails } from "@shared/schema";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { t } = useLanguage();

  const { data: campaign, isLoading } = useQuery<CampaignWithDetails>({
    queryKey: ["/api/campaigns", id],
  });

  const { data: gantt } = useQuery<CampaignGanttItem>({
    queryKey: ["/api/campaigns", id, "gantt"],
  });

  const openAlert = (alert: AutomationAlertWithContext) => {
    if (alert.executionId) {
      navigate(`/executions/${alert.executionId}`);
      return;
    }
    navigate(`/campaigns/${id}`);
  };

  const campaignStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      planning: t("crm.campaignStatusPlanning"),
      active: t("crm.campaignStatusActive"),
      completed: t("crm.campaignStatusCompleted"),
      on_hold: t("crm.campaignStatusOnHold"),
    };
    return map[status] || status;
  };

  const executionStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      draft: t("status.draft"),
      in_review: t("status.inReview"),
      approved: t("status.approved"),
      executed: t("status.executed"),
      evidence_uploaded: t("status.evidenceUploaded"),
      closed: t("status.closedReported"),
    };
    return map[status] || status;
  };

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-[640px] w-full" /></div>;
  }

  if (!campaign) {
    return <div className="p-6 text-center text-muted-foreground">{t("crm.campaignNotFound")}</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(campaign.accountId ? `/accounts/${campaign.accountId}` : "/accounts")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-campaign-detail-title">{campaign.name}</h1>
            <p className="text-sm text-muted-foreground">{t("crm.campaignDetailSubtitle")}</p>
          </div>
        </div>
        {campaign.account ? (
          <Link href={`/accounts/${campaign.account.id}`}>
            <Button variant="outline">
              <BriefcaseBusiness className="w-4 h-4 mr-1" />
              {campaign.account.name}
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{t("crm.campaignOverview")}</h2>
                  <p className="text-xs text-muted-foreground">{campaign.description || t("crm.noDescription")}</p>
                </div>
                <Badge variant="secondary">{campaignStatusLabel(campaign.status)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric label={t("automation.progress")} value={`${campaign.progress || 0}%`} />
                <Metric label={t("automation.openAlerts")} value={String(campaign.openAlertCount || 0)} />
                <Metric label={t("crm.startDate")} value={campaign.startDate ? format(new Date(campaign.startDate), "MMM d, yyyy") : "-"} />
                <Metric label={t("crm.endDate")} value={campaign.endDate ? format(new Date(campaign.endDate), "MMM d, yyyy") : "-"} />
              </div>
              <Progress value={campaign.progress || 0} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-semibold">{t("automation.campaignGantt")}</h2>
            </CardHeader>
            <CardContent>
              <GanttChart
                rows={(gantt?.executions || []).map((execution) => ({
                  id: execution.id,
                  label: `${execution.brand?.name || "-"} - ${execution.title?.name || t("executionDetail.untitled")}`,
                  secondary: execution.country?.name || "-",
                  rangeStart: execution.rangeStart,
                  rangeEnd: execution.rangeEnd,
                  progress: execution.progress,
                  statusLabel: executionStatusLabel(execution.status),
                  alertCount: execution.openAlertCount,
                  atRisk: execution.atRisk,
                  onClick: () => navigate(`/executions/${execution.id}`),
                }))}
                rangeStart={gantt?.rangeStart}
                rangeEnd={gantt?.rangeEnd}
                emptyMessage={t("automation.noCampaignExecutions")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                {t("crm.linkedExecutions")}
              </h2>
            </CardHeader>
            <CardContent>
              {campaign.executions && campaign.executions.length > 0 ? (
                <div className="space-y-2">
                  {campaign.executions.map((execution) => (
                    <Link key={execution.id} href={`/executions/${execution.id}`}>
                      <button type="button" className="w-full rounded-md border p-3 text-left hover:bg-muted/40 transition-colors">
                        <p className="font-medium text-sm">{execution.brand?.name} - {execution.title?.name || t("executionDetail.untitled")}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {execution.country?.name || "-"} · {execution.executionDate ? format(new Date(execution.executionDate), "MMM d, yyyy") : "-"}
                        </p>
                      </button>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">{t("crm.noLinkedExecutions")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">{t("automation.alerts")}</h2>
                <Badge variant="outline">{gantt?.alerts.filter((alert) => alert.status === "open").length || 0}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <AutomationAlertList
                alerts={gantt?.alerts}
                emptyMessage={t("automation.noAlerts")}
                onOpen={openAlert}
                openLabel={t("executions.view")}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
