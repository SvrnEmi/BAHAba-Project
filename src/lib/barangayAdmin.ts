/*
 * Shared helpers for the Barangay admin dashboard and its Settings page:
 * Asia/Manila time formatting, alert templates and the per-browser
 * notification choice (localStorage, every access in try/catch).
 */

const manilaTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const manilaHour = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric" });
const manilaDay = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short" });
const manilaDate = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const manilaDateTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const toTime = (iso: string | null | undefined): number => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/** "3:40 PM" (Manila). */
export const formatManilaTime = (t: number) => manilaTime.format(t);
/** "3 PM" (Manila). */
export const formatManilaHour = (t: number) => manilaHour.format(t);
/** "Oct 18, 2026, 3:40 PM PHT". */
export const formatManilaDateTime = (iso: string | null | undefined) => {
  const t = toTime(iso);
  return t ? `${manilaDateTime.format(t)} PHT` : "Unknown time";
};
/** "3:40 PM", or "Sun 3:40 PM" when not today (Manila calendar). */
export function formatManilaWhen(t: number, now = Date.now()): string {
  const sameDay = manilaDate.format(t) === manilaDate.format(now);
  return sameDay ? manilaTime.format(t) : `${manilaDay.format(t)} ${manilaTime.format(t)}`;
}

export function relativeTime(t: number, now: number): string {
  if (!t) return "";
  const minutes = Math.floor((now - t) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return formatManilaDateTime(new Date(t).toISOString());
}

export const errorMessage = (err: unknown, fallback: string) =>
  err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
    ? (err as { message: string }).message
    : fallback;

export type AlertLevel = "advisory" | "warning" | "critical";

export const ALERT_TEMPLATES: Array<{ id: string; label: string; level: AlertLevel; text: string }> = [
  { id: "advisory-en", label: "Advisory (English)", level: "advisory", text: "Advisory: Heavy rain is expected in {barangay}. Residents in low-lying areas, please stay alert and monitor updates." },
  { id: "advisory-fil", label: "Advisory (Filipino)", level: "advisory", text: "Paalala: Inaasahan ang malakas na ulan sa {barangay}. Pinapayuhan ang mga nasa mabababang lugar na maging alerto at subaybayan ang mga update." },
  { id: "warning-en", label: "Warning (English)", level: "warning", text: "Warning: Flooding is possible in {barangay}. Prepare your emergency kit and be ready to move to higher ground." },
  { id: "warning-fil", label: "Warning (Filipino)", level: "warning", text: "Babala: Maaaring bumaha sa {barangay}. Ihanda ang inyong emergency kit at maging handang lumikas sa mataas na lugar." },
  { id: "critical-en", label: "Critical (English)", level: "critical", text: "Critical: Flooding is occurring or imminent in {barangay}. Evacuate low-lying areas now. Call MDRRMO +63 919 079 8427 or 911 if you need help." },
  { id: "critical-fil", label: "Critical (Filipino)", level: "critical", text: "Kritikal: Nagaganap o malapit nang bumaha sa {barangay}. Lumikas na sa mabababang lugar. Tumawag sa MDRRMO +63 919 079 8427 o 911 kung kailangan ng tulong." },
];

export const fillTemplate = (text: string, barangay: string) => text.split("{barangay}").join(barangay);

/** Legacy created_by value used by earlier versions of the dashboard. */
export const legacyCreatedBy = (barangay: string) => `${barangay} Barangay Admin`;

// Browser notifications for new reports / Quick Reports (per browser).
const NOTIFY_KEY = "bahaba.barangay.browserNotifications";

export function readBrowserNotifications(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeBrowserNotifications(on: boolean) {
  try {
    localStorage.setItem(NOTIFY_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}

/** Shows a browser notification if the admin turned them on and permission is granted. */
export function notifyBrowser(title: string, body: string) {
  try {
    if (!readBrowserNotifications()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification(title, { body, tag: `bahaba-${title}-${body}` });
  } catch {
    // Notifications unavailable (e.g. some mobile browsers); the feed still updates.
  }
}
