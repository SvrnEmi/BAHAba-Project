import { useEffect, useRef } from "react";

/* Rules for the barangay home tiles. No Supabase here, so tests can import it. */

export type ActiveAlert = { expires_at: string | null; is_all_clear: boolean | null };
export type PublishedAlert = { status: string; sent_at: string };

const manilaDate = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });

/** Rows from active_alerts. An all clear is not a danger, and an end time can pass between reads. */
export const countActiveAlerts = (rows: ActiveAlert[], now: number) =>
  rows.filter((a) => !a.is_all_clear && (!a.expires_at || new Date(a.expires_at).getTime() > now)).length;

/** Alerts that went out today (Manila calendar). A withdrawn alert was still published. */
export const countPublishedToday = (alerts: PublishedAlert[], now: number) =>
  alerts.filter((a) => {
    const sent = new Date(a.sent_at).getTime();
    return (a.status === "approved" || a.status === "withdrawn") && !Number.isNaN(sent) && manilaDate.format(sent) === manilaDate.format(now);
  }).length;

/** "just now", "20 min ago", "3 hr ago", "2 days ago". */
export function shortAgo(t: number, now: number): string {
  const minutes = Math.floor((now - t) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** Calls `refresh` when the tab comes back. Focus and visibility often fire together, so once per second at most. */
export function useRefreshOnFocus(refresh: () => void) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    let last = 0;
    const onReturn = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 1000) return;
      last = Date.now();
      latest.current();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, []);
}
