import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, CloudRain, Loader, RefreshCw } from "lucide-react";
import { Bar, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { Toaster, toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { asRiskLevel, riskSourceLabel, runFloodRiskUpdate, type RiskLevel } from "../../lib/floodRisk";
import { subscribeToTable } from "../../lib/realtime";
import { RiskBadge } from "./clay/Clay";

/*
 * MDRRMO "Rainfall forecast" panel. Reads barangays (current + forecast risk,
 * rain totals), rainfall_forecast (hourly, next 48 h) and risk_settings (id=1).
 * Live updates come from the shared barangays realtime channel; no polling.
 */

type BarangayRow = {
  id: number;
  name: string;
  flood_risk: RiskLevel | null;
  risk_source: string | null;
  forecast_6h: RiskLevel | null;
  forecast_12h: RiskLevel | null;
  forecast_24h: RiskLevel | null;
  rain_past_24h: number | null;
  rain_next_3h: number | null;
  rain_next_24h: number | null;
  peak_rain_mm_h: number | null;
  peak_rain_at: string | null;
  auto_updated_at: string | null;
};

type ForecastRow = { barangay_id: number; hour: string; precip_mm: number | null; precip_prob: number | null; is_simulated: boolean };

type RiskSettings = { medium_mm_3h: number | null; high_mm_3h: number | null; medium_mm_24h: number | null; high_mm_24h: number | null };

type HourPoint = { t: number; mm: number; prob: number | null; simulated: boolean };

const BARANGAY_COLUMNS =
  "id, name, flood_risk, risk_source, forecast_6h, forecast_12h, forecast_24h, rain_past_24h, rain_next_3h, rain_next_24h, peak_rain_mm_h, peak_rain_at, auto_updated_at";
const PAGE_SIZE = 1000; // PostgREST's default max rows per response.
const HOUR_MS = 60 * 60 * 1000;
const ALL = "all";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toBarangay = (row: Record<string, unknown>): BarangayRow => ({
  id: Number(row.id),
  name: String(row.name ?? "Unknown"),
  flood_risk: asRiskLevel(row.flood_risk),
  risk_source: typeof row.risk_source === "string" ? row.risk_source : null,
  forecast_6h: asRiskLevel(row.forecast_6h),
  forecast_12h: asRiskLevel(row.forecast_12h),
  forecast_24h: asRiskLevel(row.forecast_24h),
  rain_past_24h: num(row.rain_past_24h),
  rain_next_3h: num(row.rain_next_3h),
  rain_next_24h: num(row.rain_next_24h),
  peak_rain_mm_h: num(row.peak_rain_mm_h),
  peak_rain_at: typeof row.peak_rain_at === "string" ? row.peak_rain_at : null,
  auto_updated_at: typeof row.auto_updated_at === "string" ? row.auto_updated_at : null,
});

const RISK_RANK: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };
const rank = (risk: RiskLevel | null) => (risk ? RISK_RANK[risk] : 0);
const worst = (levels: Array<RiskLevel | null>): RiskLevel | null =>
  levels.reduce<RiskLevel | null>((acc, level) => (rank(level) > rank(acc) ? level : acc), null);

const HORIZONS = [
  { key: "flood_risk", label: "Now" },
  { key: "forecast_6h", label: "+6 h" },
  { key: "forecast_12h", label: "+12 h" },
  { key: "forecast_24h", label: "+24 h" },
] as const;
type HorizonKey = (typeof HORIZONS)[number]["key"];

/** Hourly intensity bands (mm/h). */
const INTENSITY = [
  { label: "Light", range: "< 2.5 mm/h", color: "#8FA9C4", max: 2.5 },
  { label: "Moderate", range: "2.5-7.5 mm/h", color: "#3B82C4", max: 7.5 },
  { label: "Heavy", range: "7.5-15 mm/h", color: "#D98E04", max: 15 },
  { label: "Intense", range: "> 15 mm/h", color: "#C0392B", max: Infinity },
] as const;
const intensityOf = (mm: number) => INTENSITY.find((band) => (band.max === 15 ? mm <= 15 : mm < band.max)) ?? INTENSITY[3];

const fmtMm = (value: number | null, digits = 1) => (value == null ? "--" : value.toFixed(digits));
const hourLabel = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric" });

function relativeTime(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
  return new Date(iso).toLocaleDateString();
}

function peakTimeLabel(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const sameDay = date.toDateString() === new Date(now).toDateString();
  const day = sameDay ? "" : ` ${date.toLocaleDateString([], { weekday: "short" })}`;
  return `around ${hourLabel(date.getTime())}${day}`;
}

async function loadForecastRows(): Promise<ForecastRow[]> {
  const rows: ForecastRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("rainfall_forecast")
      .select("barangay_id, hour, precip_mm, precip_prob, is_simulated")
      .order("hour", { ascending: true })
      .order("barangay_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as Record<string, unknown>[];
    for (const r of page) {
      rows.push({
        barangay_id: Number(r.barangay_id),
        hour: String(r.hour),
        precip_mm: num(r.precip_mm),
        precip_prob: num(r.precip_prob),
        is_simulated: r.is_simulated === true,
      });
    }
    if (page.length < PAGE_SIZE) return rows;
  }
}

type SortKey = "name" | HorizonKey | "rain_next_24h" | "source";
type Sort = { key: SortKey; dir: "asc" | "desc" } | null;

export function RainfallForecastPanel() {
  const [expanded, setExpanded] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 768px)").matches,
  );
  const [barangays, setBarangays] = useState<BarangayRow[]>([]);
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [settings, setSettings] = useState<RiskSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string>(ALL);
  const [sort, setSort] = useState<Sort>(null);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);
  const barangaysRef = useRef<BarangayRow[]>([]);
  barangaysRef.current = barangays;

  // Clock for "Updated x min ago" and the Now marker (no data requests).
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [barangayRes, forecastRows, settingsRes] = await Promise.all([
        supabase.from("barangays").select(BARANGAY_COLUMNS).order("name"),
        loadForecastRows(),
        supabase.from("risk_settings").select("medium_mm_3h, high_mm_3h, medium_mm_24h, high_mm_24h").eq("id", 1).maybeSingle(),
      ]);
      if (barangayRes.error) throw barangayRes.error;
      if (!mounted.current) return;
      setBarangays(((barangayRes.data ?? []) as Record<string, unknown>[]).map(toBarangay));
      setForecast(forecastRows);
      const s = settingsRes.data as Record<string, unknown> | null;
      setSettings(
        s
          ? { medium_mm_3h: num(s.medium_mm_3h), high_mm_3h: num(s.high_mm_3h), medium_mm_24h: num(s.medium_mm_24h), high_mm_24h: num(s.high_mm_24h) }
          : null,
      );
      setNow(Date.now());
    } catch (err) {
      if (!mounted.current) return;
      setLoadError(err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let reloadTimer: number | undefined;
    void load();

    // One barangays channel (shared, removed with removeChannel on cleanup).
    const unsubscribe = subscribeToTable("barangays", (payload) => {
      if (cancelled || payload.eventType !== "UPDATE") return;
      const next = toBarangay(payload.new as Record<string, unknown>);
      const previous = barangaysRef.current.find((row) => row.id === next.id);
      const forecastChanged = !!previous && previous.auto_updated_at !== next.auto_updated_at;
      setBarangays((current) => current.map((row) => (row.id === next.id ? { ...row, ...next } : row)));
      // A new automated run also rewrote rainfall_forecast: re-read it once the burst of row updates settles.
      if (forecastChanged || next.risk_source === "simulation") {
        window.clearTimeout(reloadTimer);
        reloadTimer = window.setTimeout(() => {
          if (cancelled) return;
          void loadForecastRows()
            .then((rows) => !cancelled && setForecast(rows))
            .catch((err) => console.error("Unable to reload rainfall forecast:", err));
        }, 2000);
      }
    });

    return () => {
      cancelled = true;
      mounted.current = false;
      window.clearTimeout(reloadTimer);
      unsubscribe();
    };
  }, [load]);

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      await runFloodRiskUpdate();
      await load();
      toast.success("Rainfall forecast refreshed.");
    } catch (err) {
      toast.error(`Refresh failed: ${err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err)}`);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  };

  const selectedRow = selected === ALL ? null : barangays.find((b) => String(b.id) === selected) ?? null;
  const scope = selectedRow ? [selectedRow] : barangays;

  // Hourly series: the selected barangay, or the highest value per hour across all.
  const hours = useMemo<HourPoint[]>(() => {
    const byHour = new Map<number, HourPoint>();
    for (const row of forecast) {
      if (selectedRow && row.barangay_id !== selectedRow.id) continue;
      const t = new Date(row.hour).getTime();
      if (Number.isNaN(t)) continue;
      const point = byHour.get(t) ?? { t, mm: 0, prob: null, simulated: false };
      point.mm = Math.max(point.mm, row.precip_mm ?? 0);
      if (row.precip_prob != null) point.prob = Math.max(point.prob ?? 0, row.precip_prob);
      point.simulated ||= row.is_simulated;
      byHour.set(t, point);
    }
    return [...byHour.values()].sort((a, b) => a.t - b.t);
  }, [forecast, selectedRow]);

  const simulationActive = forecast.some((row) => row.is_simulated);
  const nowHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const nowPoint = hours.find((h) => h.t === nowHour);

  const maxOf = (pick: (b: BarangayRow) => number | null) =>
    scope.reduce<number | null>((acc, b) => {
      const v = pick(b);
      return v == null ? acc : acc == null ? v : Math.max(acc, v);
    }, null);

  const peakRow = scope.reduce<BarangayRow | null>(
    (acc, b) => (b.peak_rain_mm_h != null && (acc?.peak_rain_mm_h == null || b.peak_rain_mm_h > acc.peak_rain_mm_h) ? b : acc),
    null,
  );
  const maxChance24h = hours
    .filter((h) => h.t >= nowHour && h.t < now + 24 * HOUR_MS && h.prob != null)
    .reduce<number | null>((acc, h) => Math.max(acc ?? 0, h.prob ?? 0), null);

  const updatedAt = scope.reduce<string | null>(
    (acc, b) => (b.auto_updated_at && (!acc || b.auto_updated_at > acc) ? b.auto_updated_at : acc),
    null,
  );

  const sortedRows = useMemo(() => {
    const rows = [...barangays];
    const highest = (b: BarangayRow) => Math.max(...HORIZONS.map((h) => rank(b[h.key])));
    if (!sort) {
      return rows.sort((a, b) => highest(b) - highest(a) || (b.rain_next_24h ?? -1) - (a.rain_next_24h ?? -1) || a.name.localeCompare(b.name));
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      let diff: number;
      if (sort.key === "name") diff = a.name.localeCompare(b.name);
      else if (sort.key === "source") diff = (riskSourceLabel(a.risk_source) ?? "").localeCompare(riskSourceLabel(b.risk_source) ?? "");
      else if (sort.key === "rain_next_24h") diff = (a.rain_next_24h ?? -1) - (b.rain_next_24h ?? -1);
      else diff = rank(a[sort.key]) - rank(b[sort.key]);
      return diff * dir || a.name.localeCompare(b.name);
    });
  }, [barangays, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current?.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "source" ? "asc" : "desc" },
    );

  const hasForecast = hours.length > 0 || barangays.some((b) => b.auto_updated_at || b.rain_next_24h != null);
  const updatedLabel = relativeTime(updatedAt, now);

  return (
    <section className="clay p-5" aria-labelledby="rainfall-forecast-title">
      <Toaster position="top-center" richColors />

      {/* 1. Header */}
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--lavender)" }}>
          <CloudRain size={20} style={{ color: "var(--lavender-icon)" }} aria-hidden="true" />
        </span>
        <div className="min-w-[12rem] flex-1">
          <h3 id="rainfall-forecast-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            Rainfall forecast - Odiongan
          </h3>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {updatedLabel ? `Updated ${updatedLabel}` : "Not yet updated"} - refreshes automatically every 30 minutes
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshNow()}
            disabled={refreshing || loading}
            className="clay-btn clay-btn-secondary"
            style={{ minHeight: 44, paddingInline: 14 }}
          >
            {refreshing ? <Loader size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            {refreshing ? "Refreshing..." : "Refresh now"}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="rainfall-forecast-body"
            aria-label={expanded ? "Collapse rainfall forecast" : "Expand rainfall forecast"}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ color: "var(--text-secondary)" }}
          >
            <ChevronDown size={20} aria-hidden="true" style={{ transform: expanded ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
          </button>
        </div>
      </div>

      {expanded && (
        <div id="rainfall-forecast-body" className="mt-4 space-y-5">
          {loading ? (
            <LoadingSkeleton />
          ) : loadError ? (
            <div role="alert" className="flat-alert" style={{ "--alert-color": "var(--risk-high)" } as CSSProperties}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Unable to load the rainfall forecast.</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>{loadError}</p>
              <button type="button" onClick={() => { setLoading(true); void load(); }} className="clay-btn clay-btn-secondary mt-3" style={{ minHeight: 44 }}>
                <RefreshCw size={16} aria-hidden="true" /> Try again
              </button>
            </div>
          ) : !hasForecast ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              No forecast yet - press Refresh now
            </p>
          ) : (
            <>
              {/* 3. Barangay selector */}
              <label className="block max-w-xs">
                <span className="clay-label">Barangay</span>
                <select value={selected} onChange={(e) => setSelected(e.target.value)} className="clay-input text-sm">
                  <option value={ALL}>All barangays</option>
                  {barangays.map((b) => (
                    <option key={b.id} value={String(b.id)}>{b.name}</option>
                  ))}
                </select>
              </label>

              {/* 2. Summary tiles */}
              <div>
                {!selectedRow && (
                  <p className="mb-2 text-xs" style={{ color: "var(--text-secondary)" }}>Highest value across all barangays</p>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <Tile label="Past 24 h" value={fmtMm(maxOf((b) => b.rain_past_24h))} unit="mm" />
                  <Tile label="Next 3 h" value={fmtMm(maxOf((b) => b.rain_next_3h))} unit="mm" />
                  <Tile label="Next 24 h" value={fmtMm(maxOf((b) => b.rain_next_24h))} unit="mm" />
                  <Tile
                    label="Peak rate"
                    value={fmtMm(peakRow?.peak_rain_mm_h ?? null)}
                    unit="mm/h"
                    note={peakTimeLabel(peakRow?.peak_rain_at ?? null, now) ?? undefined}
                  />
                  <Tile label="Highest rain chance (24 h)" value={maxChance24h == null ? "--" : String(Math.round(maxChance24h))} unit="%" />
                </div>
              </div>

              {/* 5. Risk outlook strip */}
              <div>
                <p className="mb-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Flood risk outlook{selectedRow ? ` - ${selectedRow.name}` : " - worst across all barangays"}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {HORIZONS.map((h) => (
                    <div key={h.key} className="flex flex-col items-start gap-1">
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{h.label}</span>
                      <RiskBadge risk={worst(scope.map((b) => b[h.key]))} compact />
                    </div>
                  ))}
                </div>
              </div>

              {/* 8. Simulation banner */}
              {simulationActive && (
                <div role="status" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "#FDF1DC", border: "1px solid #D98E04", color: "var(--risk-medium-text)" }}>
                  <AlertTriangle size={18} aria-hidden="true" />
                  Demo simulation is active
                </div>
              )}

              {/* 4. 48-hour chart */}
              <HourlyChart hours={hours} nowHour={nowPoint ? nowHour : null} />

              {/* 6. Barangay table */}
              <BarangayTable rows={sortedRows} sort={sort} onSort={toggleSort} selected={selected} onSelect={setSelected} />

              {/* 7. Thresholds + how it works */}
              <ThresholdsNote settings={settings} />
            </>
          )}
          {/* Demo tools (Simulate rainfall) live in Settings > System and demo tools. */}
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, unit, note }: { label: string; value: string; unit: string; note?: string }) {
  return (
    <div className="rounded-xl border bg-white p-3" style={{ borderColor: "var(--border)" }}>
      <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <p className="mt-1 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
        {value}
        {value !== "--" && <span className="ml-1 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{unit}</span>}
      </p>
      {note && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{note}</p>}
    </div>
  );
}

function LoadingSkeleton() {
  const block = (className: string) => <div className={`animate-pulse rounded-xl ${className}`} style={{ background: "var(--border)" }} />;
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading rainfall forecast">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => <div key={i}>{block("h-20")}</div>)}
      </div>
      {block("h-8 w-2/3")}
      {block("h-64")}
      {block("h-40")}
    </div>
  );
}

