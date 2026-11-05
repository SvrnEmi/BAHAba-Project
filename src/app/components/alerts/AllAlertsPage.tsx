import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth";
import { ALERT_COLUMNS, EVERY_TARGET, LEVEL_FROM_COLOR, alertLifecycle, endedLifecycle, toAlertRow, useActiveAlertIds, type AlertRow, type AlertStatus, type PagasaColor } from "../../../lib/alerts";
import { errorMessage } from "../../../lib/barangayAdmin";
import { useBarangayNames } from "../../../lib/barangays";
import { CollapsibleAlertCard } from "./AlertDisclosure";

/*
 * Full list of alerts with search, filters, sort and 20-per-page pagination
 * (range()). Scope by role:
 *  - mdrrmo: every alert, any status
 *  - barangay: alerts for the admin's own barangay, any status
 *  - resident: approved alerts for the resident's barangay plus "All Barangays"
 * Row-level security applies the same limits on the server.
 */

type Role = "mdrrmo" | "barangay" | "resident";
type Sort = "newest" | "oldest" | "level" | "barangay";
type SourceFilter = "" | "barangay" | "mdrrmo" | "auto";

const PAGE_SIZE = 20;

/** Characters that would break a PostgREST or() filter. */
const cleanSearch = (text: string) => text.replace(/[,()%*\\"]/g, " ").trim();

export function AllAlertsPage({ role }: { role: Role }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [barangay, setBarangay] = useState<string | null>(role === "mdrrmo" ? "" : null);
  // Barangay names for the MDRRMO filter.
  const barangayNames = useBarangayNames(role === "mdrrmo");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [color, setColor] = useState<"" | PagasaColor>("");
  const [barangayFilter, setBarangayFilter] = useState("");
  const [source, setSource] = useState<SourceFilter>("");
  const [status, setStatus] = useState<"" | AlertStatus>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AlertRow[]>([]);
  const activeIds = useActiveAlertIds(role === "resident" ? null : role === "mdrrmo" ? EVERY_TARGET : barangay, rows);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The admin's or resident's barangay (profiles.barangay).
  useEffect(() => {
    if (role === "mdrrmo" || !userId) return;
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
  }, [role, userId]);

  // Search waits for a short pause in typing.
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(cleanSearch(searchInput)), 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  // Any filter change goes back to page 1.
  useEffect(() => setPage(1), [search, color, barangayFilter, source, status, from, to, sort]);

  const load = useCallback(async () => {
    if (barangay === null) return;
    setLoading(true);
    setError(null);
    let query = supabase.from("alerts").select(ALERT_COLUMNS, { count: "exact" });
    if (role === "resident") {
      query = query.eq("status", "approved").or(`target_barangay.eq."${barangay}",target_barangay.eq."All Barangays"`);
    } else if (role === "barangay") {
      query = query.eq("target_barangay", barangay);
    }
    if (role === "mdrrmo" && barangayFilter) query = query.eq("target_barangay", barangayFilter);
    if (role !== "resident" && status) query = query.eq("status", status);
    if (search) query = query.or(`title.ilike.%${search}%,message.ilike.%${search}%`);
    if (color) query = query.eq("level", LEVEL_FROM_COLOR[color]);
    if (source === "barangay" || source === "mdrrmo") query = query.eq("source", source);
    if (source === "auto") query = query.not("source", "in", "(barangay,mdrrmo)");
    if (from) query = query.gte("sent_at", `${from}T00:00:00+08:00`);
    if (to) query = query.lte("sent_at", `${to}T23:59:59.999+08:00`);
    // pagasa_label sorts Be Alert < Be Prepared < Take Action, so descending is Red first.
    if (sort === "level") query = query.order("pagasa_label", { ascending: false, nullsFirst: false });
    if (sort === "barangay") query = query.order("target_barangay", { ascending: true });
    query = query.order("sent_at", { ascending: sort === "oldest" });

    const start = (page - 1) * PAGE_SIZE;
    const { data, count, error: readError } = await query.range(start, start + PAGE_SIZE - 1);
    if (readError) {
      setError(errorMessage(readError, "Unable to load alerts."));
      setRows([]);
    } else {
      setRows(((data ?? []) as Record<string, unknown>[]).map(toAlertRow));
      setTotal(count ?? 0);
    }
    setNow(Date.now());
    setLoading(false);
  }, [barangay, role, barangayFilter, status, search, color, source, from, to, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const home = role === "mdrrmo" ? "/admin/mdrrmo" : role === "barangay" ? "/admin/barangay" : "/alerts";
  const anyFilter = !!(searchInput || color || barangayFilter || source || status || from || to || sort !== "newest");

  const resetFilters = () => {
    setSearchInput("");
    setColor("");
    setBarangayFilter("");
    setSource("");
    setStatus("");
    setFrom("");
    setTo("");
    setSort("newest");
  };

  return (
    <div className={`bg-background px-[18px] pt-4 pb-10 ${role === "resident" ? "min-h-full" : "min-h-screen"}`}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(home)}
            aria-label="Back"
            className="clay clay-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--primary-brand)" }}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>All alerts</h1>
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {role === "mdrrmo"
                ? "Every alert, all barangays and statuses"
                : role === "barangay"
                  ? `Alerts for ${barangay || "your barangay"}`
                  : `Published alerts for ${barangay || "your barangay"} and all barangays`}
            </p>
          </div>
        </div>

        <form className="clay space-y-3 p-4" role="search" onSubmit={(e) => e.preventDefault()} aria-label="Filter alerts">
          <label className="block">
            <span className="sr-only">Search title or message</span>
            <span className="relative block">
              <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-secondary)" }} />
              <input
                type="search"
                className="clay-input has-icon-left text-sm"
                placeholder="Search title or message"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </span>
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="clay-label">PAGASA color</span>
              <select className="clay-input text-sm" value={color} onChange={(e) => setColor(e.target.value as "" | PagasaColor)}>
                <option value="">All colors</option>
                <option value="yellow">Yellow - Be Alert</option>
                <option value="orange">Orange - Be Prepared</option>
                <option value="red">Red - Take Action</option>
              </select>
            </label>
            {role === "mdrrmo" && (
              <label className="block">
                <span className="clay-label">Barangay</span>
                <select className="clay-input text-sm" value={barangayFilter} onChange={(e) => setBarangayFilter(e.target.value)}>
                  <option value="">All barangays</option>
                  <option value="All Barangays">Sent to all barangays</option>
                  {barangayNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="clay-label">Source</span>
              <select className="clay-input text-sm" value={source} onChange={(e) => setSource(e.target.value as SourceFilter)}>
                <option value="">All sources</option>
                <option value="barangay">Barangay</option>
                <option value="mdrrmo">MDRRMO</option>
                <option value="auto">Automatic</option>
              </select>
            </label>
            {role !== "resident" && (
              <label className="block">
                <span className="clay-label">Status</span>
                <select className="clay-input text-sm" value={status} onChange={(e) => setStatus(e.target.value as "" | AlertStatus)}>
                  <option value="">All statuses</option>
                  <option value="approved">Published</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </label>
            )}
            <label className="block">
              <span className="clay-label">From</span>
              <input type="date" className="clay-input text-sm" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block">
              <span className="clay-label">To</span>
              <input type="date" className="clay-input text-sm" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="block">
              <span className="clay-label">Sort</span>
              <select className="clay-input text-sm" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="level">Level: high to low</option>
                <option value="barangay">Barangay A to Z</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs" style={{ color: "var(--text-secondary)" }} aria-live="polite">
              {loading ? "Loading..." : `${total} ${total === 1 ? "alert" : "alerts"}`}
            </p>
            <div className="flex gap-2">
              {anyFilter && (
                <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={resetFilters}>Clear filters</button>
              )}
              <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw size={16} aria-hidden="true" /> Refresh
              </button>
            </div>
          </div>
        </form>

        {error ? (
          <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
            Could not load alerts: {error}
          </p>
        ) : loading && rows.length === 0 ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="clay h-20 animate-pulse" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="clay p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No alerts match these filters.</div>
        ) : (
          <ul className="space-y-2" aria-busy={loading}>
            {rows.map((alert) => (
              <li key={alert.id}>
                <CollapsibleAlertCard alert={alert} now={now} showStatus={role !== "resident"} lifecycle={role === "resident" ? endedLifecycle(alert, now) : alertLifecycle(alert, activeIds, now)} />
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav className="flex items-center justify-between gap-2" aria-label="Pages">
            <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={16} aria-hidden="true" /> Previous
            </button>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Page {page} of {pages}</span>
            <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={16} aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
