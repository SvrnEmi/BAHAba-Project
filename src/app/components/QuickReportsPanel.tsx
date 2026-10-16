import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Flag, ImageOff, Loader, MapPin, Phone, RefreshCw, Undo2, XCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { subscribeToTable } from "../../lib/realtime";
import { waterLevelInfo } from "../../lib/quickReport";

/*
 * MDRRMO review of anonymous Quick Reports (public.quick_reports).
 * Always an explicit column list: the hash columns are not readable, so
 * select("*") would fail. Realtime only triggers a re-read (shared channel).
 */
const COLUMNS =
  "id, created_at, barangay, landmark, lat, lng, water_level, description, photo_path, reporter_name, reporter_phone, status, rejection_reason, flagged_false, flag_reason, reviewed_at";

export type QuickReportFilter = "pending" | "approved" | "rejected" | "flagged";

type QuickReportRow = {
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
  reviewed_at: string | null;
};

const FILTERS: { id: QuickReportFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "flagged", label: "Flagged as false" },
];

// Pending excludes reports already flagged as false (they have their own filter).
const NOT_FLAGGED = "flagged_false.is.null,flagged_false.eq.false";

const manila = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const formatTime = (iso: string | null) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? `${manila.format(t)} PHT` : "Unknown time";
};

const errorText = (err: unknown, fallback: string) =>
  err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
    ? (err as { message: string }).message
    : fallback;

/** Pending count for the dashboard tab badge; shares the quick_reports channel with the panel. */
export function useQuickReportPendingCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = () => {
      void supabase
        .from("quick_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .or(NOT_FLAGGED)
        .then(
        ({ count: n, error }) => {
          if (cancelled) return;
          if (error) console.error("Unable to count quick reports:", error.message);
          else setCount(n ?? 0);
        },
      );
    };
    load();
    const unsubscribe = subscribeToTable("quick_reports", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 400); // one read per burst of changes
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);
  return count;
}

