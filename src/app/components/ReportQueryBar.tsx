import { useId } from "react";
import { ArrowUpDown, Search, X } from "lucide-react";
import { REPORT_SORT_OPTIONS, type ReportSort } from "../../lib/reportQuery";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/*
 * One row: a search bar and a Sort button that opens a menu of sort
 * options (the current one is checked). Radix handles keyboard use,
 * Escape and focus return; the menu stays inside a 360 px screen.
 */
export function SearchSortBar<S extends string>({
  query,
  onQuery,
  sort,
  onSort,
  options,
  searchLabel,
  placeholder,
  sortLabel,
  countText,
}: {
  query: string;
  onQuery: (q: string) => void;
  sort: S;
  onSort: (s: S) => void;
  options: Array<{ value: S; label: string }>;
  searchLabel: string;
  placeholder: string;
  /** Accessible name prefix, e.g. "Sort reports". */
  sortLabel: string;
  countText?: string;
}) {
  const id = useId();
  const current = options.find((o) => o.value === sort)?.label ?? "";
  return (
    <div className="space-y-1" role="search" aria-label={searchLabel}>
      <div className="flex items-center gap-2">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">{searchLabel}</span>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-secondary)" }} />
          <input
            type="search"
            className="clay-input has-icon-left pr-11 text-sm"
            placeholder={placeholder}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-describedby={countText ? `${id}-count` : undefined}
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full"
              style={{ color: "var(--text-secondary)" }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="clay-btn clay-btn-secondary shrink-0 text-sm" aria-label={`${sortLabel}: ${current}`}>
              <ArrowUpDown size={16} aria-hidden="true" />
              <span>Sort</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" collisionPadding={16} className="w-[min(16rem,calc(100vw-32px))] rounded-2xl bg-white p-1">
            <DropdownMenuLabel className="text-xs" style={{ color: "var(--text-secondary)" }}>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSort(v as S)}>
              {options.map((o) => (
                <DropdownMenuRadioItem key={o.value} value={o.value} className="min-h-11 text-sm">
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {countText && (
        <p id={`${id}-count`} className="text-xs" style={{ color: "var(--text-secondary)" }} aria-live="polite">
          {countText} · {current}
        </p>
      )}
    </div>
  );
}

/** Search bar + Sort button for a report list, with a live result count. */
export function ReportQueryBar({
  query,
  onQuery,
  sort,
  onSort,
  shown,
  total,
  withMessageSort = true,
  placeholder = "Search location, description, reporter or barangay",
}: {
  query: string;
  onQuery: (q: string) => void;
  sort: ReportSort;
  onSort: (s: ReportSort) => void;
  shown: number;
  total: number;
  /** Hide "Latest message first" where threads are not loaded. */
  withMessageSort?: boolean;
  placeholder?: string;
}) {
  const noun = total === 1 ? "report" : "reports";
  return (
    <SearchSortBar
      query={query}
      onQuery={onQuery}
      sort={sort}
      onSort={onSort}
      options={REPORT_SORT_OPTIONS.filter((o) => withMessageSort || o.value !== "messages")}
      searchLabel="Search reports"
      placeholder={placeholder}
      sortLabel="Sort reports"
      countText={query ? `${shown} of ${total} ${noun} match` : `${total} ${noun}`}
    />
  );
}
