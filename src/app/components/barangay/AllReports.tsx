import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { ImageOff, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { subscribeToTable } from "../../../lib/realtime";
import { useLatestMessages } from "../../../lib/reportMessages";
import { waterLevelInfo } from "../../../lib/quickReport";
import { displayReporterName } from "../../../lib/reports";
import { errorMessage, formatManilaDateTime, relativeTime, toTime } from "../../../lib/barangayAdmin";
import { reportPhotoUrl } from "../../../lib/postedReports";
import { useRefreshOnFocus } from "../../../lib/barangayTiles";
import {
  ALL_REPORTS_PAGE,
  ALL_REPORT_COLUMNS,
  DATE_OPTIONS,
  DEFAULT_VIEW,
  LEVEL_OPTIONS,
  SORT_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
  dateBounds,
  hasFilters,
  readView,
  searchFilter,
  sortLoaded,
  sourceLabel,
  writeView,
  type AllReportRow,
  type AllReportsView,
} from "../../../lib/allReports";
import { ClayCard } from "../clay/Clay";
import { ReportAdvisoryPanel } from "../ReportAdvisories";
import { ReportMessages } from "../ReportMessages";
import {
  QUICK_REPORT_COLUMNS,
  QuickReportCard,
  REPORT_COLUMNS,
  ReportDetails,
  StatusBadge,
  type BarangayQuickReport,
  type BarangayReport,
} from "./BarangayReports";

/*
 * All reports: everything in public.all_reports for the official's barangay,
 * read-only. Community reports are readable by every signed-in user, so the
 * query always filters by barangay. Search, filters, sort, page and the open
 * report live in the URL.
 */

const SEARCH_DELAY_MS = 300;
const CHANGE_DELAY_MS = 400;

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

function fetchRows(barangay: string, view: AllReportsView, from: number, count: number) {
  let query = supabase.from("all_reports").select(ALL_REPORT_COLUMNS, { count: "exact" }).eq("barangay", barangay);
  if (view.q.trim()) query = query.or(searchFilter(view.q));
  if (view.source !== "all") query = query.eq("source", view.source);
  if (view.status === "approved") query = query.in("status", ["approved", "verified"]);
  else if (view.status !== "all") query = query.eq("status", view.status);
  if (view.level !== "all") query = query.eq("water_level", view.level);
  const bounds = dateBounds(view, Date.now());
  if (bounds.from) query = query.gte("reported_at", bounds.from);
  if (bounds.before) query = query.lt("reported_at", bounds.before);
  // kind and id keep the order fixed, so Load more never repeats or skips a row.
  return query
    .order("reported_at", { ascending: view.sort === "oldest" })
    .order("kind")
    .order("id")
    .range(from, from + count - 1);
}

function usePhoto(bucket: string | null, path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!path) return;
    if (bucket !== "quick-report-photos") {
      setUrl(reportPhotoUrl(path));
      return;
    }
    let cancelled = false;
    // Private bucket: a 5-minute signed URL.
    void supabase.storage
      .from(bucket)
      .createSignedUrl(path, 300)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) setFailed(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);
  return { url, failed, setFailed };
}

function Thumb({ row }: { row: AllReportRow }) {
  const { url, failed, setFailed } = usePhoto(row.photo_bucket, row.photo_path);
  if (failed) {
    return (
      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/70" style={{ color: "var(--text-secondary)" }}>
        <ImageOff size={18} aria-label="Photo unavailable" />
      </span>
    );
  }
  if (!url) return <span aria-hidden="true" className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-white/70 motion-reduce:animate-none" />;
  return <img src={url} alt="Photo sent with the report" loading="lazy" decoding="async" width={64} height={64} className="h-16 w-16 shrink-0 rounded-xl object-cover" onError={() => setFailed(true)} />;
}

function Row({ row, now, onOpen }: { row: AllReportRow; now: number; onOpen: () => void }) {
  const level = waterLevelInfo(row.water_level);
  const name = row.kind === "quick" ? row.reporter_name?.trim() || "Guest" : displayReporterName(row.reporter_name);
  const time = toTime(row.reported_at);
  return (
    <ClayCard onClick={onOpen} radius={22} className="flex h-full w-full gap-3 p-4">
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="risk-badge risk-badge-info is-compact">{sourceLabel(row.source)}</span>
          <StatusBadge status={row.status} />
          {level && <span className={`risk-badge ${level.badge} is-compact`}>{level.label}</span>}
        </span>
        <span className="block truncate text-sm font-bold" style={{ color: "var(--text-primary)" }}>{row.location?.trim() || "Location shared"}</span>
        <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
          By {name}
          {time > 0 && (
            <>
              {" · "}
              <time dateTime={row.reported_at ?? undefined} title={formatManilaDateTime(row.reported_at)}>{relativeTime(time, now)}</time>
            </>
          )}
        </span>
        {row.status === "rejected" && row.rejection_reason?.trim() && (
          <span className="block text-xs" style={{ color: "var(--text-primary)" }}>
            <span className="font-semibold">Rejection reason:</span> {row.rejection_reason}
          </span>
        )}
      </span>
      {row.photo_path && <Thumb row={row} />}
    </ClayCard>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ id: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <label className="block min-w-0">
      <span className="clay-label">{label}</span>
      <select className="clay-input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function CommunityDetails({ report, userId }: { report: BarangayReport; userId: string | null }) {
  const { latest, update } = useLatestMessages([report.id]);
  return (
    <>
      <StatusBadge status={report.status} />
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatManilaDateTime(report.timestamp)}</p>
      <ReportDetails report={report}>
        <ReportMessages reportId={report.id} viewerRole="barangay" userId={userId} latest={latest[report.id]} onLatest={update} />
        <ReportAdvisoryPanel reportId={report.id} userId={userId} />
      </ReportDetails>
    </>
  );
}