export function QuickReportsPanel() {
  const [filter, setFilter] = useState<QuickReportFilter>("pending");
  const [rows, setRows] = useState<QuickReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ kind: "reject" | "flag"; row: QuickReportRow } | null>(null);
  const request = useRef(0);

  const load = useCallback(async (which: QuickReportFilter) => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    let query = supabase.from("quick_reports").select(COLUMNS);
    if (which === "flagged") query = query.eq("flagged_false", true);
    else query = which === "pending" ? query.eq("status", "pending").or(NOT_FLAGGED) : query.eq("status", which);
    const { data, error: readError } = await query.order("created_at", { ascending: false }).limit(100);
    if (id !== request.current) return;
    if (readError) {
      console.error("Unable to load quick reports:", readError);
      setError(readError.message);
    } else {
      setRows((data as unknown as QuickReportRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setRows(null);
    void load(filter);
  }, [filter, load]);

  // One shared realtime channel; any change re-reads the current filter.
  const filterRef = useRef(filter);
  filterRef.current = filter;
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const unsubscribe = subscribeToTable("quick_reports", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!cancelled) void load(filterRef.current);
      }, 400);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [load]);

  const refresh = () => void load(filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Quick Reports</h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Flood reports sent without an account. Newest first.
          </p>
        </div>
        <button type="button" className="clay-btn clay-btn-secondary" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" className={loading ? "animate-spin" : undefined} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Quick report filter">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className="clay-tab"
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <div role="alert" className="clay flex flex-wrap items-center gap-3 p-4 text-sm" style={{ borderLeft: "4px solid var(--risk-high)" }}>
          <span className="flex-1" style={{ color: "var(--text-primary)" }}>Could not load quick reports: {error}</span>
          <button type="button" className="clay-btn clay-btn-secondary" onClick={refresh}>Retry</button>
        </div>
      ) : rows === null ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="clay h-32 animate-pulse p-5" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="clay p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No quick reports here</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((row) => (
            <QuickReportCard key={row.id} row={row} onChanged={refresh} onDialog={(kind) => setDialog({ kind, row })} />
          ))}
        </div>
      )}

      {dialog && (
        <ReasonDialog
          kind={dialog.kind}
          row={dialog.row}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** Updates only the given columns; RLS refusals (0 rows) are reported as errors. */
async function updateReport(id: QuickReportRow["id"], values: Record<string, unknown>) {
  const { data, error } = await supabase.from("quick_reports").update(values).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The database did not save the change (no permission to update this report).");
}

function StatusBadge({ row }: { row: QuickReportRow }) {
  if (row.flagged_false) {
    return <span className="risk-badge risk-badge-high is-compact"><Flag size={12} aria-hidden="true" /> Flagged as false</span>;
  }
  if (row.status === "approved") {
    return <span className="risk-badge risk-badge-low is-compact"><CheckCircle size={12} aria-hidden="true" /> Approved</span>;
  }
  if (row.status === "rejected") {
    return <span className="risk-badge risk-badge-high is-compact"><XCircle size={12} aria-hidden="true" /> Rejected</span>;
  }
  return <span className="risk-badge risk-badge-medium is-compact">Pending review</span>;
}

function QuickReportCard({
  row,
  onChanged,
  onDialog,
}: {
  row: QuickReportRow;
  onChanged: () => void;
  onDialog: (kind: "reject" | "flag") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const level = waterLevelInfo(row.water_level);
  const hasCoords = row.lat != null && row.lng != null && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng));

  const act = async (values: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await updateReport(row.id, values);
      onChanged();
    } catch (err) {
      console.error("Quick report update failed:", err);
      setError(errorText(err, "Unable to update this report."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="clay space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold" style={{ color: "var(--text-primary)" }}>
            {row.barangay || (hasCoords ? "Location shared" : "No location")}
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatTime(row.created_at)}</p>
        </div>
        <StatusBadge row={row} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
        <span className={`risk-badge ${level?.badge ?? "risk-badge-info"} is-compact`}>
          Water: {level ? `${level.label} (${level.severity})` : row.water_level || "Not given"}
        </span>
        {hasCoords && (
          <a
            href={`https://www.google.com/maps?q=${Number(row.lat)},${Number(row.lng)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold underline"
            style={{ color: "var(--primary-shade)" }}
          >
            <MapPin size={14} aria-hidden="true" /> View on map
          </a>
        )}
        {hasCoords && (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {Number(row.lat).toFixed(5)}, {Number(row.lng).toFixed(5)}
          </span>
        )}
      </div>

      {row.landmark && <p className="text-sm"><span className="font-semibold">Landmark:</span> {row.landmark}</p>}
      {row.description && <p className="text-sm whitespace-pre-wrap break-words">{row.description}</p>}

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

      {row.photo_path && <ReportPhoto path={row.photo_path} />}

      {row.status === "rejected" && row.rejection_reason && (
        <p className="text-sm"><span className="font-semibold">Rejection reason:</span> {row.rejection_reason}</p>
      )}
      {row.flagged_false && row.flag_reason && (
        <p className="text-sm"><span className="font-semibold">Flag reason:</span> {row.flag_reason}</p>
      )}

      {error && (
        <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {row.status !== "approved" && !row.flagged_false && (
          <button type="button" className="clay-btn clay-btn-primary" disabled={busy} onClick={() => void act({ status: "approved" })}>
            {busy ? <Loader size={16} className="animate-spin" aria-hidden="true" /> : <CheckCircle size={16} aria-hidden="true" />} Approve
          </button>
        )}
        {row.status !== "rejected" && !row.flagged_false && (
          <button type="button" className="clay-btn clay-btn-secondary" disabled={busy} onClick={() => onDialog("reject")}>
            <XCircle size={16} aria-hidden="true" /> Reject
          </button>
        )}
        {row.flagged_false ? (
          <button type="button" className="clay-btn clay-btn-secondary" disabled={busy} onClick={() => void act({ flagged_false: false })}>
            <Undo2 size={16} aria-hidden="true" /> Unflag
          </button>
        ) : (
          <button type="button" className="clay-btn clay-btn-danger" disabled={busy} onClick={() => onDialog("flag")}>
            <Flag size={16} aria-hidden="true" /> Flag as false
          </button>
        )}
      </div>
    </article>
  );
}

/** Private bucket: a 5-minute signed URL, requested when the card shows. */
function ReportPhoto({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
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
      <img src={url} alt="Photo sent with the report" className="max-h-72 w-full rounded-2xl object-cover" onError={() => setFailed(true)} />
    </a>
  );
}

function ReasonDialog({
  kind,
  row,
  onClose,
  onDone,
}: {
  kind: "reject" | "flag";
  row: QuickReportRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const isFlag = kind === "flag";

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
      await updateReport(row.id, isFlag ? { flagged_false: true, flag_reason: text } : { status: "rejected", rejection_reason: text });
      onDone();
    } catch (err) {
      console.error("Quick report update failed:", err);
      setError(errorText(err, "Unable to update this report."));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="qr-dialog-title" className="clay w-full max-w-md space-y-4 p-6">
        <h3 id="qr-dialog-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          {isFlag ? "Flag as false" : "Reject report"}
        </h3>
        {isFlag && (
          <p className="rounded-xl px-3 py-2 text-sm" style={{ background: "#fdecec", color: "var(--risk-high)" }}>
            This will block the sending device from using Quick Report again.
          </p>
        )}
        <label className="block">
          <span className="clay-label">Reason (required)</span>
          <textarea ref={ref} className="clay-input min-h-24" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} disabled={busy} />
        </label>
        {error && (
          <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="clay-btn clay-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className={isFlag ? "clay-btn clay-btn-danger" : "clay-btn clay-btn-primary"}
            disabled={busy || !reason.trim()}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : isFlag ? "Flag as false" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
