import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { subscribeToTable } from "../../lib/realtime";
import {
  CATCH_UP_LIMIT,
  PopupQueue,
  advisoryPopupKey,
  catchUpAdvisories,
  readAdvisoryLastSeen,
  readShownAdvisoryIds,
  saveAdvisoryLastSeen,
  saveShownAdvisoryIds,
} from "../../lib/reportPopups";
import { ADVISORY_COLUMNS, advisoryAuthor, type ReportAdvisory } from "../../lib/reportAdvisories";
import { formatManilaDateTime } from "../../lib/barangayAdmin";
import { STRINGS } from "../../lib/strings";
import { PopupFrame } from "./VerifiedReportPopup";

const T = STRINGS.advisory;

async function fetchOwnReportIds(userId: string): Promise<Set<number>> {
  const { data, error } = await supabase.from("community_reports").select("id").eq("user_id", userId).order("timestamp", { ascending: false }).limit(200);
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ id: number }>).map((row) => row.id));
}

async function fetchOwnAdvisories(ownIds: Set<number>): Promise<ReportAdvisory[]> {
  if (ownIds.size === 0) return [];
  const { data, error } = await supabase
    .from("report_advisories")
    .select(ADVISORY_COLUMNS)
    .in("report_id", [...ownIds])
    .order("created_at", { ascending: false })
    .limit(CATCH_UP_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as ReportAdvisory[];
}

async function isOwnReport(reportId: number, userId: string): Promise<boolean> {
  const { data } = await supabase.from("community_reports").select("id").eq("id", reportId).eq("user_id", userId).maybeSingle();
  return !!data;
}

/*
 * Mounted in the resident Layout only, so it never appears on the login,
 * register or public pages, for guests or for admins. The advisory channel
 * carries every advisory the resident may read, so each new one is checked
 * against the resident's own reports before it can pop up.
 */
export function AdvisoryPopup() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [dialog, setDialog] = useState<ReportAdvisory[] | null>(null);
  const queueRef = useRef<PopupQueue<ReportAdvisory> | null>(null);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const shown = readShownAdvisoryIds(userId);
    const remember = (keys: string[]) => {
      keys.forEach((key) => shown.add(key));
      saveShownAdvisoryIds(userId, shown);
    };
    const queue = new PopupQueue<ReportAdvisory>({
      keyOf: advisoryPopupKey,
      reportIdOf: (advisory) => advisory.report_id,
      isShown: (key) => shown.has(key),
      markShown: remember,
      isViewing: (id) => pathRef.current === `/reports/${id}`,
      show: (advisories) => setDialog(advisories),
    });
    queueRef.current = queue;

    const start = async () => {
      const own = new Set<number>();
      try {
        (await fetchOwnReportIds(userId)).forEach((id) => own.add(id));
        const rows = await fetchOwnAdvisories(own);
        if (cancelled) return;
        const fresh = catchUpAdvisories(rows, readAdvisoryLastSeen(userId), shown);
        if (fresh === null) remember(rows.map(advisoryPopupKey));
        else if (fresh.length > 0) queue.addCatchUp(fresh);
        saveAdvisoryLastSeen(userId, Date.now());
      } catch (err) {
        console.error("Advisory catch-up failed:", err);
        if (cancelled) return;
      }
      unsubscribe = subscribeToTable("report_advisories", (change) => {
        if (change.eventType !== "INSERT") return;
        const advisory = change.new as unknown as ReportAdvisory;
        if (advisory.author_id === userId) return;
        if (own.has(advisory.report_id)) {
          queue.add(advisory);
          return;
        }
        // A report sent after this page opened is not in the list yet.
        void isOwnReport(advisory.report_id, userId).then((mine) => {
          if (!mine || cancelled) return;
          own.add(advisory.report_id);
          queue.add(advisory);
        });
      });
    };
    void start();

    return () => {
      cancelled = true;
      unsubscribe?.();
      queue.stop();
      queueRef.current = null;
    };
  }, [userId]);

  if (!dialog) return null;

  const close = () => {
    setDialog(null);
    queueRef.current?.closed();
  };
  const open = (reportId: number) => {
    close();
    navigate(`/reports/${reportId}`);
  };

  return (
    <PopupFrame title={dialog.length === 1 ? T.popupTitle : T.popupMany(dialog.length)} onClose={close}>
      <ul className="space-y-3">
        {dialog.map((advisory) => (
          <li key={advisory.id} className="space-y-1">
            <p className="whitespace-pre-wrap break-words text-sm" style={{ color: "var(--text-primary)" }}>{advisory.body}</p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {T.from(advisoryAuthor(advisory))} · {formatManilaDateTime(advisory.created_at)}
            </p>
            {dialog.length > 1 && (
              <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={() => open(advisory.report_id)}>{STRINGS.popup.viewReport}</button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <button type="button" className="clay-btn clay-btn-secondary" onClick={close}>{STRINGS.popup.dismiss}</button>
        {dialog.length === 1 && (
          <button type="button" className="clay-btn clay-btn-primary" onClick={() => open(dialog[0].report_id)}>{STRINGS.popup.viewReport}</button>
        )}
      </div>
    </PopupFrame>
  );
}
