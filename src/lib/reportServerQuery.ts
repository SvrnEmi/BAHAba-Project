import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { WATER_LEVEL_ORDER, pageSlices } from "./reportQuery";

/*
 * Server-side search, status filter, sort and paging for the MDRRMO
 * Community Reports list. Search is ilike on description, location,
 * user_name and barangay. Water level and status sort in a fixed order
 * (not alphabetically) by reading each value's rows in turn with range().
 */

export const REPORT_PAGE_SIZE = 20;

export const SERVER_REPORT_COLUMNS =
  "id, user_name, location, lat, lng, water_level, description, photo_path, status, timestamp, rejection_reason, approval_reason, user_id, admin_reply, admin_reply_at, barangay";

export type ServerReportSort = "newest" | "oldest" | "water_desc" | "water_asc" | "barangay" | "status";

export const SERVER_REPORT_SORT_OPTIONS: Array<{ value: ServerReportSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "water_desc", label: "Water level (deepest first)" },
  { value: "water_asc", label: "Water level (shallowest first)" },
  { value: "barangay", label: "Barangay A to Z" },
  { value: "status", label: "Status" },
];

export type ReportStatusFilter = "all" | "pending" | "approved" | "rejected";

/** "verified" is the old name for approved. */
const STATUS_VALUES: Record<Exclude<ReportStatusFilter, "all">, string[]> = {
  pending: ["pending"],
  approved: ["approved", "verified"],
  rejected: ["rejected"],
};

export type ReportCounts = Record<ReportStatusFilter, number>;

/** Commas, brackets, quotes and wildcards would break the PostgREST or() filter. */
export const cleanReportSearch = (text: string) => text.replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim();

/** Bucket = rows whose column is one of values, or none of the known values (other). */
type Bucket = { values: string[] } | { otherThan: string[] };

function bucketsFor(sort: ServerReportSort): { column: string; buckets: Bucket[] } | null {
  if (sort === "water_desc" || sort === "water_asc") {
    const order = sort === "water_asc" ? WATER_LEVEL_ORDER : [...WATER_LEVEL_ORDER].reverse();
    return { column: "water_level", buckets: [...order.map((v) => ({ values: [v] })), { otherThan: WATER_LEVEL_ORDER }] };
  }
  if (sort === "status") {
    const groups = [STATUS_VALUES.pending, STATUS_VALUES.approved, STATUS_VALUES.rejected];
    return { column: "status", buckets: [...groups.map((values) => ({ values })), { otherThan: groups.flat() }] };
  }
  return null;
}

type Params = { search: string; status: ReportStatusFilter; sort: ServerReportSort; page: number };

function filtered(query: any, search: string, status: ReportStatusFilter) {
  let q = query;
  if (status !== "all") q = q.in("status", STATUS_VALUES[status]);
  if (search) {
    const p = `%${search}%`;
    q = q.or(`description.ilike.${p},location.ilike.${p},user_name.ilike.${p},barangay.ilike.${p}`);
  }
  return q;
}

function inBucket(query: any, column: string, bucket: Bucket) {
  return "values" in bucket
    ? query.in(column, bucket.values)
    : query.not(column, "in", `(${bucket.otherThan.join(",")})`);
}

const countOf = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
};

const head = () => supabase.from("community_reports").select("id", { count: "exact", head: true });

/** Counts per status chip for the current search (all statuses). */
async function fetchCounts(search: string): Promise<ReportCounts> {
  const [all, pending, approved, rejected] = await Promise.all(
    (["all", "pending", "approved", "rejected"] as const).map((s) => countOf(filtered(head(), search, s))),
  );
  return { all, pending, approved, rejected };
}

/** One page of rows (in sort order) for the search and status filter. */
async function fetchRows<T>({ search, status, sort, page }: Params): Promise<T[]> {
  const from = (page - 1) * REPORT_PAGE_SIZE;
  const to = from + REPORT_PAGE_SIZE - 1;
  const rows = () => filtered(supabase.from("community_reports").select(SERVER_REPORT_COLUMNS), search, status);

  const bucketed = bucketsFor(sort);
  if (!bucketed) {
    let q = rows();
    if (sort === "barangay") q = q.order("barangay", { ascending: true, nullsFirst: false });
    const { data, error } = await q.order("timestamp", { ascending: sort === "oldest" }).range(from, to);
    if (error) throw error;
    return (data ?? []) as T[];
  }

  const { column, buckets } = bucketed;
  const counts = await Promise.all(buckets.map((b) => countOf(inBucket(filtered(head(), search, status), column, b))));
  const parts = await Promise.all(
    pageSlices(counts, from, to).map(async (slice) => {
      const { data, error } = await inBucket(rows(), column, buckets[slice.bucket])
        .order("timestamp", { ascending: false })
        .range(slice.from, slice.to);
      if (error) throw error;
      return (data ?? []) as T[];
    }),
  );
  return parts.flat();
}

/**
 * Loads the page for [params] and reloads it (keeping search, sort and page)
 * whenever [refreshKey] changes, e.g. after a realtime insert, update or delete.
 */
export function useReportPage<T>(params: Params, refreshKey: unknown) {
  const [rows, setRows] = useState<T[]>([]);
  const [counts, setCounts] = useState<ReportCounts>({ all: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const { search, status, sort, page } = params;
  const lastKeyRef = useRef("");

  useEffect(() => {
    const request = ++requestRef.current;
    const load = async () => {
      setLoading(true);
      try {
        const [nextRows, nextCounts] = await Promise.all([fetchRows<T>({ search, status, sort, page }), fetchCounts(search)]);
        if (request !== requestRef.current) return;
        setRows(nextRows);
        setCounts(nextCounts);
        setError(null);
      } catch (e) {
        if (request !== requestRef.current) return;
        setError(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Unable to load reports.");
      }
      setLoading(false);
    };
    // A new search, filter, sort or page loads now; realtime bursts reload once.
    const key = `${search}|${status}|${sort}|${page}`;
    const delay = key === lastKeyRef.current ? 250 : 0;
    lastKeyRef.current = key;
    const id = window.setTimeout(() => void load(), delay);
    return () => window.clearTimeout(id);
  }, [search, status, sort, page, refreshKey]);

  return { rows, counts, loading, error };
}
