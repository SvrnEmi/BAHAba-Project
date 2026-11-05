import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { subscribeToTable } from "./realtime";

/*
 * "Unread alerts" for the resident Home bell.
 * Last-seen time is stored per user in localStorage; every access is
 * wrapped in try/catch because storage can be blocked (private mode etc.).
 */

const SEEN_KEY = (userId: string) => `bahaba_alerts_seen_${userId}`;
const FIRST_RUN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Last time this user opened Alerts. New users: everything older than 7 days counts as seen. */
export function getAlertsLastSeen(userId: string): number {
  try {
    const stored = Number(localStorage.getItem(SEEN_KEY(userId)));
    if (Number.isFinite(stored) && stored > 0) return stored;
  } catch {
    // Storage unavailable: fall through to the default window.
  }
  return Date.now() - FIRST_RUN_WINDOW_MS;
}

export function markAlertsSeen(userId: string) {
  try {
    localStorage.setItem(SEEN_KEY(userId), String(Date.now()));
  } catch {
    // Storage unavailable: the badge just won't persist its reset.
  }
}

/** Marks alerts seen for whoever is signed in (uses the local session, no network). */
export async function markAlertsSeenForCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user.id) markAlertsSeen(session.user.id);
}

/**
 * Whether an alert's target applies to [barangay]: exact match, "All
 * Barangays", or a comma/semicolon-separated multi-barangay target.
 */
export function alertTargetsBarangay(target: string | null | undefined, barangay: string): boolean {
  if (!target) return false;
  const wanted = barangay.trim().toLowerCase();
  const parts = target.split(/[,;]/).map((part) => part.trim().toLowerCase());
  return parts.some((part) => part === "all barangays" || part === wanted || part === `barangay ${wanted}`);
}

type AlertRow = { id: number; target_barangay: string | null; sent_at: string | null };

/**
 * Live count of current alerts (active_alerts) for this barangay sent after
 * the user's last-seen time, so the badge never counts an alert the Alerts
 * screen no longer lists. Re-reads on the shared alerts channel, so no extra
 * Realtime connection is opened.
 */
export function useUnreadAlertCount(userId: string | null, barangay: string | null): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!userId || !barangay) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("active_alerts")
        .select("id, target_barangay, sent_at")
        .gt("sent_at", new Date(getAlertsLastSeen(userId)).toISOString());
      if (cancelled || error || !data) return;
      setUnread((data as AlertRow[]).filter((row) => alertTargetsBarangay(row.target_barangay, barangay)).length);
    };
    void load();

    let changeTimer: number | undefined;
    const unsubscribe = subscribeToTable<AlertRow>("alerts", () => {
      window.clearTimeout(changeTimer);
      changeTimer = window.setTimeout(() => void load(), 300);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(changeTimer);
      unsubscribe();
      setUnread(0);
    };
  }, [userId, barangay]);

  return unread;
}
