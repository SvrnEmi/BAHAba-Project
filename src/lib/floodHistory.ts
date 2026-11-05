import { supabase } from "./supabase";
import type { WaterLevel } from "./bahaCountdown";

/** A named flood window; reports whose time falls inside it belong to it. */
export type FloodEvent = { id: number; name: string; start_at: string; end_at: string };

/** One approved report from flood_history(). Carries no reporter details. */
export type HistoryReport = {
  source: "community" | "quick";
  report_id: number;
  water_level: WaterLevel;
  lat: number;
  lng: number;
  reported_at: string;
  barangay: string | null;
  photo_bucket: string | null;
  photo_path: string | null;
};

const LEVELS: WaterLevel[] = ["ankle", "knee", "waist", "chest", "overhead"];
const asLevel = (v: unknown): WaterLevel => (LEVELS.includes(v as WaterLevel) ? (v as WaterLevel) : "ankle");

export async function fetchFloodEvents(): Promise<FloodEvent[]> {
  const { data, error } = await supabase
    .from("flood_events")
    .select("id, name, start_at, end_at")
    .order("start_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FloodEvent[];
}

/** Approved reports in the event's window, or all when eventId is null. */
export async function fetchFloodHistory(eventId: number | null): Promise<HistoryReport[]> {
  const { data, error } = await supabase.rpc("flood_history", { p_event_id: eventId });
  if (error) throw error;
  return ((data ?? []) as HistoryReport[]).map((r) => ({ ...r, water_level: asLevel(r.water_level) }));
}

/** Community photos are public URLs; quick report photos need a signed URL. */
export async function historyPhotoUrl(report: HistoryReport): Promise<string | null> {
  const path = report.photo_path;
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data, error } = await supabase.storage
    .from(report.photo_bucket ?? "quick-report-photos")
    .createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}

// MDRRMO only (enforced by RLS; created_by and the audit log are set by the database).

export async function saveFloodEvent(event: { id?: number; name: string; start: Date; end: Date }) {
  const payload = { name: event.name.trim(), start_at: event.start.toISOString(), end_at: event.end.toISOString() };
  const query = event.id
    ? supabase.from("flood_events").update(payload).eq("id", event.id).select("id")
    : supabase.from("flood_events").insert(payload).select("id");
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) throw new Error("Not permitted.");
}

export async function deleteFloodEvent(id: number) {
  const { data, error } = await supabase.from("flood_events").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Not permitted.");
}

const manilaDay = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
const manilaDayTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const formatDay = (v: string) => manilaDay.format(new Date(v));
export const formatDayTime = (v: string) => manilaDayTime.format(new Date(v));
export function eventRange(e: FloodEvent) {
  const start = formatDay(e.start_at);
  const end = formatDay(e.end_at);
  return start === end ? start : `${start} - ${end}`;
}
