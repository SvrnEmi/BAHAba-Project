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

type AlertRow = { id: number; status: string | null; target_barangay: string | null; sent_at: string | null };

/**
 * Live count of approved, relevant alerts sent after the user's last-seen
 * time. Uses the shared alerts channel (subscribeToTable), so no extra
 * Realtime connection is opened.
 */
export function useUnreadAlertCount(userId: string | null, barangay: string | null): number {
  const [unreadIds, setUnreadIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!userId || !barangay) return;
    let cancelled = false;
    const lastSeen = getAlertsLastSeen(userId);

    const isUnread = (row: AlertRow) =>
      row.status === "approved" &&
      alertTargetsBarangay(row.target_barangay, barangay) &&
      !!row.sent_at &&
      new Date(row.sent_at).getTime() > lastSeen;

    const update = (row: AlertRow) =>
      setUnreadIds((current) => {
        const unread = isUnread(row);
        if (unread === current.has(row.id)) return current;
        const next = new Set(current);
        if (unread) next.add(row.id);
        else next.delete(row.id);
        return next;
      });

    void supabase
      .from("alerts")
      .select("id, status, target_barangay, sent_at")
      .eq("status", "approved")
      .gt("sent_at", new Date(lastSeen).toISOString())
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        for (const row of data as AlertRow[]) update(row);
      });

    const unsubscribe = subscribeToTable<AlertRow>("alerts", (change) => {
      if (change.eventType === "INSERT" || change.eventType === "UPDATE") {
        update(change.new as AlertRow);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      setUnreadIds(new Set());
    };
  }, [userId, barangay]);

  return unreadIds.size;
}
