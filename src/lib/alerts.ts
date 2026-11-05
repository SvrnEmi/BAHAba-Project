import { useEffect, useState } from "react";
import { STRINGS } from "./strings";
import { supabase } from "./supabase";

/*
 * Shared alert helpers for every role: PAGASA color levels, the explicit
 * column list, row mapping, source labels and the ready-made messages used
 * in the withdraw and report review dialogs.
 *
 * The database keeps the original level values (advisory | warning |
 * critical); PAGASA color and label are shown next to them everywhere.
 * Barangay flood levels on the map stay Low / Medium / High.
 */

export type AlertLevel = "advisory" | "warning" | "critical";
export type AlertStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type AlertSource = "barangay" | "mdrrmo" | "auto";
export type PagasaColor = "yellow" | "orange" | "red";

export type AlertRow = {
  id: number;
  level: AlertLevel;
  title: string;
  message: string;
  target_barangay: string;
  created_by: string | null;
  status: AlertStatus;
  source: AlertSource;
  channels: string;
  sent_at: string | null;
  rejection_reason: string | null;
  withdrawn_reason: string | null;
  withdrawn_at: string | null;
  pagasa_color: PagasaColor;
  pagasa_label: string;
  expires_at: string | null;
  is_all_clear: boolean;
};

/** Explicit list (never select *). */
export const ALERT_COLUMNS =
  "id, level, title, message, target_barangay, created_by, status, source, channels, sent_at, rejection_reason, withdrawn_reason, withdrawn_at, pagasa_color, pagasa_label, expires_at, is_all_clear";

export const PAGASA: Record<AlertLevel, { color: PagasaColor; colorName: string; label: string; badge: string; accent: string }> = {
  advisory: { color: "yellow", colorName: "Yellow", label: "Be Alert", badge: "pagasa-badge-yellow", accent: "var(--pagasa-yellow)" },
  warning: { color: "orange", colorName: "Orange", label: "Be Prepared", badge: "pagasa-badge-orange", accent: "var(--pagasa-orange)" },
  critical: { color: "red", colorName: "Red", label: "Take Action", badge: "pagasa-badge-red", accent: "var(--pagasa-red)" },
};

export const LEVEL_FROM_COLOR: Record<PagasaColor, AlertLevel> = { yellow: "advisory", orange: "warning", red: "critical" };

/** "Orange - Be Prepared". */
export const pagasaText = (level: AlertLevel) => `${PAGASA[level].colorName} - ${PAGASA[level].label}`;

/** Options for every alert form's level dropdown (stores the existing level values). */
export const PAGASA_LEVEL_OPTIONS: Array<{ value: AlertLevel; label: string }> = [
  { value: "advisory", label: "Yellow - Be Alert" },
  { value: "warning", label: "Orange - Be Prepared" },
  { value: "critical", label: "Red - Take Action" },
];

export const LEVEL_RANK: Record<AlertLevel, number> = { advisory: 1, warning: 2, critical: 3 };

export const SOURCE_LABELS: Record<AlertSource, string> = { barangay: "Barangay", mdrrmo: "MDRRMO", auto: "Automatic" };

