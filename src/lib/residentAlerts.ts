import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { subscribeToTable } from "./realtime";
import { ALERT_COLUMNS, toAlertRow, type AlertRow } from "./alerts";
import { alertTargetsBarangay } from "./alertsSeen";

/*
 * Current alerts for one resident, from the view active_alerts: published,
 * not past their end time, not replaced by an all clear, and targeted at their
 * barangay or "All Barangays".
 *
 * What is current depends on other rows and on the clock, so a change on the
 * shared alerts channel re-reads the view instead of patching the list.
 * Row-level security also hides a withdrawn alert from residents, so Realtime
 * never delivers that UPDATE to them. The list is therefore also re-read when
 * the tab becomes visible again and once a minute while it is visible, so
 * ended and withdrawn alerts drop off within a minute.
 */

const LIST_LIMIT = 50;
const REFRESH_MS = 60_000;
const CHANGE_DELAY_MS = 300;

export function useResidentBarangay(userId: string | null): string | null {
  const [barangay, setBarangay] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("barangay")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setBarangay(typeof data?.barangay === "string" ? data.barangay.trim() : "");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return barangay;
}

export function useResidentAlerts(barangay: string | null) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (barangay === null) return;
    let cancelled = false;
    const relevant = (a: AlertRow) => alertTargetsBarangay(a.target_barangay, barangay) || a.target_barangay === "All Barangays";

    const load = async () => {
      const { data, error: readError } = await supabase
        .from("active_alerts")
        .select(ALERT_COLUMNS)
        .or(`target_barangay.eq."${barangay}",target_barangay.eq."All Barangays"`)
        .order("sent_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (cancelled) return;
      if (readError) setError(readError.message);
      else {
        setError(null);
        setAlerts(((data ?? []) as Record<string, unknown>[]).map(toAlertRow).filter(relevant));
      }
      setLoading(false);
    };
    void load();

    let changeTimer: number | undefined;
    const unsubscribe = subscribeToTable("alerts", () => {
      if (cancelled) return;
      window.clearTimeout(changeTimer);
      changeTimer = window.setTimeout(() => void load(), CHANGE_DELAY_MS);
    });

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refreshIfVisible, REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(changeTimer);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [barangay, reloadKey]);

  return { alerts, loading, error, reload };
}
