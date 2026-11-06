import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle, Clock, Droplets, Flag, ImageOff, MapPin, Phone, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { getThreadLastSeen, hasNewMessage, useLatestMessages } from "../../../lib/reportMessages";
import { NewDot, ReportMessages } from "../ReportMessages";
import { waterLevelInfo } from "../../../lib/quickReport";
import { displayReporterName, waterLevelLabel } from "../../../lib/reports";
import { formatManilaDateTime } from "../../../lib/barangayAdmin";
import { DisclosureCard } from "../alerts/AlertDisclosure";
import { queryReports, type ReportSort } from "../../../lib/reportQuery";
import { reportPhotoUrl } from "../../../lib/postedReports";
import { STRINGS } from "../../../lib/strings";
import { ReportQueryBar } from "../ReportQueryBar";

/*
 * Barangay admin reports, own barangay only and read-only: the MDRRMO is the
 * only verifier. Officials can read reports and message the resident.
 */

export type BarangayReport = {
  id: number;
  user_name: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  water_level: string | null;
  description: string | null;
  photo_path: string | null;
  status: string;
  timestamp: string;
  rejection_reason: string | null;
  approval_reason: string | null;
  barangay: string | null;
};

export const REPORT_COLUMNS = "id, user_name, location, lat, lng, water_level, description, photo_path, status, timestamp, rejection_reason, approval_reason, barangay";

/** Explicit list: select("*") fails on quick_reports (hash columns are not readable). */
export const QUICK_REPORT_COLUMNS =
  "id, created_at, barangay, landmark, lat, lng, water_level, description, photo_path, reporter_name, reporter_phone, status, rejection_reason, flagged_false, flag_reason, reviewed_by, reviewed_at";

