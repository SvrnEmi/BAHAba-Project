/*
 * Rules for the barangay "All reports" list (the view public.all_reports).
 * No Supabase here, so tests can import it. The state lives in the URL, so
 * Refresh and the browser Back button keep the same list.
 */

export const ALL_REPORTS_PAGE = 25;

export const ALL_REPORT_COLUMNS =
  "kind, id, source, barangay, location, lat, lng, water_level, description, status, reported_at, reporter_name, photo_path, photo_bucket, rejection_reason";

export type AllReportRow = {
  kind: "community" | "quick";
  id: number;
  source: string | null;
  barangay: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  water_level: string | null;
  description: string | null;
  status: string | null;
  reported_at: string | null;
  reporter_name: string | null;
  photo_path: string | null;
  photo_bucket: string | null;
  rejection_reason: string | null;
};

export const SOURCE_OPTIONS = [
  { id: "all", label: "All" },
  { id: "resident", label: "Residents" },
  { id: "mdrrmo", label: "MDRRMO" },
  { id: "guest", label: "Guests" },
] as const;

export const STATUS_OPTIONS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;

export const LEVEL_OPTIONS = [
  { id: "all", label: "All" },
  { id: "ankle", label: "Ankle" },
  { id: "knee", label: "Knee" },
  { id: "waist", label: "Waist" },
  { id: "chest", label: "Chest" },
  { id: "overhead", label: "Over head" },
] as const;

export const DATE_OPTIONS = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "custom", label: "Custom range" },
] as const;

export const SORT_OPTIONS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "highest", label: "Highest water level first" },
  { id: "lowest", label: "Lowest water level first" },
  { id: "status", label: "Status (Pending first)" },
] as const;

type Ids<T extends ReadonlyArray<{ id: string }>> = T[number]["id"];

export type AllReportsView = {
  q: string;
  source: Ids<typeof SOURCE_OPTIONS>;
  status: Ids<typeof STATUS_OPTIONS>;
  level: Ids<typeof LEVEL_OPTIONS>;
  date: Ids<typeof DATE_OPTIONS>;
  from: string;
  to: string;
  sort: Ids<typeof SORT_OPTIONS>;
  page: number;
};

export const DEFAULT_VIEW: AllReportsView = { q: "", source: "all", status: "all", level: "all", date: "all", from: "", to: "", sort: "newest", page: 1 };

const pick = <T extends ReadonlyArray<{ id: string }>>(options: T, value: string | null, fallback: Ids<T>): Ids<T> =>
  options.some((o) => o.id === value) ? (value as Ids<T>) : fallback;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (value: string | null) => (value && DAY.test(value) ? value : "");

/** Anything unknown in the URL falls back to the default. */
export function readView(params: URLSearchParams): AllReportsView {
  const page = Number(params.get("page"));
  return {
    q: params.get("q") ?? "",
    source: pick(SOURCE_OPTIONS, params.get("source"), "all"),
    status: pick(STATUS_OPTIONS, params.get("status"), "all"),
    level: pick(LEVEL_OPTIONS, params.get("level"), "all"),
    date: pick(DATE_OPTIONS, params.get("date"), "all"),
    from: day(params.get("from")),
    to: day(params.get("to")),
    sort: pick(SORT_OPTIONS, params.get("sort"), "newest"),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The params with this view written in; defaults are left out and other params are kept. */
export function writeView(params: URLSearchParams, view: AllReportsView): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of Object.keys(DEFAULT_VIEW) as Array<keyof AllReportsView>) {
    const value = view[key];
    if (value === DEFAULT_VIEW[key] || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

export const hasFilters = (view: AllReportsView) =>
  view.source !== "all" || view.status !== "all" || view.level !== "all" || view.date !== "all";

/*
 * Search text for an ilike inside or(). The value goes in double quotes, so
 * commas and parentheses are plain text there. % and _ are escaped for LIKE.
 * PostgREST turns every * into %, with no way to escape it, so a typed * becomes
 * _, which matches that one character.
 */
export function searchFilter(text: string): string {
  const like = text
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "_");
  const quoted = `*${like}*`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return ["location", "description", "reporter_name"].map((column) => `${column}.ilike."${quoted}"`).join(",");
}

const manilaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const startOfDay = (date: string) => new Date(`${date}T00:00:00+08:00`).getTime();
const DAY_MS = 86_400_000;

/** Bounds on reported_at: `from` is included, `before` is not. Days follow the Manila calendar. */
export function dateBounds(view: Pick<AllReportsView, "date" | "from" | "to">, now: number): { from?: string; before?: string } {
  const iso = (t: number) => new Date(t).toISOString();
  if (view.date === "today") return { from: iso(startOfDay(manilaDay.format(now))) };
  if (view.date === "7d") return { from: iso(now - 7 * DAY_MS) };
  if (view.date === "30d") return { from: iso(now - 30 * DAY_MS) };
  if (view.date === "custom") {
    return {
      ...(view.from ? { from: iso(startOfDay(view.from)) } : {}),
      ...(view.to ? { before: iso(startOfDay(view.to) + DAY_MS) } : {}),
    };
  }
  return {};
}

const LEVEL_RANK: Record<string, number> = { ankle: 1, knee: 2, waist: 3, chest: 4, overhead: 5 };
const STATUS_RANK: Record<string, number> = { pending: 0, approved: 1, verified: 1, rejected: 2 };

/** Sorts the rows already loaded (the server order is kept for ties); rows without a value go last. */
export function sortLoaded<T extends Pick<AllReportRow, "water_level" | "status">>(rows: T[], sort: AllReportsView["sort"]): T[] {
  const level = (row: T) => LEVEL_RANK[row.water_level ?? ""];
  if (sort === "highest") return [...rows].sort((a, b) => (level(b) ?? 0) - (level(a) ?? 0));
  if (sort === "lowest") return [...rows].sort((a, b) => (level(a) ?? 99) - (level(b) ?? 99));
  if (sort === "status") return [...rows].sort((a, b) => (STATUS_RANK[a.status ?? ""] ?? 3) - (STATUS_RANK[b.status ?? ""] ?? 3));
  return rows;
}

const SOURCE_LABELS: Record<string, string> = { resident: "Resident", mdrrmo: "MDRRMO", guest: "Guest (Quick Report)" };
export const sourceLabel = (source: string | null) => SOURCE_LABELS[source ?? ""] ?? "Unknown (older report)";
