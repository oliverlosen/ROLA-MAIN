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

export interface FilterState {
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

export function createFilterState(overrides: Partial<FilterState> = {}): FilterState {
  return {
    dateFrom: overrides.dateFrom,
    dateTo: overrides.dateTo,
    countries: overrides.countries ? [...overrides.countries] : [],
    brands: overrides.brands ? [...overrides.brands] : [],
    titles: overrides.titles ? [...overrides.titles] : [],
    studios: overrides.studios ? [...overrides.studios] : [],
    executionTypes: overrides.executionTypes ? [...overrides.executionTypes] : [],
    statuses: overrides.statuses ? [...overrides.statuses] : [],
  };
}

export const DEFAULT_FILTERS = createFilterState();

export function buildFilterParams(filters: FilterState) {
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
}

export function countActiveFilters(filters: FilterState) {
  return [
    filters.dateFrom || filters.dateTo ? 1 : 0,
    filters.countries.length ? 1 : 0,
    filters.brands.length ? 1 : 0,
    filters.titles.length ? 1 : 0,
    filters.studios.length ? 1 : 0,
    filters.executionTypes.length ? 1 : 0,
    filters.statuses.length ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
}

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(() => createFilterState());

  const filterParams = useMemo(() => buildFilterParams(filters), [filters]);
  const resetFilters = useCallback(() => setFilters(createFilterState()), []);

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
  return (
    <ExecutionFiltersBar
      filters={filters}
      onChange={setFilters}
      onReset={resetFilters}
    />
  );
}

export function ExecutionFiltersBar({
  filters,
  onChange,
  onReset,
}: {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
}) {
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

  const activeCount = countActiveFilters(filters);

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="global-filters">
      <Filter className="w-4 h-4 text-muted-foreground" />

      <DateRangeFilter
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onChange={(from, to) => onChange({ ...filters, dateFrom: from, dateTo: to })}
        datePresets={datePresets}
      />

      <MultiSelectFilter
        label={t("filters.country")}
        options={(countriesList || []).map((country) => ({ value: country.id, label: country.name }))}
        selected={filters.countries}
        onChange={(value) => onChange({ ...filters, countries: value })}
      />

      <MultiSelectFilter
        label={t("filters.brand")}
        options={(brandsList || []).map((brand) => ({ value: brand.id, label: brand.name }))}
        selected={filters.brands}
        onChange={(value) => onChange({ ...filters, brands: value })}
      />

      <MultiSelectFilter
        label={t("filters.title")}
        options={(titlesList || []).map((title) => ({ value: title.id, label: title.name }))}
        selected={filters.titles}
        onChange={(value) => onChange({ ...filters, titles: value })}
      />

      <MultiSelectFilter
        label={t("filters.studio")}
        options={(studiosList || []).map((studio) => ({ value: studio.id, label: studio.name }))}
        selected={filters.studios}
        onChange={(value) => onChange({ ...filters, studios: value })}
      />

      <MultiSelectFilter
        label={t("filters.type")}
        options={typeOptions}
        selected={filters.executionTypes}
        onChange={(value) => onChange({ ...filters, executionTypes: value })}
      />

      <MultiSelectFilter
        label={t("filters.status")}
        options={statusOptions}
        selected={filters.statuses}
        onChange={(value) => onChange({ ...filters, statuses: value })}
      />

      {activeCount > 0 ? (
        <Button variant="ghost" size="sm" onClick={onReset} data-testid="button-reset-filters">
          <RotateCcw className="w-3 h-3 mr-1" />
          {t("filters.reset")} ({activeCount})
        </Button>
      ) : null}
    </div>
  );
}

function DateRangeFilter({
  dateFrom,
  dateTo,
  onChange,
  datePresets,
}: {
  dateFrom?: Date;
  dateTo?: Date;
  onChange: (from?: Date, to?: Date) => void;
  datePresets: { label: string; fn: () => { from: Date; to: Date } }[];
}) {
  const { t } = useLanguage();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-date-filter">
          <CalendarDays className="w-3 h-3 mr-1" />
          {dateFrom && dateTo
            ? `${format(dateFrom, "MMM d")} - ${format(dateTo, "MMM d")}`
            : t("filters.dateRange")}
          {(dateFrom || dateTo) ? (
            <X className="w-3 h-3 ml-1" onClick={(event) => { event.stopPropagation(); onChange(undefined, undefined); }} />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex gap-1 mb-3 flex-wrap">
          {datePresets.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              onClick={() => {
                const range = preset.fn();
                onChange(range.from, range.to);
              }}
            >
              {preset.label}
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
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (value: T[]) => void;
}) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const filtered = options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()));

  const toggle = (value: T) => {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-filter-${label.toLowerCase()}`}>
          {label}
          {selected.length > 0 ? (
            <Badge variant="secondary" className="ml-1 text-xs">{selected.length}</Badge>
          ) : null}
          <ChevronDown className="w-3 h-3 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        {options.length > 5 ? (
          <Input
            placeholder={`${t("filters.search")} ${label.toLowerCase()}...`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="mb-2"
          />
        ) : null}
        <ScrollArea className="max-h-48">
          <div className="space-y-1">
            {filtered.map((option) => (
              <label key={String(option.value)} className="flex items-center gap-2 px-2 py-1 rounded-md hover-elevate cursor-pointer text-sm">
                <Checkbox
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => toggle(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
