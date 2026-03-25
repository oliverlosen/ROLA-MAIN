import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/i18n";

export type GanttRow = {
  id: number | string;
  label: string;
  secondary?: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  progress: number;
  statusLabel?: string | null;
  alertCount?: number;
  atRisk?: boolean;
  onClick?: () => void;
};

type GanttChartProps = {
  rows: GanttRow[];
  rangeStart?: string | null;
  rangeEnd?: string | null;
  emptyMessage: string;
};

function parseDay(value: string | null | undefined) {
  return value ? new Date(`${value}T12:00:00`) : null;
}

function formatDay(value: string | null | undefined) {
  const date = parseDay(value);
  return date ? format(date, "MMM d") : "-";
}

function getChartBounds(rows: GanttRow[], rangeStart?: string | null, rangeEnd?: string | null) {
  const starts = rows.map((row) => row.rangeStart).filter((value): value is string => Boolean(value));
  const ends = rows.map((row) => row.rangeEnd).filter((value): value is string => Boolean(value));
  const min = rangeStart || starts.sort()[0] || null;
  const max = rangeEnd || ends.sort()[ends.length - 1] || min;
  return { min, max };
}

function getOffsets(start: string | null, end: string | null, min: string | null, max: string | null) {
  const startDate = parseDay(start);
  const endDate = parseDay(end);
  const minDate = parseDay(min);
  const maxDate = parseDay(max);

  if (!startDate || !endDate || !minDate || !maxDate) {
    return { left: 0, width: 0 };
  }

  const total = Math.max(maxDate.getTime() - minDate.getTime(), 24 * 60 * 60 * 1000);
  const left = ((startDate.getTime() - minDate.getTime()) / total) * 100;
  const width = Math.max(((endDate.getTime() - startDate.getTime()) / total) * 100, 4);
  return { left: Math.max(0, left), width: Math.min(100, width) };
}

export function GanttChart({ rows, rangeStart, rangeEnd, emptyMessage }: GanttChartProps) {
  const { t } = useLanguage();
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>;
  }

  const bounds = getChartBounds(rows, rangeStart, rangeEnd);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{formatDay(bounds.min)}</span>
        <span>{formatDay(bounds.max)}</span>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const offsets = getOffsets(row.rangeStart, row.rangeEnd, bounds.min, bounds.max);
          const content = (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{row.label}</p>
                    {row.statusLabel ? <Badge variant="outline">{row.statusLabel}</Badge> : null}
                    {row.alertCount ? (
                      <Badge variant="outline" className={row.atRisk ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-300" : ""}>
                        {row.alertCount} {t("automation.alerts").toLowerCase()}
                      </Badge>
                    ) : null}
                    {row.atRisk ? <AlertTriangle className="w-4 h-4 text-red-600" /> : null}
                  </div>
                  {row.secondary ? <p className="text-xs text-muted-foreground mt-1">{row.secondary}</p> : null}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{row.progress}%</span>
              </div>
              <Progress value={row.progress} className="h-2 mt-2" />
              <div className="mt-2 rounded-md bg-muted/70 p-2">
                <div className="relative h-6 rounded-md bg-background/70 overflow-hidden">
                  {offsets.width > 0 ? (
                    <div
                      className={`absolute inset-y-0 rounded-md ${row.atRisk ? "bg-red-500/80" : "bg-primary/85"}`}
                      style={{ left: `${offsets.left}%`, width: `${offsets.width}%` }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
                      {t("automation.noSchedule")}
                    </div>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{formatDay(row.rangeStart)}</span>
                  <span>{formatDay(row.rangeEnd)}</span>
                </div>
              </div>
            </>
          );

          if (row.onClick) {
            return (
              <button
                key={row.id}
                type="button"
                onClick={row.onClick}
                className="w-full text-left rounded-md border p-3 hover:bg-muted/40 transition-colors"
              >
                {content}
              </button>
            );
          }

          return (
            <div key={row.id} className="rounded-md border p-3">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
