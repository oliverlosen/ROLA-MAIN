import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DollarSign, FileSpreadsheet, TrendingUp, PieChart, TriangleAlert, Clock3, MessageCircleReply, Siren } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { AutomationAlertList } from "@/components/automation-alert-list";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart as RechartPie, Pie, Cell, CartesianGrid, Legend,
} from "recharts";
import { GlobalFilters, useFilters } from "@/components/global-filters";
import type { OperationalRiskSummary } from "@shared/schema";
import { useLocation } from "wouter";

const CHART_COLORS = [
  "hsl(177, 51%, 48%)",
  "hsl(354, 70%, 35%)",
  "hsl(180, 3%, 28%)",
  "hsl(177, 40%, 52%)",
  "hsl(354, 55%, 48%)",
  "hsl(200, 60%, 50%)",
  "hsl(30, 80%, 50%)",
];

function formatUSD(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

export default function DashboardPage() {
  const { filters, filterParams } = useFilters();
  const { t } = useLanguage();
  const [, navigate] = useLocation();

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      draft: t("status.draft"),
      in_review: t("status.inReview"),
      approved: t("status.approved"),
      executed: t("status.executed"),
      evidence_uploaded: t("status.evidenceUploaded"),
      closed: t("status.closedReported"),
    };
    return map[s] || s;
  };

  const typeLabel = (tp: string) => {
    const map: Record<string, string> = {
      canje: t("executionType.canje"),
      publicity: t("executionType.publicity"),
      third_party: t("executionType.thirdParty"),
    };
    return map[tp] || tp;
  };

  const { data: stats, isLoading } = useQuery<{
    totalMediaValueUsd: number;
    executionCount: number;
    avgMediaValueUsd: number;
    byType: { type: string; count: number; value: number }[];
    byStatus: { status: string; count: number }[];
    byCountry: { name: string; value: number }[];
    byBrand: { name: string; value: number }[];
    trend: { period: string; value: number }[];
  }>({
    queryKey: ["/api/dashboard", filterParams],
  });

  const { data: riskSummary } = useQuery<OperationalRiskSummary>({
    queryKey: ["/api/dashboard/operational-risk"],
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-dashboard-title">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
      </div>

      <GlobalFilters />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title={t("dashboard.totalMediaValue")}
              value={formatUSD(stats.totalMediaValueUsd)}
              icon={<DollarSign className="w-4 h-4" />}
              testId="kpi-total-value"
            />
            <KPICard
              title={t("dashboard.executions")}
              value={stats.executionCount.toLocaleString()}
              icon={<FileSpreadsheet className="w-4 h-4" />}
              testId="kpi-exec-count"
            />
            <KPICard
              title={t("dashboard.avgValuePerExecution")}
              value={formatUSD(stats.avgMediaValueUsd)}
              icon={<TrendingUp className="w-4 h-4" />}
              testId="kpi-avg-value"
            />
            <KPICard
              title={t("dashboard.executionTypes")}
              value={stats.byType.length.toString()}
              icon={<PieChart className="w-4 h-4" />}
              testId="kpi-types"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title={t("automation.atRisk")}
              value={String(riskSummary?.highSeverityCount || 0)}
              icon={<TriangleAlert className="w-4 h-4" />}
              testId="kpi-risk-high"
            />
            <KPICard
              title={t("automation.overdueTasks")}
              value={String(riskSummary?.overdueTaskCount || 0)}
              icon={<Clock3 className="w-4 h-4" />}
              testId="kpi-overdue-tasks"
            />
            <KPICard
              title={t("automation.overdueExecutions")}
              value={String(riskSummary?.overdueExecutionCount || 0)}
              icon={<Siren className="w-4 h-4" />}
              testId="kpi-overdue-executions"
            />
            <KPICard
              title={t("automation.pendingReplies")}
              value={String(riskSummary?.pendingReplyCount || 0)}
              icon={<MessageCircleReply className="w-4 h-4" />}
              testId="kpi-pending-replies"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <h3 className="text-sm font-semibold">{t("dashboard.mediaValueTrend")}</h3>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => formatUSD(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                      <Bar dataKey="value" fill="hsl(177, 51%, 48%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <h3 className="text-sm font-semibold">{t("dashboard.byExecutionType")}</h3>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartPie>
                      <Pie
                        data={stats.byType.map(t => ({ name: typeLabel(t.type), value: t.value }))}
                        cx="50%" cy="50%" outerRadius={90} innerRadius={50}
                        dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {stats.byType.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatUSD(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                    </RechartPie>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <h3 className="text-sm font-semibold">{t("dashboard.topCountriesByMediaValue")}</h3>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.byCountry.slice(0, 7)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={80} />
                      <Tooltip formatter={(v: number) => formatUSD(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                      <Bar dataKey="value" fill="hsl(354, 70%, 35%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <h3 className="text-sm font-semibold">{t("dashboard.pipelineByStatus")}</h3>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.byStatus.map(s => ({ name: statusLabel(s.status), count: s.count }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                      <Bar dataKey="count" fill="hsl(177, 40%, 52%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <h3 className="text-sm font-semibold">{t("dashboard.topBrandsByMediaValue")}</h3>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {stats.byBrand.slice(0, 8).map((b, i) => (
                    <div key={b.name} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm truncate">{b.name}</span>
                          <span className="text-sm font-medium">{formatUSD(b.value)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (b.value / (stats.byBrand[0]?.value || 1)) * 100)}%`,
                              backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {stats.byBrand.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("dashboard.noData")}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <h3 className="text-sm font-semibold">{t("dashboard.executionTypeBreakdown")}</h3>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {stats.byType.map((tp, i) => {
                    const pct = stats.executionCount > 0 ? ((tp.count / stats.executionCount) * 100).toFixed(1) : "0";
                    return (
                      <div key={tp.type} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm">{typeLabel(tp.type)}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">{tp.count}</Badge>
                              <span className="text-sm text-muted-foreground w-10 text-right">{pct}%</span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">{formatUSD(tp.value)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {stats.byType.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("dashboard.noData")}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{t("automation.topAlerts")}</h3>
                <Badge variant="outline">{riskSummary?.openAlertCount || 0}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <AutomationAlertList
                alerts={riskSummary?.topAlerts}
                emptyMessage={t("automation.noAlerts")}
                onOpen={(alert) => {
                  if (alert.executionId) {
                    navigate(`/executions/${alert.executionId}`);
                    return;
                  }
                  if (alert.campaignId) {
                    navigate(`/campaigns/${alert.campaignId}`);
                  }
                }}
                openLabel={t("executions.view")}
                limit={5}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function KPICard({ title, value, icon, testId }: { title: string; value: string; icon: React.ReactNode; testId: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs text-muted-foreground">{title}</span>
          <div className="text-muted-foreground">{icon}</div>
        </div>
        <p className="text-2xl font-bold" data-testid={testId}>{value}</p>
      </CardContent>
    </Card>
  );
}