function HourlyChart({ hours, nowHour }: { hours: HourPoint[]; nowHour: number | null }) {
  if (hours.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
        No hourly forecast for this selection yet - press Refresh now
      </p>
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Hourly rainfall (mm) and chance of rain (%), next 48 h</p>
      <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
        <div style={{ minWidth: Math.max(720, hours.length * 18), height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={hours} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
              <XAxis
                dataKey="t"
                tickFormatter={(t: number) => hourLabel(t)}
                interval={2}
                tick={{ fontSize: 11, fill: "#55657a" }}
              />
              <YAxis yAxisId="mm" tick={{ fontSize: 11, fill: "#55657a" }} width={40} label={{ value: "mm", angle: -90, position: "insideLeft", fontSize: 11, fill: "#55657a" }} />
              <YAxis yAxisId="prob" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: "#55657a" }} width={36} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip content={<HourTooltip />} cursor={{ fill: "rgba(59,130,196,0.08)" }} />
              <Bar yAxisId="mm" dataKey="mm" name="Rain (mm)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {hours.map((h) => (
                  <Cell key={h.t} fill={intensityOf(h.mm).color} />
                ))}
              </Bar>
              <Line yAxisId="prob" dataKey="prob" name="Chance of rain (%)" type="monotone" stroke="#4c3fa8" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              {nowHour != null && (
                <ReferenceLine yAxisId="mm" x={nowHour} stroke="#1e2a38" strokeDasharray="4 3" label={{ value: "Now", position: "top", fontSize: 11, fill: "#1e2a38" }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-secondary)" }} aria-label="Chart legend">
        {INTENSITY.map((band) => (
          <li key={band.label} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: band.color }} aria-hidden="true" />
            {band.label} ({band.range})
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: "#4c3fa8" }} aria-hidden="true" />
          Chance of rain (%)
        </li>
      </ul>
    </div>
  );
}

function HourTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as HourPoint;
  const date = new Date(point.t);
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
      <p className="font-semibold">
        {date.toLocaleDateString([], { weekday: "short" })} {hourLabel(point.t)}
      </p>
      <p>{point.mm.toFixed(1)} mm</p>
      <p>{point.prob == null ? "Chance unavailable" : `${Math.round(point.prob)}% chance`}</p>
      <p>{point.mm > 0 ? intensityOf(point.mm).label : "No rain"}</p>
      {point.simulated && <p style={{ color: "var(--risk-medium-text)" }}>Demo simulation</p>}
    </div>
  );
}

function BarangayTable({
  rows,
  sort,
  onSort,
  selected,
  onSelect,
}: {
  rows: BarangayRow[];
  sort: Sort;
  onSort: (key: SortKey) => void;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const header = (key: SortKey, label: ReactNode) => {
    const active = sort?.key === key;
    return (
      <th scope="col" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"} className="px-3 py-2 text-left font-semibold">
        <button type="button" onClick={() => onSort(key)} className="inline-flex min-h-10 items-center gap-1 whitespace-nowrap text-xs font-semibold">
          {label}
          <span aria-hidden="true">{active ? (sort!.dir === "asc" ? "▲" : "▼") : ""}</span>
        </button>
      </th>
    );
  };
  const select = (row: BarangayRow) => onSelect(selected === String(row.id) ? ALL : String(row.id));
  const onKey = (event: KeyboardEvent, row: BarangayRow) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(row);
    }
  };

  return (
    <div>
      <p className="mb-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        {sort ? "Click a column to sort." : "Sorted by highest risk, then next-24 h rain. Click a column to sort."} Click a row to show it in the chart.
      </p>
      <div className="overflow-x-auto rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm" style={{ color: "var(--text-primary)" }}>
          <thead style={{ background: "#f4f7fb", color: "var(--text-secondary)" }}>
            <tr>
              {header("name", "Barangay")}
              {header("flood_risk", "Now")}
              {header("forecast_6h", "+6 h")}
              {header("forecast_12h", "+12 h")}
              {header("forecast_24h", "+24 h")}
              {header("rain_next_24h", "Next 24 h mm")}
              {header("source", "Source")}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = selected === String(row.id);
              return (
                <tr
                  key={row.id}
                  tabIndex={0}
                  aria-selected={isSelected}
                  onClick={() => select(row)}
                  onKeyDown={(e) => onKey(e, row)}
                  className="cursor-pointer border-t hover:bg-blue-50"
                  style={{ borderColor: "var(--border)", background: isSelected ? "#e8f1fb" : undefined }}
                >
                  <td className="px-3 py-2 font-semibold whitespace-nowrap">{row.name}</td>
                  {HORIZONS.map((h) => (
                    <td key={h.key} className="px-3 py-2"><RiskBadge risk={row[h.key]} compact /></td>
                  ))}
                  <td className="px-3 py-2 tabular-nums">{fmtMm(row.rain_next_24h)}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{riskSourceLabel(row.risk_source) ?? "--"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ThresholdsNote({ settings }: { settings: RiskSettings | null }) {
  const v = (n: number | null | undefined) => (n == null ? "?" : String(n));
  return (
    <div className="space-y-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
      <p>
        {settings
          ? `High risk when rain reaches ${v(settings.high_mm_3h)} mm in 3 h or ${v(settings.high_mm_24h)} mm in 24 h; medium at ${v(settings.medium_mm_3h)} mm / ${v(settings.medium_mm_24h)} mm.`
          : "Risk thresholds are not available."}
      </p>
      <details>
        <summary className="inline-flex min-h-10 cursor-pointer items-center font-semibold" style={{ color: "var(--primary-shade)" }}>
          How this works
        </summary>
        <p className="mt-1">
          Forecasts come from Open-Meteo weather models and are estimates, not guarantees. Nearby barangays can show similar
          numbers because the model resolution is several kilometers.
        </p>
      </details>
    </div>
  );
}