type Detail = { kind: "community"; report: BarangayReport } | { kind: "quick"; report: BarangayQuickReport };

/** Reads the full row: the view has neither the approval reason nor the reporter's phone. */
function ReportDialog({ target, barangay, userId, onClose }: { target: string; barangay: string; userId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [kind, rawId] = target.split("-");
  const id = Number(rawId);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    const read = async () => {
      if (kind !== "community" && kind !== "quick") throw new Error("This report could not be found.");
      const { data, error: readError } = await supabase
        .from(kind === "community" ? "community_reports" : "quick_reports")
        .select(kind === "community" ? REPORT_COLUMNS : QUICK_REPORT_COLUMNS)
        .eq("id", id)
        .eq("barangay", barangay)
        .maybeSingle();
      if (readError) throw readError;
      if (!data) throw new Error("This report could not be found.");
      return { kind, report: data } as unknown as Detail;
    };
    read().then(
      (next) => {
        if (!cancelled) setDetail(next);
      },
      (err) => {
        if (!cancelled) setError(errorMessage(err, "Unable to load this report."));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kind, id, barangay]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
    // onClose is a new function on every render; the listener only needs the latest URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = detail?.kind === "community" ? detail.report.location?.trim() || "Report details" : "Report details";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="all-report-title" className="clay max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-6 outline-none">
        <div className="flex items-start justify-between gap-2">
          <h3 id="all-report-title" className="min-w-0 break-words text-lg font-bold" style={{ color: "var(--text-primary)" }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="clay-btn clay-btn-secondary !min-h-11 !min-w-11 shrink-0 !p-0">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-sm" style={{ color: "var(--text-primary)" }}>{error}</p>
        ) : !detail ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white/70 motion-reduce:animate-none" aria-label="Loading the report" />
        ) : detail.kind === "community" ? (
          <CommunityDetails report={detail.report} userId={userId} />
        ) : (
          <QuickReportCard row={detail.report} />
        )}
      </div>
    </div>
  );
}

