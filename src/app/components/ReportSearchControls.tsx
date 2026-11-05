import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
  SERVER_REPORT_SORT_OPTIONS,
  type ReportCounts,
  type ReportStatusFilter,
  type ServerReportSort,
} from "../../lib/reportServerQuery";

const STATUS_CHIPS: Array<{ id: ReportStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

/*
 * Search bar and Sort select (side by side from 640 px, stacked below),
 * with status chips underneath. Used by the MDRRMO Community Reports list.
 */
export function ReportSearchControls({
  searchInput,
  onSearchInput,
  sort,
  onSort,
  status,
  onStatus,
  counts,
}: {
  searchInput: string;
  onSearchInput: (q: string) => void;
  sort: ServerReportSort;
  onSort: (s: ServerReportSort) => void;
  status: ReportStatusFilter;
  onStatus: (s: ReportStatusFilter) => void;
  counts: ReportCounts;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end" role="search" aria-label="Search reports">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Search reports</span>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-secondary)" }} />
          <input
            type="search"
            className="clay-input has-icon-left pr-11 text-sm"
            placeholder="Search reports (location, description, reporter, barangay)"
            value={searchInput}
            onChange={(e) => onSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => onSearchInput("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full"
              style={{ color: "var(--text-secondary)" }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </label>
        <label className="block sm:w-60">
          <span className="sr-only">Sort reports</span>
          <select className="clay-input text-sm" value={sort} onChange={(e) => onSort(e.target.value as ServerReportSort)}>
            {SERVER_REPORT_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Report status filter">
        {STATUS_CHIPS.map((chip) => (
          <button key={chip.id} type="button" role="tab" aria-selected={status === chip.id} className="clay-tab" onClick={() => onStatus(chip.id)}>
            {chip.label} ({counts[chip.id]})
          </button>
        ))}
      </div>
    </div>
  );
}

/** Previous / Next with "Page N of M"; hidden when there is one page. */
export function ReportPager({ page, pages, loading, onPage }: { page: number; pages: number; loading: boolean; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Report pages">
      <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={16} aria-hidden="true" /> Previous
      </button>
      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Page {page} of {pages}</span>
      <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={page >= pages || loading} onClick={() => onPage(page + 1)}>
        Next <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
