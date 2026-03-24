import { createContext, useContext, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { CalendarDays, Filter, X, ChevronDown, RotateCcw } from "lucide-react";
import { format, subDays, startOfMonth } from "date-fns";
import { useLanguage } from "@/lib/i18n";
import type { Country, Brand, Title, Studio } from "@shared/schema";

interface FilterState {
  dateFrom?: Date;
  dateTo?: Date;
  countries: number[];
  brands: number[];
  titles: number[];
  studios: number[];
  executionTypes: string[];
  statuses: string[];
}

interface FilterContextType {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  filterParams: string;
  resetFilters: () => void;
}

const FilterContext = createContext<FilterContextType | null>(null);

const DEFAULT_FILTERS: FilterState = {
  countries: [],
  brands: [],
  titles: [],
  studios: [],
  executionTypes: [],
  statuses: [],
};

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", format(filters.dateFrom, "yyyy-MM-dd"));
    if (filters.dateTo) params.set("dateTo", format(filters.dateTo, "yyyy-MM-dd"));
    if (filters.countries.length) params.set("countries", filters.countries.join(","));
    if (filters.brands.length) params.set("brands", filters.brands.join(","));
    if (filters.titles.length) params.set("titles", filters.titles.join(","));
    if (filters.studios.length) params.set("studios", filters.studios.join(","));
    if (filters.executionTypes.length) params.set("executionTypes", filters.executionTypes.join(","));
    if (filters.statuses.length) params.set("statuses", filters.statuses.join(","));
    return params.toString() ? `?${params.toString()}` : "";
  }, [filters]);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  return (
    <FilterContext.Provider value={{ filters, setFilters, filterParams, resetFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be inside FilterProvider");
  return ctx;
}

export function GlobalFilters() {
  const { filters, setFilters, resetFilters } = useFilters();
  const { t } = useLanguage();
  const { data: countriesList } = useQuery<Country[]>({ queryKey: ["/api/countries"] });
  const { data: brandsList } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
  const { data: titlesList } = useQuery<Title[]>({ queryKey: ["/api/titles"] });
  const { data: studiosList } = useQuery<Studio[]>({ queryKey: ["/api/studios"] });

  const statusOptions = [
    { value: "draft", label: t("status.draft") },
    { value: "in_review", label: t("status.inReview") },
    { value: "approved", label: t("status.approved") },
    { value: "executed", label: t("status.executed") },
    { value: "evidence_uploaded", label: t("status.evidenceUploaded") },
    { value: "closed", label: t("status.closedReported") },
  ];

  const typeOptions = [
    { value: "canje", label: t("executionType.canje") },
    { value: "publicity", label: t("executionType.publicity") },
    { value: "third_party", label: t("executionType.thirdParty") },
  ];

  const datePresets = [
    { label: t("filters.last7Days"), fn: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
    { label: t("filters.last30Days"), fn: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
    { label: t("filters.monthToDate"), fn: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
  ];

  const activeCount = [
    filters.dateFrom || filters.dateTo ? 1 : 0,
    filters.countries.length ? 1 : 0,
    filters.brands.length ? 1 : 0,
    filters.titles.length ? 1 : 0,
    filters.studios.length ? 1 : 0,
    filters.executionTypes.length ? 1 : 0,
    filters.statuses.length ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="global-filters">
      <Filter className="w-4 h-4 text-muted-foreground" />

      <DateRangeFilter
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onChange={(from, to) => setFilters({ ...filters, dateFrom: from, dateTo: to })}
        datePresets={datePresets}
      />

      <MultiSelectFilter
        label={t("filters.country")}
        options={(countriesList || []).map(c => ({ value: c.id, label: c.name }))}
        selected={filters.countries}
        onChange={v => setFilters({ ...filters, countries: v })}
      />

      <MultiSelectFilter
        label={t("filters.brand")}
        options={(brandsList || []).map(b => ({ value: b.id, label: b.name }))}
        selected={filters.brands}
        onChange={v => setFilters({ ...filters, brands: v })}
      />

      <MultiSelectFilter
        label={t("filters.title")}
        options={(titlesList || []).map(t => ({ value: t.id, label: t.name }))}
        selected={filters.titles}
        onChange={v => setFilters({ ...filters, titles: v })}
      />

      <MultiSelectFilter
        label={t("filters.studio")}
        options={(studiosList || []).map(s => ({ value: s.id, label: s.name }))}
        selected={filters.studios}
        onChange={v => setFilters({ ...filters, studios: v })}
      />

      <MultiSelectFilter
        label={t("filters.type")}
        options={typeOptions.map(tp => ({ value: tp.value as any, label: tp.label }))}
        selected={filters.executionTypes as any}
        onChange={v => setFilters({ ...filters, executionTypes: v as any })}
        isString
      />

      <MultiSelectFilter
        label={t("filters.status")}
        options={statusOptions.map(s => ({ value: s.value as any, label: s.label }))}
        selected={filters.statuses as any}
        onChange={v => setFilters({ ...filters, statuses: v as any })}
        isString
      />

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={resetFilters} data-testid="button-reset-filters">
          <RotateCcw className="w-3 h-3 mr-1" />
          {t("filters.reset")} ({activeCount})
        </Button>
      )}
    </div>
  );
}

function DateRangeFilter({ dateFrom, dateTo, onChange, datePresets }: { dateFrom?: Date; dateTo?: Date; onChange: (from?: Date, to?: Date) => void; datePresets: { label: string; fn: () => { from: Date; to: Date } }[] }) {
  const { t } = useLanguage();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-date-filter">
          <CalendarDays className="w-3 h-3 mr-1" />
          {dateFrom && dateTo
            ? `${format(dateFrom, "MMM d")} - ${format(dateTo, "MMM d")}`
            : t("filters.dateRange")}
          {(dateFrom || dateTo) && (
            <X className="w-3 h-3 ml-1" onClick={(e) => { e.stopPropagation(); onChange(undefined, undefined); }} />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex gap-1 mb-3 flex-wrap">
          {datePresets.map(p => (
            <Button key={p.label} variant="ghost" size="sm" onClick={() => { const r = p.fn(); onChange(r.from, r.to); }}>
              {p.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="range"
          selected={dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined}
          onSelect={(range) => onChange(range?.from, range?.to)}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}

function MultiSelectFilter<T extends number | string>({
  label,
  options,
  selected,
  onChange,
  isString,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (v: T[]) => void;
  isString?: boolean;
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  const toggle = (v: T) => {
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-filter-${label.toLowerCase()}`}>
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">{selected.length}</Badge>
          )}
          <ChevronDown className="w-3 h-3 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {options.length > 5 && (
          <Input
            placeholder={`${t("filters.search")} ${label.toLowerCase()}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mb-2"
          />
        )}
        <ScrollArea className="max-h-48">
          <div className="space-y-1">
            {filtered.map(o => (
              <label key={String(o.value)} className="flex items-center gap-2 px-2 py-1 rounded-md hover-elevate cursor-pointer text-sm">
                <Checkbox
                  checked={selected.includes(o.value)}
                  onCheckedChange={() => toggle(o.value)}
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">{t("filters.noResults")}</p>}
          </div>
        </ScrollArea>
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-1" onClick={() => onChange([])}>
            {t("filters.clear")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
