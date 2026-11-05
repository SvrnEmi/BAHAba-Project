import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { subscribeToTable } from "../../lib/realtime";
import {
  CATCH_UP_LIMIT,
  POPUP_COLUMNS,
  PopupQueue,
  catchUpReports,
  isPopupEvent,
  popupKey,
  readLastSeenReportTime,
  readShownReportIds,
  saveLastSeenReportTime,
  saveShownReportIds,
  type PopupReport,
} from "../../lib/reportPopups";
import { waterLevelLabel } from "../../lib/reports";
import { formatManilaDateTime } from "../../lib/barangayAdmin";
import { STRINGS } from "../../lib/strings";

const T = STRINGS.popup;
type Dialog = { reports: PopupReport[]; catchUp: boolean };

/** Newest reports a pop-up could be about: the barangay's approved ones and the resident's own decided ones. */
async function fetchPopupReports(barangay: string, userId: string): Promise<PopupReport[]> {
  const { data, error } = await supabase
    .from("community_reports")
    .select(POPUP_COLUMNS)
    .or(`and(status.eq.approved,barangay.eq."${barangay}"),and(user_id.eq.${userId},status.in.(approved,rejected))`)
    .order("timestamp", { ascending: false })
    .limit(CATCH_UP_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as PopupReport[];
}

/*
 * Mounted in the resident Layout only, so it never appears on the login,
 * register or public pages, for guests or for admins.
 */
export function VerifiedReportPopup() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [barangay, setBarangay] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const queueRef = useRef<PopupQueue | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("barangay")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setBarangay(typeof data?.barangay === "string" && data.barangay.trim() ? data.barangay.trim() : null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !barangay) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const shown = readShownReportIds(userId, barangay);
    const remember = (keys: string[]) => {
      keys.forEach((key) => shown.add(key));
      saveShownReportIds(userId, barangay, shown);
    };
    const queue = new PopupQueue({
      isShown: (key) => shown.has(key),
      markShown: remember,
      isViewing: (id) => pathRef.current === `/reports/${id}`,
      show: (reports, catchUp) => setDialog({ reports, catchUp }),
    });
    queueRef.current = queue;

    const start = async () => {
      try {
        const rows = (await fetchPopupReports(barangay, userId)).filter((row) => isPopupEvent(row, barangay, userId));
        if (cancelled) return;
        const fresh = catchUpReports(rows, readLastSeenReportTime(userId, barangay), shown);
        if (fresh === null) remember(rows.map(popupKey));
        else if (fresh.length > 0) queue.addCatchUp(fresh);
        saveLastSeenReportTime(userId, barangay, Date.now());
      } catch (err) {
        console.error("Report catch-up failed:", err);
        if (cancelled) return;
      }
      unsubscribe = subscribeToTable<PopupReport>("community_reports", (change) => {
        if (change.eventType === "DELETE") return;
        const row = change.new as PopupReport;
        if (isPopupEvent(row, barangay, userId)) queue.add(row);
      });
    };
    void start();

    return () => {
      cancelled = true;
      unsubscribe?.();
      queue.stop();
      queueRef.current = null;
    };
  }, [userId, barangay]);

  if (!dialog || !barangay || !userId) return null;

  const close = () => {
    setDialog(null);
    queueRef.current?.closed();
  };
  const open = (path: string) => {
    close();
    navigate(path);
  };

  const { reports, catchUp } = dialog;
  const single = reports.length === 1 && !(catchUp && reports[0].status === "approved");
  return single ? (
    <SingleDialog report={reports[0]} userId={userId} onClose={close} onOpen={open} />
  ) : (
    <ListDialog reports={reports} barangay={barangay} userId={userId} onClose={close} onOpen={open} />
  );
}

function Frame({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="report-popup-title" className="clay max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto p-6 outline-none">
        <h2 id="report-popup-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Details({ report }: { report: PopupReport }) {
  return (
    <>
      <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{report.location?.trim() || STRINGS.posted.unknownLocation}</span>
      <span className="block text-sm" style={{ color: "var(--text-primary)" }}>{waterLevelLabel(report.water_level)}</span>
      <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>{formatManilaDateTime(report.timestamp)}</span>
    </>
  );
}

function SingleDialog({ report, userId, onClose, onOpen }: { report: PopupReport; userId: string; onClose: () => void; onOpen: (path: string) => void }) {
  const rejected = report.status === "rejected";
  const title = rejected ? T.rejected : report.user_id === userId ? T.own : T.verified(report.barangay ?? "");
  return (
    <Frame title={title} onClose={onClose}>
      <p><Details report={report} /></p>
      {rejected && <p className="text-sm"><span className="font-semibold">{T.reason}</span> {report.rejection_reason?.trim() || T.noReason}</p>}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <button type="button" className="clay-btn clay-btn-secondary" onClick={onClose}>{T.dismiss}</button>
        {!rejected && <button type="button" className="clay-btn clay-btn-primary" onClick={() => onOpen(`/reports/${report.id}`)}>{T.viewReport}</button>}
      </div>
    </Frame>
  );
}

function ListDialog({ reports, barangay, userId, onClose, onOpen }: { reports: PopupReport[]; barangay: string; userId: string; onClose: () => void; onOpen: (path: string) => void }) {
  const approved = reports.filter((r) => r.status === "approved");
  const title = approved.length === reports.length ? T.many(reports.length, barangay) : T.updates(reports.length);
  return (
    <Frame title={title} onClose={onClose}>
      <ul className="space-y-2">
        {reports.map((report) => (
          <li key={popupKey(report)} className="border-t pt-2">
            {report.status === "rejected" ? (
              <span className="block text-xs font-bold" style={{ color: "var(--risk-high)" }}>{T.rejected}</span>
            ) : report.user_id === userId ? (
              <span className="block text-xs font-bold" style={{ color: "var(--primary-shade)" }}>{T.ownTag}</span>
            ) : null}
            <Details report={report} />
            {report.status === "rejected" && <span className="block text-sm">{report.rejection_reason?.trim() || T.noReason}</span>}
          </li>
        ))}
      </ul>
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <button type="button" className="clay-btn clay-btn-secondary" onClick={onClose}>{T.dismiss}</button>
        {approved.length > 0 && (
          <button
            type="button"
            className="clay-btn clay-btn-primary"
            onClick={() => onOpen(approved.length === 1 ? `/reports/${approved[0].id}` : "/home#posted-reports")}
          >
            {T.view}
          </button>
        )}
      </div>
    </Frame>
  );
}
