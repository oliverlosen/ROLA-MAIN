import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarRange, ChevronRight, Gauge, Layers3, MessageSquare, Send, Siren, Target } from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AutomationAlertList } from "@/components/automation-alert-list";
import {
  ExecutionFiltersBar,
  buildFilterParams,
  createFilterState,
  type FilterState,
} from "@/components/global-filters";
import {
  ExecutionPortfolioGantt,
  type PortfolioGanttScale,
} from "@/components/execution-portfolio-gantt";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import type {
  AutomationAlertWithContext,
  ExecutionPortfolioGanttResponse,
} from "@shared/schema";

const OPEN_EXECUTION_STATUSES = ["draft", "in_review", "approved", "executed", "evidence_uploaded"];

function createDefaultFilters(): FilterState {
  return createFilterState({ statuses: OPEN_EXECUTION_STATUSES });
}

export default function GanttPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters());
  const [scale, setScale] = useState<PortfolioGanttScale>("month");
  const [selectedExecutionId, setSelectedExecutionId] = useState<number | null>(null);
  const [plannedStartDate, setPlannedStartDate] = useState("");
  const [plannedEndDate, setPlannedEndDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("draft");
  const [progressOverride, setProgressOverride] = useState("");

  const filterParams = useMemo(() => buildFilterParams(filters), [filters]);
  const ganttQueryKey = filterParams ? ["/api/executions/gantt", filterParams] : ["/api/executions/gantt"];

  const { data, isLoading } = useQuery<ExecutionPortfolioGanttResponse>({
    queryKey: ganttQueryKey,
  });

  const selectedExecution = useMemo(
    () => data?.executions.find((execution) => execution.id === selectedExecutionId) || null,
    [data?.executions, selectedExecutionId],
  );

  useEffect(() => {
    if (selectedExecutionId && !selectedExecution) {
      setSelectedExecutionId(null);
    }
  }, [selectedExecutionId, selectedExecution]);

  useEffect(() => {
    if (!selectedExecution) return;
    setPlannedStartDate(selectedExecution.plannedStartDate || "");
    setPlannedEndDate(selectedExecution.plannedEndDate || "");
    setDueDate(selectedExecution.dueDate || "");
    setStatus(selectedExecution.status);
    setProgressOverride(typeof selectedExecution.progressOverride === "number" ? String(selectedExecution.progressOverride) : "");
  }, [selectedExecution]);

  const { data: selectedAlerts } = useQuery<AutomationAlertWithContext[]>({
    queryKey: selectedExecutionId ? ["/api/executions", selectedExecutionId, "alerts"] : ["/api/executions", "selected", "alerts"],
    enabled: Boolean(selectedExecutionId),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedExecutionId) return;
      await apiRequest("PATCH", `/api/executions/${selectedExecutionId}`, {
        plannedStartDate: plannedStartDate || null,
        plannedEndDate: plannedEndDate || null,
        dueDate: dueDate || null,
        status,
        progressOverride: progressOverride === "" ? null : Number(progressOverride),
        updatedBy: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/executions/gantt"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/operational-risk"] });
      toast({ title: t("gantt.updated") });
    },
    onError: (error: any) => {
      toast({ title: t("executionForm.error"), description: error.message, variant: "destructive" });
    },
  });

  const statusLabel = (value: string) => {
    const labels: Record<string, string> = {
      draft: t("status.draft"),
      in_review: t("status.inReview"),
      approved: t("status.approved"),
      executed: t("status.executed"),
      evidence_uploaded: t("status.evidenceUploaded"),
      closed: t("status.closedReported"),
    };
    return labels[value] || value;
  };

  const typeLabel = (value: string) => {
    const labels: Record<string, string> = {
      canje: t("executionType.canje"),
      publicity: t("executionType.publicity"),
      third_party: t("executionType.thirdParty"),
    };
    return labels[value] || value;
  };

  const scaleOptions: Array<{ value: PortfolioGanttScale; label: string }> = [
    { value: "week", label: t("gantt.scaleWeek") },
    { value: "month", label: t("gantt.scaleMonth") },
    { value: "quarter", label: t("gantt.scaleQuarter") },
    { value: "year", label: t("gantt.scaleYear") },
  ];

  const openExecutionChat = async () => {
    if (!selectedExecutionId) return;
    try {
      const res = await apiRequest("GET", `/api/executions/${selectedExecutionId}/conversation`);
      const conversation = await res.json();
      navigate(`/chat/${conversation.id}`);
    } catch {
      navigate("/chat");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
      <section className="relative overflow-hidden rounded-[28px] border bg-gradient-to-br from-[#dff5f1] via-background to-[#f4ebe3] p-6 md:p-8 shadow-sm">
        <div className="absolute inset-y-0 right-0 w-[36%] bg-[radial-gradient(circle_at_top_right,_rgba(0,128,102,0.14),_transparent_55%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <CalendarRange className="w-3.5 h-3.5" />
              {t("gantt.portfolioLabel")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight" data-testid="text-gantt-title">
              {t("gantt.title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
              {t("gantt.subtitle")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {scaleOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={scale === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setScale(option.value)}
                data-testid={`button-gantt-scale-${option.value}`}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((item) => (
            <Card key={item}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard
            title={t("gantt.visibleExecutions")}
            value={String(data?.summary.executionCount || 0)}
            icon={<Layers3 className="w-4 h-4" />}
          />
          <MetricCard
            title={t("gantt.avgProgress")}
            value={`${data?.summary.avgProgress || 0}%`}
            icon={<Gauge className="w-4 h-4" />}
          />
          <MetricCard
            title={t("automation.atRisk")}
            value={String(data?.summary.atRiskCount || 0)}
            icon={<Siren className="w-4 h-4" />}
          />
          <MetricCard
            title={t("automation.openAlerts")}
            value={String(data?.summary.openAlertCount || 0)}
            icon={<Target className="w-4 h-4" />}
          />
        </div>
      )}

      <Card className="border-dashed">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold">{t("gantt.filtersTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("gantt.filtersHint")}</p>
            </div>
            <Badge variant="outline">
              {t("gantt.scale")}: {scaleOptions.find((option) => option.value === scale)?.label}
            </Badge>
          </div>
          <ExecutionFiltersBar
            filters={filters}
            onChange={setFilters}
            onReset={() => setFilters(createDefaultFilters())}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold">{t("gantt.timelineTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("gantt.timelineHint")}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t("gantt.openExecutions")}: {data?.summary.openExecutionCount || 0}</span>
              <ChevronRight className="w-3 h-3" />
              <span>{t("gantt.visibleExecutions")}: {data?.summary.executionCount || 0}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((item) => <Skeleton key={item} className="h-28 w-full" />)}
            </div>
          ) : (
            <ExecutionPortfolioGantt
              rows={data?.executions || []}
              scale={scale}
              rangeStart={data?.summary.rangeStart}
              rangeEnd={data?.summary.rangeEnd}
              selectedId={selectedExecutionId}
              emptyMessage={t("gantt.noExecutions")}
              getStatusLabel={statusLabel}
              getTypeLabel={typeLabel}
              onSelect={setSelectedExecutionId}
            />
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedExecution)} onOpenChange={(open) => !open && setSelectedExecutionId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedExecution ? (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div>
                    <SheetTitle>
                      {selectedExecution.brand?.name || "-"} - {selectedExecution.title?.name || t("executionDetail.untitled")}
                    </SheetTitle>
                    <SheetDescription>
                      {selectedExecution.campaignName || t("crm.none")} · {selectedExecution.accountName || t("crm.none")}
                    </SheetDescription>
                  </div>
                  <Badge variant="outline">{statusLabel(selectedExecution.status)}</Badge>
                </div>
              </SheetHeader>

              <div className="grid grid-cols-2 gap-3">
                <MiniMetric label={t("automation.progress")} value={`${selectedExecution.progress}%`} />
                <MiniMetric label={t("automation.openAlerts")} value={String(selectedExecution.openAlertCount)} />
                <MiniMetric label={t("gantt.owner")} value={selectedExecution.owner?.displayName || t("tasks.unassigned")} />
                <MiniMetric label={t("executions.type")} value={typeLabel(selectedExecution.executionType)} />
              </div>

              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">{t("gantt.quickActions")}</h3>
                      <p className="text-xs text-muted-foreground">{t("gantt.quickActionsHint")}</p>
                    </div>
                    {!canEdit ? <Badge variant="secondary">{t("gantt.readOnly")}</Badge> : null}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/executions/${selectedExecution.id}`)}>
                    <ChevronRight className="w-4 h-4 mr-1" />
                    {t("gantt.openDetail")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={openExecutionChat}>
                    <MessageSquare className="w-4 h-4 mr-1" />
                    {t("gantt.openChat")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/email?compose=1&executionId=${selectedExecution.id}`)}>
                    <Send className="w-4 h-4 mr-1" />
                    {t("gantt.composeEmail")}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <h3 className="text-sm font-semibold">{t("gantt.controlPanel")}</h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="planned-start-date">{t("automation.plannedStartDate")}</Label>
                      <Input
                        id="planned-start-date"
                        type="date"
                        value={plannedStartDate}
                        onChange={(event) => setPlannedStartDate(event.target.value)}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="planned-end-date">{t("automation.plannedEndDate")}</Label>
                      <Input
                        id="planned-end-date"
                        type="date"
                        value={plannedEndDate}
                        onChange={(event) => setPlannedEndDate(event.target.value)}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="execution-due-date">{t("executionForm.dueDate")}</Label>
                      <Input
                        id="execution-due-date"
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("executions.status")}</Label>
                      <Select value={status} onValueChange={setStatus} disabled={!canEdit}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["draft", "in_review", "approved", "executed", "evidence_uploaded", "closed"].map((option) => (
                            <SelectItem key={option} value={option}>
                              {statusLabel(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="progress-override">{t("gantt.progressOverride")}</Label>
                    <Input
                      id="progress-override"
                      type="number"
                      min="0"
                      max="100"
                      value={progressOverride}
                      onChange={(event) => setProgressOverride(event.target.value)}
                      placeholder="Auto"
                      disabled={!canEdit}
                    />
                    <p className="text-xs text-muted-foreground">{t("gantt.progressOverrideHint")}</p>
                  </div>

                  {canEdit ? (
                    <div className="flex justify-end">
                      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                        {t("gantt.saveChanges")}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">{t("automation.alerts")}</h3>
                    <Badge variant="outline">{selectedExecution.openAlertCount}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <AutomationAlertList
                    alerts={selectedAlerts}
                    emptyMessage={t("automation.noAlerts")}
                  />
                </CardContent>
              </Card>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MetricCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
