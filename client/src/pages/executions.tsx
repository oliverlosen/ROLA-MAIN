import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Eye, Pencil, Download, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { GlobalFilters, useFilters } from "@/components/global-filters";
import { CURRENCY_SYMBOLS } from "@shared/schema";
import type { ExecutionWithDetails } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const STATUS_BADGE_VARIANT: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  executed: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  evidence_uploaded: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  closed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

function formatUSD(val: number | string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(val));
}

export default function ExecutionsPage() {
  const { filterParams } = useFilters();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("execution_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const limit = 20;

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

  const queryStr = filterParams
    ? `${filterParams}&page=${page}&limit=${limit}&sortBy=${sortBy}&sortDir=${sortDir}`
    : `?page=${page}&limit=${limit}&sortBy=${sortBy}&sortDir=${sortDir}`;

  const { data, isLoading } = useQuery<{ executions: ExecutionWithDetails[]; total: number }>({
    queryKey: ["/api/executions", queryStr],
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;
  const canCreate = user?.role === "admin" || user?.role === "editor";

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(1);
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`/api/executions/export${filterParams}`, { credentials: "include" });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `executions_${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t("executions.exportFailed"), variant: "destructive" });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-executions-title">{t("executions.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} ${t("executions.records")}` : t("executions.loading")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-1" />
            {t("executions.exportCsv")}
          </Button>
          {canCreate && (
            <Link href="/executions/new">
              <Button size="sm" data-testid="button-new-execution">
                <Plus className="w-4 h-4 mr-1" />
                {t("executions.newExecution")}
              </Button>
            </Link>
          )}
        </div>
      </div>

      <GlobalFilters />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHeader column="execution_date" label={t("executions.date")} current={sortBy} dir={sortDir} onSort={handleSort} />
                      <TableHead>{t("executions.country")}</TableHead>
                      <TableHead>{t("executions.brand")}</TableHead>
                      <TableHead>{t("executions.titleLabel")}</TableHead>
                      <SortableHeader column="execution_type" label={t("executions.type")} current={sortBy} dir={sortDir} onSort={handleSort} />
                      <SortableHeader column="media_value_usd" label={t("executions.valueUsd")} current={sortBy} dir={sortDir} onSort={handleSort} />
                      <TableHead>{t("executions.status")}</TableHead>
                      <TableHead>{t("executions.owner")}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.executions.map((exec) => (
                      <TableRow key={exec.id} data-testid={`row-execution-${exec.id}`}>
                        <TableCell className="text-sm">
                          {exec.executionDate ? format(new Date(exec.executionDate), "MMM d, yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-sm">{exec.country?.name || "-"}</TableCell>
                        <TableCell className="text-sm font-medium">{exec.brand?.name || "-"}</TableCell>
                        <TableCell className="text-sm truncate max-w-[150px]">{exec.title?.name || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {typeLabel(exec.executionType)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{formatUSD(exec.mediaValueUsd)}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${STATUS_BADGE_VARIANT[exec.status] || ""}`}>
                            {statusLabel(exec.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{exec.owner?.displayName || "-"}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-actions-${exec.id}`}>
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <Link href={`/executions/${exec.id}`}>
                                <DropdownMenuItem>
                                  <Eye className="w-4 h-4 mr-2" />
                                  {t("executions.view")}
                                </DropdownMenuItem>
                              </Link>
                              {canCreate && (
                                <Link href={`/executions/${exec.id}/edit`}>
                                  <DropdownMenuItem>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    {t("executions.edit")}
                                  </DropdownMenuItem>
                                </Link>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                    {data?.executions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          {t("executions.noExecutionsFound")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 p-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    {t("executions.page")} {page} {t("executions.of")} {totalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SortableHeader({ column, label, current, dir, onSort }: { column: string; label: string; current: string; dir: string; onSort: (c: string) => void }) {
  return (
    <TableHead>
      <button onClick={() => onSort(column)} className="flex items-center gap-1 text-xs font-medium">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${current === column ? "text-foreground" : "text-muted-foreground"}`} />
      </button>
    </TableHead>
  );
}