export const STATUS_LABELS: Record<AlertStatus, string> = {
  pending: "Not published",
  approved: "Published",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const asLevel = (value: unknown): AlertLevel => (value === "warning" || value === "critical" ? value : "advisory");
const asStatus = (value: unknown): AlertStatus =>
  value === "approved" || value === "rejected" || value === "withdrawn" ? value : "pending";
/** Anything that is not a barangay or MDRRMO alert counts as automatic. */
export const asSource = (value: unknown): AlertSource => (value === "barangay" ? "barangay" : value === "mdrrmo" || value == null || value === "" ? "mdrrmo" : "auto");
const str = (value: unknown) => (typeof value === "string" ? value : null);

export function toAlertRow(row: Record<string, unknown>): AlertRow {
  const level = asLevel(row.level);
  const color = row.pagasa_color === "yellow" || row.pagasa_color === "orange" || row.pagasa_color === "red" ? row.pagasa_color : PAGASA[level].color;
  return {
    id: Number(row.id),
    level,
    title: String(row.title ?? ""),
    message: String(row.message ?? ""),
    target_barangay: String(row.target_barangay ?? "All Barangays"),
    created_by: str(row.created_by),
    status: asStatus(row.status),
    source: asSource(row.source),
    channels: String(row.channels ?? "push"),
    sent_at: str(row.sent_at),
    rejection_reason: str(row.rejection_reason),
    withdrawn_reason: str(row.withdrawn_reason),
    withdrawn_at: str(row.withdrawn_at),
    pagasa_color: color,
    pagasa_label: str(row.pagasa_label) ?? PAGASA[level].label,
    expires_at: str(row.expires_at),
    is_all_clear: row.is_all_clear === true,
  };
}

/** "Push notification" etc. for the expanded card. Other stored values (older rows) are not shown. */
export function channelsText(channels: string): string {
  const names: Record<string, string> = { push: "Push notification", sms: "SMS" };
  const list = [...new Set(channels.split(",").map((c) => c.trim()).filter((c) => Object.prototype.hasOwnProperty.call(names, c)))];
  return list.length ? list.map((c) => names[c]).join(", ") : "Push notification";
}

/** Push / toast preview line: "[Orange - Be Prepared] Title". */
export const alertPreviewText = (alert: Pick<AlertRow, "level" | "title">) => `[${pagasaText(alert.level)}] ${alert.title}`;

/** First line of the message, for the collapsed card. */
export const previewLine = (message: string) => message.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";

// Ready-made messages for the review dialogs ("Other" adds free text).
export const OTHER_REASON = "Other";

export const REPORT_APPROVE_REASONS = [
  "Photo and location match the reported flooding",
  "Confirmed by the barangay",
  "Confirmed by another report in the same area",
];

export const REPORT_REJECT_REASONS = [
  "Duplicate of an earlier report",
  "Location does not match the photo",
  "Not enough details",
  "Not a flood",
];

export const ALERT_REJECT_REASONS = [
  "Sent by mistake",
  "Wrong barangay or area",
  "Wrong level for current conditions",
  "Duplicate alert",
  "Information not verified",
];

/** Barangay inserts are limited server-side; the error starts with "Limit reached". */
export const isLimitError = (message: string) => message.trim().startsWith("Limit reached");

// PAGASA rainfall table (public read).
export type PagasaLevelRow = {
  code: string;
  color: string;
  label: string;
  alert_level: string | null;
  meaning: string | null;
  hourly_mm_min: number | null;
  hourly_mm_max: number | null;
  advisory_24h_mm_min: number | null;
  advisory_24h_mm_max: number | null;
  sort_order: number | null;
};

export const PAGASA_LEVEL_COLUMNS =
  "code, color, label, alert_level, meaning, hourly_mm_min, hourly_mm_max, advisory_24h_mm_min, advisory_24h_mm_max, sort_order";

/** One-shot read of pagasa_levels, sorted by sort_order. */
export function usePagasaLevels() {
  const [rows, setRows] = useState<PagasaLevelRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("pagasa_levels")
      .select(PAGASA_LEVEL_COLUMNS)
      .order("sort_order", { ascending: true })
      .then(({ data, error: readError }) => {
        if (cancelled) return;
        if (readError) setError(readError.message);
        else setRows((data ?? []) as unknown as PagasaLevelRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { rows, error };
}

// Alert actions. Every update re-reads the row with explicit columns; zero
// rows back means row-level security refused it, which is reported as an error.

async function updateAlert(id: number, values: Record<string, unknown>): Promise<AlertRow> {
  const { data, error } = await supabase.from("alerts").update(values).eq("id", id).select(ALERT_COLUMNS);
  if (error) throw error;
  if (!data?.length) throw new Error("The database did not save the change (no permission for this alert).");
  return toAlertRow(data[0] as Record<string, unknown>);
}

/** Barangay admins may only send status + withdrawn_reason (min 3 characters); the server stamps the time. */
export const withdrawAlert = (id: number, reason: string) =>
  updateAlert(id, { status: "withdrawn", withdrawn_reason: reason.trim() });

// How long an alert lasts. expires_at null means until withdrawn.

export type AlertEnd = "none" | "3" | "6" | "12" | "24" | "custom";

export const ALERT_END_OPTIONS: Array<{ value: AlertEnd; label: string }> = [
  { value: "none", label: "Until withdrawn" },
  { value: "3", label: "3 hours" },
  { value: "6", label: "6 hours" },
  { value: "12", label: "12 hours" },
  { value: "24", label: "24 hours" },
  { value: "custom", label: "Custom date and time" },
];

/** expires_at as ISO, null for "Until withdrawn". `custom` is a datetime-local value in the browser's time zone. */
export function alertEndIso(end: AlertEnd, custom: string, now = Date.now()): string | null {
  if (end === "none") return null;
  if (end === "custom") return new Date(custom).toISOString();
  return new Date(now + Number(end) * 3_600_000).toISOString();
}

/** Why the chosen end cannot be used, or null if it can. */
export function alertEndProblem(end: AlertEnd, custom: string, now = Date.now()): string | null {
  if (end !== "custom") return null;
  const time = new Date(custom).getTime();
  if (Number.isNaN(time)) return "Choose the end date and time.";
  return time > now ? null : "The end time must be in the future.";
}

export const ALL_BARANGAYS = "All Barangays";

export const allClearTitle = (barangay: string) => `ALL CLEAR: ${barangay}`;
export const allClearMessage = (target: string) =>
  `The flood danger has passed in ${target === ALL_BARANGAYS ? "all barangays" : target}. You can return to normal activities. Stay careful near rivers and low roads.`;

// Status chip for the admin alert lists. The view public.active_alerts decides
// what is still active; alerts it no longer returns have ended or were cleared.

export type AlertLifecycle = { label: string; badge: string; note?: string };

export type ActiveAlertIds = { active: Set<number>; checked: Set<number> };

/** The resident history only says whether an alert has ended. */
export const endedLifecycle = (alert: AlertRow, now: number): AlertLifecycle | null =>
  alert.expires_at && new Date(alert.expires_at).getTime() <= now ? { label: STRINGS.alerts.ended, badge: "risk-badge-neutral" } : null;

export function alertLifecycle(alert: AlertRow, ids: ActiveAlertIds | null, now: number): AlertLifecycle | null {
  if (alert.status === "withdrawn") {
    return { label: "Withdrawn", badge: "risk-badge-neutral", note: `Reason: ${alert.withdrawn_reason?.trim() || "No reason given"}` };
  }
  if (alert.status !== "approved") return null;
  const ended = endedLifecycle(alert, now);
  if (ended) return ended;
  // Not read from the view yet (just published, or the read failed): no chip rather than a wrong one.
  if (!ids?.checked.has(alert.id)) return null;
  return ids.active.has(alert.id) ? { label: "Active", badge: "risk-badge-low" } : { label: "Cleared", badge: "risk-badge-neutral" };
}

/** For useActiveAlertIds: every target, for the MDRRMO. */
export const EVERY_TARGET = "*";

/** Reads active_alerts for one barangay or EVERY_TARGET, again whenever the listed alerts change. */
export function useActiveAlertIds(barangay: string | null | undefined, alerts: AlertRow[]): ActiveAlertIds | null {
  const [ids, setIds] = useState<ActiveAlertIds | null>(null);
  const key = alerts.map((a) => `${a.id}:${a.status}`).join(",");
  useEffect(() => {
    if (!barangay) return;
    let cancelled = false;
    const checked = new Set(alerts.map((a) => a.id));
    const query = supabase.from("active_alerts").select("id");
    void (barangay === EVERY_TARGET ? query : query.in("target_barangay", [barangay, ALL_BARANGAYS]))
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Unable to read active_alerts:", error.message);
          setIds(null);
        } else {
          setIds({ active: new Set(((data ?? []) as Array<{ id: unknown }>).map((r) => Number(r.id))), checked });
        }
      });
    return () => {
      cancelled = true;
    };
    // `key` stands for `alerts`, which is a new array on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barangay, key]);
  return ids;
}

/** MDRRMO: publish a withdrawn or rejected alert again, as new. */
export const republishAlert = (alert: Pick<AlertRow, "id" | "expires_at">) =>
  updateAlert(alert.id, {
    status: "approved",
    withdrawn_reason: null,
    withdrawn_at: null,
    rejection_reason: null,
    sent_at: new Date().toISOString(),
    // An end time already in the past would end it the moment it is published.
    ...(alert.expires_at && new Date(alert.expires_at).getTime() <= Date.now() ? { expires_at: null } : {}),
  });

/** MDRRMO: edit level, title and message. */
export const editAlert = (id: number, values: { level: AlertLevel; title: string; message: string }) =>
  updateAlert(id, { level: values.level, title: values.title.trim(), message: values.message.trim() });