export type BarangayQuickReport = {
  id: string | number;
  created_at: string | null;
  barangay: string | null;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  water_level: string | null;
  description: string | null;
  photo_path: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  status: string | null;
  rejection_reason: string | null;
  flagged_false: boolean | null;
  flag_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export const isApprovedStatus = (status: string | null | undefined) => status === "approved" || status === "verified";

export type ReportFilter = "all" | "pending" | "approved" | "rejected";
const FILTERS: Array<{ id: ReportFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];
const matches = (r: { status: string | null }, f: ReportFilter) =>
  f === "all" ? true : f === "approved" ? isApprovedStatus(r.status) : f === "rejected" ? r.status === "rejected" : !isApprovedStatus(r.status) && r.status !== "rejected";

function ErrorBox({ text }: { text: string }) {
  return (
    <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
      {text}
    </p>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (isApprovedStatus(status)) return <span className="risk-badge risk-badge-low is-compact"><CheckCircle size={12} aria-hidden="true" /> Approved</span>;
  if (status === "rejected") return <span className="risk-badge risk-badge-high is-compact"><XCircle size={12} aria-hidden="true" /> Rejected</span>;
  return <span className="risk-badge risk-badge-medium is-compact"><Clock size={12} aria-hidden="true" /> {STRINGS.barangayReports.pending}</span>;
}

export type ReportsView = "community" | "quick";

/** The barangay Reports item: read-only, with one tab per kind of report. */
export function BarangayReportsPage({
  view,
  onView,
  community,
  quick,
}: {
  view: ReportsView;
  onView: (view: ReportsView) => void;
  community: ReactNode;
  quick: ReactNode;
}) {
  const views: Array<{ id: ReportsView; label: string }> = [
    { id: "community", label: STRINGS.barangayReports.community },
    { id: "quick", label: STRINGS.barangayReports.quick },
  ];
  return (
    <div className="space-y-4">
      <p className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--primary-shade)", color: "var(--text-primary)" }}>
        {STRINGS.barangayReports.note}
      </p>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Report type">
        {views.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className="clay-tab" onClick={() => onView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      {view === "community" ? community : quick}
    </div>
  );
}

export function CommunityReportsSection({
  barangay,
  userId,
  reports,
  loading,
  error,
  filter,
  onFilter,
  onRetry,
}: {
  barangay: string;
  userId: string | null;
  reports: BarangayReport[];
  loading: boolean;
  error: string | null;
  filter: ReportFilter;
  onFilter: (f: ReportFilter) => void;
  onRetry: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ReportSort>("newest");
  const { latest, update: updateLatest } = useLatestMessages(reports.filter((r) => r.barangay === barangay).map((r) => r.id));
  const inFilter = reports.filter((r) => matches(r, filter));
  const visible = queryReports(inFilter, query, sort, (id) => latest[id]?.created_at);
  const newIds = new Set(
    reports.filter((r) => hasNewMessage(latest[r.id], "barangay", userId ? getThreadLastSeen(userId, r.id) : 0)).map((r) => r.id),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Report status filter">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className="clay-tab" onClick={() => onFilter(f.id)}>
            {f.label} ({reports.filter((r) => matches(r, f.id)).length})
            {filter !== f.id && reports.some((r) => matches(r, f.id) && newIds.has(r.id)) && (
              <span className="ml-1"><NewDot suffix={`messages in ${f.label}`} /></span>
            )}
          </button>
        ))}
      </div>

      {!error && !loading && reports.length > 0 && (
        <ReportQueryBar query={query} onQuery={setQuery} sort={sort} onSort={setSort} shown={visible.length} total={inFilter.length} />
      )}

      {error ? (
        <div className="space-y-2">
          <ErrorBox text={`Could not load reports: ${error}`} />
          <button type="button" className="clay-btn clay-btn-secondary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> Retry</button>
        </div>
      ) : loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="clay h-20 animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="clay p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          {reports.length === 0
            ? `No reports for ${barangay} yet`
            : query && inFilter.length > 0
              ? `No ${filter === "all" ? "" : `${filter} `}reports match "${query.trim()}"`
              : `No ${filter === "all" ? "" : `${filter} `}reports for ${barangay}`}
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2 xl:items-start">
          {visible.map((r) => (
            <li key={r.id}>
              <ReportCard report={r} hasNew={newIds.has(r.id)}>
                {/* Own barangay only; RLS also hides other barangays' threads. Works on every status. */}
                {r.barangay === barangay && (
                  <ReportMessages reportId={r.id} viewerRole="barangay" userId={userId} latest={latest[r.id]} onLatest={updateLatest} />
                )}
              </ReportCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Small lazy-loaded thumbnail; opens the full photo in a new tab. */
export function ReportThumb({ src, alt = "Photo sent with the report" }: { src: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        <ImageOff size={14} aria-hidden="true" /> Photo unavailable
      </span>
    );
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="inline-block" aria-label="Open the full photo in a new tab">
      <img src={src} alt={alt} loading="lazy" decoding="async" width={128} height={96} className="h-24 w-32 rounded-xl object-cover" onError={() => setFailed(true)} />
    </a>
  );
}

function ReportCard({ report, hasNew, children }: { report: BarangayReport; hasNew: boolean; children?: ReactNode }) {
  const hasCoords = report.lat != null && report.lng != null;
  const summary = (
    <span className="block space-y-1">
      <span className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={report.status} />
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{report.barangay ?? "No barangay"}</span>
        {hasNew && <NewDot />}
      </span>
      <span className="block truncate text-sm font-bold" style={{ color: "var(--text-primary)" }}>{report.location?.trim() || "Unknown location"}</span>
      <span className="flex flex-wrap items-center gap-x-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        <span className="inline-flex items-center gap-1"><Droplets size={12} aria-hidden="true" /> {waterLevelLabel(report.water_level)}</span>
        <span>{formatManilaDateTime(report.timestamp)}</span>
      </span>
    </span>
  );

  return (
    <DisclosureCard id={`report-${report.id}`} summary={summary} label={`Report at ${report.location?.trim() || "unknown location"}, ${report.status}. Show details`}>
      <div className="space-y-3 border-t pt-3">
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>By {displayReporterName(report.user_name)}</p>
        {report.description && <p className="whitespace-pre-wrap break-words text-sm font-normal">{report.description}</p>}
        <div className="flex flex-wrap items-end gap-3">
          {report.photo_path && <ReportThumb src={reportPhotoUrl(report.photo_path)} />}
          {hasCoords && (
            <a
              href={`https://www.google.com/maps?q=${report.lat},${report.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold underline"
              style={{ color: "var(--primary-shade)" }}
            >
              <MapPin size={14} aria-hidden="true" /> View on map
            </a>
          )}
        </div>
        <ReviewReasons report={report} />
        {children}
      </div>
    </DisclosureCard>
  );
}

/** Approval or rejection reason, as the resident sees it. */
export function ReviewReasons({ report }: { report: { status: string | null; approval_reason?: string | null; rejection_reason: string | null } }) {
  if (isApprovedStatus(report.status) && report.approval_reason?.trim()) {
    return (
      <p className="bg-white px-3 py-2 text-sm font-normal" style={{ borderLeft: "4px solid var(--risk-low)", color: "var(--text-primary)" }}>
        <span className="font-semibold">Approval reason:</span> {report.approval_reason}
      </p>
    );
  }
  if (report.status === "rejected" && report.rejection_reason?.trim()) {
    return (
      <p className="bg-white px-3 py-2 text-sm font-normal" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
        <span className="font-semibold">Rejection reason:</span> {report.rejection_reason}
      </p>
    );
  }
  return null;
}

export function QuickReportsSection({
  barangay,
  rows,
  loading,
  error,
  onRetry,
}: {
  barangay: string;
  rows: BarangayQuickReport[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<ReportFilter>("all");
  const visible = rows.filter((r) => matches(r, filter));

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Flood reports sent without an account.
      </p>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Quick Report status filter">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className="clay-tab" onClick={() => setFilter(f.id)}>
            {f.label} ({rows.filter((r) => matches(r, f.id)).length})
          </button>
        ))}
      </div>
      {error ? (
        <div className="space-y-2">
          <ErrorBox text={`Could not load Quick Reports: ${error}`} />
          <button type="button" className="clay-btn clay-btn-secondary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> Retry</button>
        </div>
      ) : loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="clay h-32 animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="clay p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          {rows.length === 0 ? `No Quick Reports for ${barangay} yet` : `No ${filter} Quick Reports for ${barangay}`}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((row) => (
            <QuickReportCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuickReportCard({ row }: { row: BarangayQuickReport }) {
  const flagged = !!row.flagged_false;
  const level = waterLevelInfo(row.water_level);
  const hasCoords = row.lat != null && row.lng != null && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng));
  return (
    <article id={`quick-report-${row.id}`} className="clay space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold" style={{ color: "var(--text-primary)" }}>{row.landmark?.trim() || row.barangay || "Location shared"}</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatManilaDateTime(row.created_at)}</p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          {flagged ? (
            <span className="risk-badge risk-badge-high is-compact"><Flag size={12} aria-hidden="true" /> Flagged by MDRRMO</span>
          ) : (
            <StatusBadge status={row.status} />
          )}
          <span className={`risk-badge ${level?.badge ?? "risk-badge-info"} is-compact`}>
            Water: {level ? `${level.label} (${level.severity})` : row.water_level || "Not given"}
          </span>
        </span>
      </div>
      {row.landmark && <p className="text-sm"><span className="font-semibold">Landmark:</span> {row.landmark}</p>}
      {hasCoords && (
        <a
          href={`https://www.google.com/maps?q=${Number(row.lat)},${Number(row.lng)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-semibold underline"
          style={{ color: "var(--primary-shade)" }}
        >
          <MapPin size={14} aria-hidden="true" /> View on map
        </a>
      )}
      {row.description && <p className="whitespace-pre-wrap break-words text-sm">{row.description}</p>}
      {(row.reporter_name || row.reporter_phone) && (
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          <span className="font-semibold">Reporter:</span> {row.reporter_name || "No name"}
          {row.reporter_phone && (
            <>
              {" · "}
              <a href={`tel:${row.reporter_phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 font-semibold underline" style={{ color: "var(--primary-shade)" }}>
                <Phone size={13} aria-hidden="true" /> {row.reporter_phone}
              </a>
            </>
          )}
        </p>
      )}
      {row.photo_path && <QuickReportPhoto path={row.photo_path} />}
      {row.status === "rejected" && row.rejection_reason?.trim() && (
        <p className="text-sm"><span className="font-semibold">Rejection reason:</span> {row.rejection_reason}</p>
      )}
      {flagged && row.flag_reason?.trim() && (
        <p className="text-sm"><span className="font-semibold">MDRRMO note:</span> {row.flag_reason}</p>
      )}
      {row.reviewed_at && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Reviewed by the MDRRMO {formatManilaDateTime(row.reviewed_at)}</p>}
    </article>
  );
}

/** Private bucket: a 5-minute signed URL, requested when the card shows. */
function QuickReportPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    void supabase.storage
      .from("quick-report-photos")
      .createSignedUrl(path, 300)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) setFailed(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (failed) {
    return (
      <div className="flex h-32 items-center justify-center gap-2 rounded-2xl bg-white/70 text-sm" style={{ color: "var(--text-secondary)" }}>
        <ImageOff size={18} aria-hidden="true" /> Photo unavailable
      </div>
    );
  }
  if (!url) return <div className="h-48 animate-pulse rounded-2xl bg-white/70" aria-label="Loading photo" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt="Photo sent with the Quick Report" className="max-h-72 w-full rounded-2xl object-cover" onError={() => setFailed(true)} />
    </a>
  );
}
