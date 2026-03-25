import {
  addDays,
  addMonths,
  addQuarters,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarQuarters,
  differenceInCalendarWeeks,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { AlertTriangle, CalendarRange, CheckCircle2, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";
import type { ExecutionPortfolioGanttItem } from "@shared/schema";

export type PortfolioGanttScale = "week" | "month" | "quarter" | "year";

type ExecutionPortfolioGanttProps = {
  rows: ExecutionPortfolioGanttItem[];
  scale: PortfolioGanttScale;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  selectedId?: number | null;
  emptyMessage: string;
  getStatusLabel: (status: string) => string;
  getTypeLabel: (type: string) => string;
  onSelect: (executionId: number) => void;
};

type TimelineUnit = {
  key: string;
  label: string;
  groupLabel: string;
  start: Date;
  end: Date;
};

const INFO_PANEL_WIDTH = 348;

function parseDay(value: string | null | undefined) {
  return value ? new Date(`${value}T12:00:00`) : null;
}

function getBounds(rows: ExecutionPortfolioGanttItem[], rangeStart?: string | null, rangeEnd?: string | null) {
  const starts = rows.map((row) => row.rangeStart).filter((value): value is string => Boolean(value)).sort();
  const ends = rows.map((row) => row.rangeEnd).filter((value): value is string => Boolean(value)).sort();
  return {
    start: parseDay(rangeStart || starts[0] || null),
    end: parseDay(rangeEnd || ends[ends.length - 1] || starts[0] || null),
  };
}

function buildTimelineUnits(scale: PortfolioGanttScale, start: Date | null, end: Date | null) {
  if (!start || !end) return { units: [] as TimelineUnit[], cellWidth: 72 };

  if (scale === "week") {
    const units: TimelineUnit[] = [];
    let current = startOfWeek(start, { weekStartsOn: 1 });
    const last = endOfWeek(end, { weekStartsOn: 1 });
    while (current <= last) {
      units.push({
        key: format(current, "yyyy-MM-dd"),
        label: format(current, "d"),
        groupLabel: format(current, "MMM yyyy"),
        start: current,
        end: current,
      });
      current = addDays(current, 1);
    }
    return { units, cellWidth: 54 };
  }

  if (scale === "month") {
    const units: TimelineUnit[] = [];
    let current = startOfWeek(startOfMonth(start), { weekStartsOn: 1 });
    const last = endOfWeek(endOfMonth(end), { weekStartsOn: 1 });
    while (current <= last) {
      const pivot = addDays(current, 3);
      units.push({
        key: format(current, "yyyy-MM-dd"),
        label: `${format(current, "MMM d")} - ${format(endOfWeek(current, { weekStartsOn: 1 }), "d")}`,
        groupLabel: format(pivot, "MMMM yyyy"),
        start: current,
        end: endOfWeek(current, { weekStartsOn: 1 }),
      });
      current = addDays(current, 7);
    }
    return { units, cellWidth: 96 };
  }

  if (scale === "quarter") {
    const units: TimelineUnit[] = [];
    let current = startOfQuarter(start);
    const last = endOfQuarter(end);
    while (current <= last) {
      units.push({
        key: format(current, "yyyy-MM"),
        label: format(current, "MMM"),
        groupLabel: `Q${Math.floor(current.getMonth() / 3) + 1} ${format(current, "yyyy")}`,
        start: current,
        end: endOfMonth(current),
      });
      current = addMonths(current, 1);
    }
    return { units, cellWidth: 92 };
  }

  const units: TimelineUnit[] = [];
  let current = startOfYear(start);
  const last = endOfYear(end);
  while (current <= last) {
    units.push({
      key: format(current, "yyyy-'Q'Q"),
      label: `Q${Math.floor(current.getMonth() / 3) + 1}`,
      groupLabel: format(current, "yyyy"),
      start: current,
      end: endOfQuarter(current),
    });
    current = addQuarters(current, 1);
  }
  return { units, cellWidth: 104 };
}

function getUnitIndex(scale: PortfolioGanttScale, value: Date, timelineStart: Date) {
  if (scale === "week") return differenceInCalendarDays(value, timelineStart);
  if (scale === "month") return differenceInCalendarWeeks(startOfWeek(value, { weekStartsOn: 1 }), timelineStart, { weekStartsOn: 1 });
  if (scale === "quarter") return differenceInCalendarMonths(startOfMonth(value), timelineStart);
  return differenceInCalendarQuarters(startOfQuarter(value), timelineStart);
}

function getTodayOffset(scale: PortfolioGanttScale, timelineStart: Date, timelineLength: number) {
  const today = new Date();
  const offset = getUnitIndex(scale, today, timelineStart);
  return offset >= 0 && offset < timelineLength ? offset : null;
}

export function ExecutionPortfolioGantt({
  rows,
  scale,
  rangeStart,
  rangeEnd,
  selectedId,
  emptyMessage,
  getStatusLabel,
  getTypeLabel,
  onSelect,
}: ExecutionPortfolioGanttProps) {
  const { t } = useLanguage();

  if (!rows.length) {
    return <p className="text-sm text-muted-foreground text-center py-10">{emptyMessage}</p>;
  }

  const bounds = getBounds(rows, rangeStart, rangeEnd);
  const { units, cellWidth } = buildTimelineUnits(scale, bounds.start, bounds.end);
  const timelineWidth = Math.max(units.length * cellWidth, 640);
  const todayOffset = bounds.start ? getTodayOffset(scale, units[0]?.start || bounds.start, units.length) : null;
  const groups = units.reduce<Array<{ label: string; count: number }>>((acc, unit) => {
    const last = acc[acc.length - 1];
    if (last && last.label === unit.groupLabel) {
      last.count += 1;
      return acc;
    }
    acc.push({ label: unit.groupLabel, count: 1 });
    return acc;
  }, []);

  return (
    <div className="rounded-2xl border bg-card/80 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: INFO_PANEL_WIDTH + timelineWidth }}>
          <div className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
            <div className="flex">
              <div
                className="sticky left-0 z-30 shrink-0 border-r bg-card/95 backdrop-blur"
                style={{ width: INFO_PANEL_WIDTH }}
              >
                <div className="px-5 py-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{t("gantt.executionList")}</p>
                  <p className="text-sm font-semibold">{rows.length} {t("executions.records")}</p>
                </div>
              </div>

              <div className="shrink-0" style={{ width: timelineWidth }}>
                <div className="flex border-b bg-muted/30">
                  {groups.map((group) => (
                    <div
                      key={group.label}
                      className="px-3 py-2 text-xs font-medium text-muted-foreground border-r last:border-r-0"
                      style={{ width: group.count * cellWidth }}
                    >
                      {group.label}
                    </div>
                  ))}
                </div>
                <div className="flex">
                  {units.map((unit) => (
                    <div
                      key={unit.key}
                      className="border-r px-2 py-2 text-xs text-muted-foreground last:border-r-0"
                      style={{ width: cellWidth }}
                    >
                      {unit.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="divide-y">
            {rows.map((row) => {
              const startDate = parseDay(row.rangeStart);
              const endDate = parseDay(row.rangeEnd);
              const timelineStart = units[0]?.start || bounds.start;
              const hasSchedule = Boolean(startDate && endDate && timelineStart);
              const startIndex = hasSchedule && timelineStart ? getUnitIndex(scale, startDate!, timelineStart) : 0;
              const endIndex = hasSchedule && timelineStart ? getUnitIndex(scale, endDate!, timelineStart) : 0;
              const left = Math.max(0, startIndex) * cellWidth + 6;
              const width = Math.max((Math.max(startIndex, endIndex) - Math.max(0, startIndex) + 1) * cellWidth - 12, Math.min(160, cellWidth * 1.2));

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onSelect(row.id)}
                  className={cn(
                    "group flex w-full text-left transition-colors",
                    row.id === selectedId ? "bg-primary/5" : "hover:bg-muted/30",
                  )}
                >
                  <div
                    className={cn(
                      "sticky left-0 z-10 shrink-0 border-r bg-card/95 backdrop-blur",
                      row.id === selectedId ? "bg-primary/5" : "bg-card/95",
                    )}
                    style={{ width: INFO_PANEL_WIDTH }}
                  >
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {row.brand?.name || "-"} - {row.title?.name || t("executionDetail.untitled")}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground truncate">
                            {row.campaignName || t("crm.none")} · {row.accountName || t("crm.none")}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground shrink-0">{row.progress}%</span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{getStatusLabel(row.status)}</Badge>
                        <Badge variant="secondary">{row.country?.name || "-"}</Badge>
                        {row.openAlertCount > 0 ? (
                          <Badge className={row.atRisk ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300" : ""}>
                            {row.openAlertCount} {t("automation.alerts").toLowerCase()}
                          </Badge>
                        ) : null}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 truncate">
                          <CalendarRange className="w-3.5 h-3.5" />
                          {row.rangeStart || t("automation.noSchedule")}
                        </span>
                        <span className="inline-flex items-center gap-1 truncate">
                          <Clock3 className="w-3.5 h-3.5" />
                          {row.owner?.displayName || t("tasks.unassigned")}
                        </span>
                        <span className="inline-flex items-center gap-1 truncate">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {row.completedTaskCount}/{row.activeTaskCount} {t("tasks.title").toLowerCase()}
                        </span>
                        <span className="inline-flex items-center gap-1 truncate">
                          <AlertTriangle className={cn("w-3.5 h-3.5", row.atRisk ? "text-red-600" : "text-muted-foreground")} />
                          {row.atRisk ? t("automation.atRisk") : t("gantt.onTrack")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="relative shrink-0" style={{ width: timelineWidth }}>
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px)`,
                        backgroundSize: `${cellWidth}px 100%`,
                      }}
                    />

                    {todayOffset !== null ? (
                      <div
                        className="absolute top-0 bottom-0 z-10 bg-primary/20"
                        style={{ left: todayOffset * cellWidth + Math.floor(cellWidth / 2), width: 2 }}
                      />
                    ) : null}

                    <div className="relative flex h-[118px] items-center px-3">
                      {hasSchedule ? (
                        <div
                          className={cn(
                            "absolute flex h-12 items-center overflow-hidden rounded-2xl border shadow-sm",
                            row.atRisk
                              ? "border-red-300 bg-red-100/80 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
                              : "border-primary/25 bg-primary/15 text-foreground",
                          )}
                          style={{ left, width }}
                        >
                          <div
                            className={cn(
                              "absolute inset-y-0 left-0 rounded-r-2xl",
                              row.atRisk ? "bg-red-500/35" : "bg-primary/25",
                            )}
                            style={{ width: `${row.progress}%` }}
                          />
                          <div className="relative flex w-full items-center justify-between gap-3 px-4">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {row.rangeStart} - {row.rangeEnd}
                              </p>
                              <p className="truncate text-xs opacity-80">
                                {getTypeLabel(row.executionType)} · {row.owner?.displayName || t("tasks.unassigned")}
                              </p>
                            </div>
                            {row.atRisk ? <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" /> : null}
                          </div>
                        </div>
                      ) : (
                        <div className="flex w-full items-center justify-center rounded-2xl border border-dashed bg-muted/30 py-5 text-sm text-muted-foreground">
                          {t("automation.noSchedule")}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