export function AllReportsSection({ barangay, userId, now }: { barangay: string; userId: string | null; now: number }) {
  const [params, setParams] = useSearchParams();
  const view = readView(params);
  const target = params.get("report");

  const [text, setText] = useState(view.q);
  const [rows, setRows] = useState<AllReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const read = useRef(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const viewRef = useRef(view);
  viewRef.current = view;

  const update = useCallback(
    (change: Partial<AllReportsView>, replace = false) => {
      // Anything but the page itself starts the list again.
      const next = { ...viewRef.current, page: 1, ...change };
      setParams((current) => writeView(current, next), { replace });
    },
    [setParams],
  );

  // Search, filters and sort; the page and the open report do not reload the list.
  const listKey = JSON.stringify({ ...view, page: 0 });

  const reload = useCallback(
    async (quiet: boolean) => {
      const mine = ++read.current;
      if (!quiet) setLoad({ status: "loading" });
      const current = viewRef.current;
      // A refresh keeps what is on screen: Load more may have gone past page 1.
      const count = Math.max(current.page * ALL_REPORTS_PAGE, quiet ? rowsRef.current.length : 0);
      const { data, error, count: exact } = await fetchRows(barangay, current, 0, count);
      if (mine !== read.current) return;
      if (error) {
        setLoad({ status: "error", message: error.message });
        return;
      }
      setRows((data ?? []) as unknown as AllReportRow[]);
      setTotal(exact ?? 0);
      setMoreError(null);
      setLoad({ status: "ready" });
    },
    [barangay],
  );

  useEffect(() => {
    void reload(false);
  }, [reload, listKey]);

  // Typing: one URL change after a pause. Back and Forward put the URL text in the box.
  useEffect(() => {
    if (text === viewRef.current.q) return;
    const timer = window.setTimeout(() => update({ q: text }, true), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text, update]);
  useEffect(() => setText(view.q), [view.q]);

  // Live: only rows of this barangay, or rows already listed (a DELETE carries just the id).
  useEffect(() => {
    let timer: number | undefined;
    const listen = (table: string, kind: AllReportRow["kind"]) =>
      subscribeToTable(table, (change) => {
        const next = change.new as { barangay?: unknown };
        const id = Number((change.old as { id?: unknown }).id ?? (change.new as { id?: unknown }).id);
        if (next.barangay !== barangay && !rowsRef.current.some((r) => r.kind === kind && r.id === id)) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void reload(true), CHANGE_DELAY_MS);
      });
    const unsubscribers = [listen("community_reports", "community"), listen("quick_reports", "quick")];
    return () => {
      window.clearTimeout(timer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [barangay, reload]);

  useRefreshOnFocus(() => void reload(true));

  const loadMore = async () => {
    const mine = ++read.current;
    setLoadingMore(true);
    setMoreError(null);
    const { data, error, count } = await fetchRows(barangay, viewRef.current, rowsRef.current.length, ALL_REPORTS_PAGE);
    setLoadingMore(false);
    if (mine !== read.current) return;
    if (error) {
      setMoreError(error.message);
      return;
    }
    const more = (data ?? []) as unknown as AllReportRow[];
    setRows((current) => [...current, ...more.filter((m) => !current.some((r) => r.kind === m.kind && r.id === m.id))]);
    setTotal(count ?? 0);
    update({ page: viewRef.current.page + 1 }, true);
  };

  const openReport = (row: AllReportRow) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("report", `${row.kind}-${row.id}`);
      return next;
    });

  const closeReport = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("report");
        return next;
      },
      { replace: true },
    );

  const clear = () => {
    setText("");
    setParams((current) => writeView(current, DEFAULT_VIEW_KEEPING_SORT(viewRef.current)));
  };

  const searched = view.q.trim();
  const narrowed = !!searched || hasFilters(view);
  const visible = sortLoaded(rows, view.sort);

  return (
    <div className="space-y-4">
      <label className="relative block">
        <span className="sr-only">Search reports by location, description or reporter</span>
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
        <input type="search" className="clay-input has-icon-left" placeholder="Search location, description or reporter" value={text} onChange={(e) => setText(e.target.value)} />
      </label>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Select label="Source" value={view.source} options={SOURCE_OPTIONS} onChange={(source) => update({ source })} />
        <Select label="Status" value={view.status} options={STATUS_OPTIONS} onChange={(status) => update({ status })} />
        <Select label="Water level" value={view.level} options={LEVEL_OPTIONS} onChange={(level) => update({ level })} />
        <Select label="Date" value={view.date} options={DATE_OPTIONS} onChange={(date) => update({ date, ...(date === "custom" ? {} : { from: "", to: "" }) })} />
        <div className="col-span-2 lg:col-span-1">
          <Select label="Sort" value={view.sort} options={SORT_OPTIONS} onChange={(sort) => update({ sort, page: view.page })} />
        </div>
      </div>

      {view.date === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="clay-label">From</span>
            <input type="date" className="clay-input" value={view.from} max={view.to || undefined} onChange={(e) => update({ from: e.target.value })} />
          </label>
          <label className="block min-w-0">
            <span className="clay-label">To</span>
            <input type="date" className="clay-input" value={view.to} min={view.from || undefined} onChange={(e) => update({ to: e.target.value })} />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {load.status === "ready" && (
            <>
              {searched ? `${total} ${total === 1 ? "result" : "results"} for '${searched}'. ` : ""}
              Showing {rows.length} of {total}
            </>
          )}
        </p>
        {narrowed && (
          <button type="button" className="clay-btn clay-btn-secondary" onClick={clear}>Clear filters</button>
        )}
      </div>

      {load.status === "error" ? (
        <div className="space-y-2">
          <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
            Could not load reports: {load.message}
          </p>
          <button type="button" className="clay-btn clay-btn-secondary" onClick={() => void reload(false)}>
            <RefreshCw size={16} aria-hidden="true" /> Retry
          </button>
        </div>
      ) : load.status === "loading" ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="clay h-24 animate-pulse motion-reduce:animate-none" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="clay space-y-3 p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          <p>{narrowed ? "No reports match your search" : "No reports in your barangay yet."}</p>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {visible.map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                <Row row={row} now={now} onOpen={() => openReport(row)} />
              </li>
            ))}
          </ul>
          {moreError && <p role="alert" className="text-sm" style={{ color: "var(--text-primary)" }}>Could not load more reports: {moreError}</p>}
          {rows.length < total && (
            <button type="button" className="clay-btn clay-btn-secondary w-full" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}

      {target && <ReportDialog key={target} target={target} barangay={barangay} userId={userId} onClose={closeReport} />}
    </div>
  );
}

/** Clear filters resets search and filters; the chosen sort is not a filter. */
const DEFAULT_VIEW_KEEPING_SORT = (view: AllReportsView): AllReportsView => ({ ...DEFAULT_VIEW, sort: view.sort });
