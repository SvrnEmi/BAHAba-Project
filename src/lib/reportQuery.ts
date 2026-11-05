/*
 * Search and sort for report lists and message threads. Runs in the browser
 * on rows already loaded by each screen (no extra queries).
 */

export type ReportSort = "newest" | "oldest" | "water" | "barangay" | "messages";

export const REPORT_SORT_OPTIONS: Array<{ value: ReportSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "water", label: "Water level: highest first" },
  { value: "barangay", label: "Barangay A to Z" },
  { value: "messages", label: "Latest message first" },
];

const WATER_RANK: Record<string, number> = { ankle: 1, knee: 2, waist: 3, chest: 4, overhead: 5 };

/** Shallowest to deepest (water_level values). */
export const WATER_LEVEL_ORDER = ["ankle", "knee", "waist", "chest", "overhead"];

/**
 * Splits rows [from, to] (0-based, inclusive) of a list made of buckets
 * laid end to end (bucket i holds counts[i] rows) into per-bucket ranges,
 * so a custom sort order can still be paged with range() per bucket.
 */
export function pageSlices(counts: number[], from: number, to: number): Array<{ bucket: number; from: number; to: number }> {
  const slices: Array<{ bucket: number; from: number; to: number }> = [];
  let start = 0;
  counts.forEach((n, bucket) => {
    const a = Math.max(from, start);
    const b = Math.min(to, start + n - 1);
    if (n > 0 && a <= b) slices.push({ bucket, from: a - start, to: b - start });
    start += n;
  });
  return slices;
}

type QueryableReport = {
  id: number;
  timestamp: string;
  location?: string | null;
  description?: string | null;
  user_name?: string | null;
  barangay?: string | null;
  water_level?: string | null;
};

const time = (iso: string | null | undefined) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/** Case-insensitive; every word must appear somewhere in the given fields. */
export function matchesQuery(query: string, fields: Array<string | null | undefined>): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/**
 * Filters by [query] (location, description, reporter, barangay, report #)
 * and sorts. "messages" sorts by the latest message time from
 * [latestMessageAt]; reports without messages go last, newest first.
 */
export function queryReports<T extends QueryableReport>(
  reports: T[],
  query: string,
  sort: ReportSort,
  latestMessageAt?: (id: number) => string | null | undefined,
): T[] {
  const found = reports.filter((r) =>
    matchesQuery(query, [r.location, r.description, r.user_name, r.barangay, r.water_level, `#${r.id}`]),
  );
  const newest = (a: T, b: T) => time(b.timestamp) - time(a.timestamp);
  const compare: Record<ReportSort, (a: T, b: T) => number> = {
    newest,
    oldest: (a, b) => -newest(a, b),
    water: (a, b) => (WATER_RANK[b.water_level ?? ""] ?? 0) - (WATER_RANK[a.water_level ?? ""] ?? 0) || newest(a, b),
    barangay: (a, b) => (a.barangay ?? "￿").localeCompare(b.barangay ?? "￿") || newest(a, b),
    messages: (a, b) => time(latestMessageAt?.(b.id)) - time(latestMessageAt?.(a.id)) || newest(a, b),
  };
  return [...found].sort(compare[sort]);
}
