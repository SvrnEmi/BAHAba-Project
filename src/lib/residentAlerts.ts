import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { subscribeToTable } from "./realtime";
import { ALERT_COLUMNS, toAlertRow, type AlertRow } from "./alerts";
import { alertTargetsBarangay } from "./alertsSeen";

/*
 * Published alerts for one resident: status approved, targeted at their
 * barangay or "All Barangays". Live through the shared alerts channel.
 *
 * Row-level security hides an alert from residents as soon as it is
 * withdrawn, so Realtime never delivers that UPDATE to them. The list is
 * therefore also re-read when the tab becomes visible again and once a
 * minute while it is visible, so withdrawn alerts drop off within a minute.
 */

const LIST_LIMIT = 50;
const REFRESH_MS = 60_000;

const byNewest = (a: AlertRow, b: AlertRow) => (b.sent_at ?? "").localeCompare(a.sent_at ?? "");

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
    const relevant = (a: AlertRow) => a.status === "approved" && (alertTargetsBarangay(a.target_barangay, barangay) || a.target_barangay === "All Barangays");

    const load = async () => {
      const { data, error: readError } = await supabase
        .from("alerts")
        .select(ALERT_COLUMNS)
        .eq("status", "approved")
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

    const unsubscribe = subscribeToTable("alerts", (change) => {
      if (cancelled) return;
      if (change.eventType === "DELETE") {
        const id = Number((change.old as { id?: unknown }).id);
        setAlerts((current) => current.filter((a) => a.id !== id));
        return;
      }
      const row = toAlertRow(change.new as Record<string, unknown>);
      setAlerts((current) => {
        const rest = current.filter((a) => a.id !== row.id);
        return relevant(row) ? [row, ...rest].sort(byNewest) : rest;
      });
    });

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refreshIfVisible, REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [barangay, reloadKey]);

  return { alerts, loading, error, reload };
}
