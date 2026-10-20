import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle, Clock, Droplets, ImageOff, Loader, MapPin, Phone, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { getThreadLastSeen, hasNewMessage, useLatestMessages } from "../../../lib/reportMessages";
import { NewDot, ReportMessages } from "../ReportMessages";
import { waterLevelInfo } from "../../../lib/quickReport";
import { displayReporterName, waterLevelLabel } from "../../../lib/reports";
import { errorMessage, formatManilaDateTime } from "../../../lib/barangayAdmin";

/*
 * Barangay admin review of community reports (own barangay only: approve, or
 * reject with a required reason, and a message thread with the resident;
 * deleting reports or messages stays with MDRRMO) and a read-only list of
 * approved Quick Reports for the barangay.
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
  barangay: string | null;
};

export const REPORT_COLUMNS = "id, user_name, location, lat, lng, water_level, description, photo_path, status, timestamp, rejection_reason, barangay";

/** Explicit list: select("*") fails on quick_reports (hash columns are not readable). */
export const QUICK_REPORT_COLUMNS =
  "id, created_at, barangay, landmark, lat, lng, water_level, description, photo_path, reporter_name, reporter_phone, status";

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
};

export const isApprovedStatus = (status: string | null | undefined) => status === "approved" || status === "verified";

export type ReportFilter = "pending" | "approved" | "rejected";
const FILTERS: Array<{ id: ReportFilter; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];
const matches = (r: BarangayReport, f: ReportFilter) =>
  f === "approved" ? isApprovedStatus(r.status) : f === "rejected" ? r.status === "rejected" : !isApprovedStatus(r.status) && r.status !== "rejected";

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
  return <span className="risk-badge risk-badge-medium is-compact"><Clock size={12} aria-hidden="true" /> Pending</span>;
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
  onUpdated,
}: {
  barangay: string;
  userId: string | null;
  reports: BarangayReport[];
  loading: boolean;
  error: string | null;
  filter: ReportFilter;
  onFilter: (f: ReportFilter) => void;
  onRetry: () => void;
  onUpdated: (report: BarangayReport) => void;
}) {
  const [rejecting, setRejecting] = useState<BarangayReport | null>(null);
  const visible = reports.filter((r) => matches(r, filter));
  const { latest, update: updateLatest } = useLatestMessages(reports.filter((r) => r.barangay === barangay).map((r) => r.id));
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

      {error ? (
        <div className="space-y-2">
          <ErrorBox text={`Could not load reports: ${error}`} />
          <button type="button" className="clay-btn clay-btn-secondary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> Retry</button>
        </div>
      ) : loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="clay h-28 animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="clay p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          {reports.length === 0 ? `No reports for ${barangay} yet` : `No ${filter} reports for ${barangay}`}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((r) => (
            <ReportCard key={r.id} barangay={barangay} report={r} onUpdated={onUpdated} onReject={() => setRejecting(r)}>
              {/* Own barangay only; RLS also hides other barangays' threads. */}
              {r.barangay === barangay && (
                <ReportMessages reportId={r.id} viewerRole="barangay" userId={userId} latest={latest[r.id]} onLatest={updateLatest} />
              )}
            </ReportCard>
          ))}
        </div>
      )}

      {rejecting && (
        <RejectDialog
          barangay={barangay}
          report={rejecting}
          onClose={() => setRejecting(null)}
          onDone={(updated) => {
            setRejecting(null);
            onUpdated(updated);
          }}
        />
      )}
    </div>
  );
}

/** Scoped to the admin's barangay; RLS refusals (0 rows) are reported as errors. */
async function updateReport(barangay: string, id: number, values: Record<string, unknown>): Promise<BarangayReport> {
  const { data, error } = await supabase
    .from("community_reports")
    .update(values)
    .eq("id", id)
    .eq("barangay", barangay)
    .select(REPORT_COLUMNS);
  if (error) throw error;
  if (!data?.length) throw new Error("The database did not save the change (this report is not in your barangay).");
  return data[0] as unknown as BarangayReport;
}

function ReportCard({
  barangay,
  report,
  onUpdated,
  onReject,
  children,
}: {
  barangay: string;
  report: BarangayReport;
  onUpdated: (r: BarangayReport) => void;
  onReject: () => void;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = !isApprovedStatus(report.status) && report.status !== "rejected";
  const hasCoords = report.lat != null && report.lng != null;

  const approve = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onUpdated(await updateReport(barangay, report.id, { status: "approved", rejection_reason: null }));
    } catch (err) {
      setError(errorMessage(err, "Unable to approve this report."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article id={`report-${report.id}`} className="clay space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold" style={{ color: "var(--text-primary)" }}>{report.location?.trim() || "Unknown location"}</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            By {displayReporterName(report.user_name)} · {formatManilaDateTime(report.timestamp)}
          </p>
        </div>
        <StatusBadge status={report.status} />
      </div>
      <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
        <Droplets size={16} aria-hidden="true" style={{ color: "var(--primary-shade)" }} /> {waterLevelLabel(report.water_level)}
        {hasCoords && (
          <a
            href={`https://www.google.com/maps?q=${report.lat},${report.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 inline-flex items-center gap-1 font-semibold underline"
            style={{ color: "var(--primary-shade)" }}
          >
            <MapPin size={14} aria-hidden="true" /> View on map
          </a>
        )}
      </p>
      {report.description && <p className="whitespace-pre-wrap break-words text-sm">{report.description}</p>}
      {report.photo_path && <img src={report.photo_path} alt="Photo sent with the report" className="max-h-64 w-full rounded-2xl object-cover" />}
      {report.status === "rejected" && report.rejection_reason && (
        <p className="text-sm"><span className="font-semibold">Rejection reason:</span> {report.rejection_reason}</p>
      )}
      {error && <ErrorBox text={error} />}
      {(pending || report.status === "rejected" || isApprovedStatus(report.status)) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {!isApprovedStatus(report.status) && (
            <button type="button" className="clay-btn clay-btn-primary" disabled={busy} onClick={() => void approve()}>
              {busy ? <Loader size={16} className="animate-spin" aria-hidden="true" /> : <CheckCircle size={16} aria-hidden="true" />} Approve
            </button>
          )}
          {report.status !== "rejected" && (
            <button type="button" className="clay-btn clay-btn-secondary" disabled={busy} onClick={onReject}>
              <XCircle size={16} aria-hidden="true" /> Reject
            </button>
          )}
        </div>
      )}
      {children}
    </article>
  );
}

function RejectDialog({ barangay, report, onClose, onDone }: { barangay: string; report: BarangayReport; onClose: () => void; onDone: (r: BarangayReport) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const save = async () => {
    const text = reason.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await updateReport(barangay, report.id, { status: "rejected", rejection_reason: text }));
    } catch (err) {
      setError(errorMessage(err, "Unable to reject this report."));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="reject-title" className="clay w-full max-w-md space-y-4 p-6">
        <h3 id="reject-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Reject report</h3>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{report.location?.trim() || "Unknown location"} · by {displayReporterName(report.user_name)}</p>
        <label className="block">
          <span className="clay-label">Reason (required, shown to the resident)</span>
          <textarea ref={ref} className="clay-input min-h-24" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} disabled={busy} />
        </label>
        {error && <ErrorBox text={error} />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="clay-btn clay-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="clay-btn clay-btn-primary" disabled={busy || !reason.trim()} onClick={() => void save()}>
            {busy ? "Saving..." : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
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
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Flood reports sent without an account, approved by MDRRMO. Read-only.
      </p>
      {error ? (
        <div className="space-y-2">
          <ErrorBox text={`Could not load Quick Reports: ${error}`} />
          <button type="button" className="clay-btn clay-btn-secondary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> Retry</button>
        </div>
      ) : loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="clay h-32 animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="clay p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No Quick Reports for {barangay} yet</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((row) => <QuickReportCard key={row.id} row={row} />)}
        </div>
      )}
    </div>
  );
}

function QuickReportCard({ row }: { row: BarangayQuickReport }) {
  const level = waterLevelInfo(row.water_level);
  const hasCoords = row.lat != null && row.lng != null && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng));
  return (
    <article id={`quick-report-${row.id}`} className="clay space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold" style={{ color: "var(--text-primary)" }}>{row.landmark?.trim() || row.barangay || "Location shared"}</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatManilaDateTime(row.created_at)}</p>
        </div>
        <span className={`risk-badge ${level?.badge ?? "risk-badge-info"} is-compact`}>
          Water: {level ? `${level.label} (${level.severity})` : row.water_level || "Not given"}
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
