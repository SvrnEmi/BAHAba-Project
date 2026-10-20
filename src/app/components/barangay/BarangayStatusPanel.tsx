import { useState, type CSSProperties } from "react";
import { AlertTriangle, ArrowRight, CloudRain, Loader, RefreshCw, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { supabase } from "../../../lib/supabase";
import { asRiskLevel, type RiskLevel } from "../../../lib/floodRisk";
import { errorMessage, formatManilaHour, formatManilaTime, formatManilaWhen, relativeTime, toTime } from "../../../lib/barangayAdmin";
import { RiskBadge } from "../clay/Clay";

/*
 * "My barangay" status + 24-hour forecast for the barangay admin, and the
 * manual level control. Data (barangay row, forecast rows, override hours)
 * is loaded and kept live by the dashboard; this panel only writes the level.
 */

export type MyBarangayRow = {
  id: number;
  name: string;
  flood_risk: RiskLevel | null;
  risk_source: string | null;
  manual_override_until: string | null;
  auto_risk: RiskLevel | null;
  forecast_6h: RiskLevel | null;
  forecast_12h: RiskLevel | null;
  forecast_24h: RiskLevel | null;
  rain_past_24h: number | null;
  rain_next_3h: number | null;
  rain_next_24h: number | null;
  peak_rain_mm_h: number | null;
  peak_rain_at: string | null;
  auto_updated_at: string | null;
  last_update: string | null;
};

export type ForecastHour = { t: number; mm: number; prob: number | null; simulated: boolean };

export const MY_BARANGAY_COLUMNS =
  "id, name, flood_risk, risk_source, manual_override_until, auto_risk, forecast_6h, forecast_12h, forecast_24h, rain_past_24h, rain_next_3h, rain_next_24h, peak_rain_mm_h, peak_rain_at, auto_updated_at, last_update";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const str = (value: unknown) => (typeof value === "string" ? value : null);

export const toMyBarangay = (row: Record<string, unknown>): MyBarangayRow => ({
  id: Number(row.id),
  name: String(row.name ?? ""),
  flood_risk: asRiskLevel(row.flood_risk),
  risk_source: str(row.risk_source),
  manual_override_until: str(row.manual_override_until),
  auto_risk: asRiskLevel(row.auto_risk),
  forecast_6h: asRiskLevel(row.forecast_6h),
  forecast_12h: asRiskLevel(row.forecast_12h),
  forecast_24h: asRiskLevel(row.forecast_24h),
  rain_past_24h: num(row.rain_past_24h),
  rain_next_3h: num(row.rain_next_3h),
  rain_next_24h: num(row.rain_next_24h),
  peak_rain_mm_h: num(row.peak_rain_mm_h),
  peak_rain_at: str(row.peak_rain_at),
  auto_updated_at: str(row.auto_updated_at),
  last_update: str(row.last_update),
});

export const toForecastHour = (row: Record<string, unknown>): ForecastHour => ({
  t: toTime(String(row.hour)),
  mm: num(row.precip_mm) ?? 0,
  prob: num(row.precip_prob),
  simulated: row.is_simulated === true,
});

const RISK_RANK: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };
const LEVEL_WORD: Record<RiskLevel, string> = { low: "LOW", medium: "MEDIUM", high: "HIGH" };
const LEVEL_LABEL: Record<RiskLevel, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };
export const HOUR_MS = 60 * 60 * 1000;

/** Same hourly intensity bands as the MDRRMO forecast chart. */
const INTENSITY = [
  { label: "Light", range: "< 2.5 mm/h", color: "#8FA9C4", max: 2.5 },
  { label: "Moderate", range: "2.5-7.5 mm/h", color: "#3B82C4", max: 7.5 },
  { label: "Heavy", range: "7.5-15 mm/h", color: "#D98E04", max: 15 },
  { label: "Intense", range: "> 15 mm/h", color: "#C0392B", max: Infinity },
] as const;
const intensityOf = (mm: number) => INTENSITY.find((band) => (band.max === 15 ? mm <= 15 : mm < band.max)) ?? INTENSITY[3];

const fmtMm = (value: number | null) => (value == null ? "--" : value.toFixed(1));

/** Older than this, the automated run has probably missed a cycle (it runs every 30 minutes). */
export const STALE_AFTER_MS = 90 * 60 * 1000;

export type Trend = "Rising" | "Falling" | "Steady";

/** +24 h level compared with the current level; null when either is missing. */
export function forecastTrend(current: RiskLevel | null, in24h: RiskLevel | null): Trend | null {
  if (!current || !in24h) return null;
  const diff = RISK_RANK[in24h] - RISK_RANK[current];
  return diff > 0 ? "Rising" : diff < 0 ? "Falling" : "Steady";
}

const TREND_STYLE: Record<Trend, { className: string; icon: typeof TrendingUp }> = {
  Rising: { className: "risk-badge-high", icon: TrendingUp },
  Falling: { className: "risk-badge-low", icon: TrendingDown },
  Steady: { className: "risk-badge-neutral", icon: ArrowRight },
};

/** Plain words for how the current level was set. */
export function sourceText(row: Pick<MyBarangayRow, "risk_source" | "manual_override_until">): string {
  if (row.risk_source === "manual") {
    const until = toTime(row.manual_override_until);
    return until ? `Set by you until ${formatManilaWhen(until)}` : "Set by you";
  }
  if (row.risk_source === "simulation") return "Demo simulation";
  if (row.risk_source === "auto") return "Automatic";
  return "Source unknown";
}

type Props = {
  barangayName: string;
  row: MyBarangayRow | null;
  hours: ForecastHour[];
  overrideHours: number | null;
  loading: boolean;
  error: string | null;
  now: number;
  onRetry: () => void;
  /** Re-reads the barangay row after a level change. */
  onChanged: () => Promise<void>;
};

export function BarangayStatusPanel({ barangayName, row, hours, overrideHours, loading, error, now, onRetry, onChanged }: Props) {
  const nowHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const simulated = hours.some((h) => h.simulated) || row?.risk_source === "simulation";
  const updatedAt = toTime(row?.auto_updated_at);
  const updated = row ? relativeTime(updatedAt, now) : "";
  const stale = !!updatedAt && now - updatedAt > STALE_AFTER_MS;
  const peakAt = toTime(row?.peak_rain_at);
  const trend = row ? forecastTrend(row.flood_risk, row.forecast_24h) : null;

  return (
    <section id="barangay-status" className="clay p-5" aria-labelledby="barangay-status-title">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--lavender)" }}>
          <CloudRain size={20} style={{ color: "var(--lavender-icon)" }} aria-hidden="true" />
        </span>
        <div className="min-w-[12rem] flex-1">
          <h2 id="barangay-status-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            {barangayName} status and forecast
          </h2>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {loading ? "Loading..." : updated ? `Updated ${updated} (Open-Meteo)` : "Forecast not updated yet (Open-Meteo)"}
          </p>
        </div>
        {simulated && !loading && (
          <span className="risk-badge risk-badge-medium is-compact" role="status">
            <AlertTriangle size={12} aria-hidden="true" /> Simulated data
          </span>
        )}
        {stale && !loading && !error && (
          <span className="risk-badge risk-badge-medium is-compact" role="status">
            <AlertTriangle size={12} aria-hidden="true" /> Forecast may be out of date
          </span>
        )}
      </div>

      <div className="mt-4 space-y-5">
        {loading ? (
          <Skeleton />
        ) : error ? (
          <div role="alert" className="flat-alert" style={{ "--alert-color": "var(--risk-high)" } as CSSProperties}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Unable to load the status for {barangayName}.</p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>{error}</p>
            <button type="button" onClick={onRetry} className="clay-btn clay-btn-secondary mt-3" style={{ minHeight: 44 }}>
              <RefreshCw size={16} aria-hidden="true" /> Try again
            </button>
          </div>
        ) : !row ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            {barangayName} was not found in the barangay list. Please contact MDRRMO.
          </p>
        ) : (
          <>
            {/* Current level */}
            <div className="flex flex-wrap items-center gap-3">
              <RiskBadge risk={row.flood_risk} />
              <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{sourceText(row)}</span>
            </div>

            {/* Rain tiles */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Past 24 h" value={fmtMm(row.rain_past_24h)} unit="mm" />
              <Tile label="Next 3 h" value={fmtMm(row.rain_next_3h)} unit="mm" />
              <Tile label="Next 24 h" value={fmtMm(row.rain_next_24h)} unit="mm" />
              <Tile label="Peak" value={fmtMm(row.peak_rain_mm_h)} unit="mm/h" note={peakAt ? `around ${formatManilaWhen(peakAt, now)}` : undefined} />
            </div>

            {/* Forecast chips */}
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Forecast flood level</p>
                {trend && <TrendTag trend={trend} />}
              </div>
              <div className="flex flex-wrap gap-4">
                {([
                  ["+6 h", row.forecast_6h],
                  ["+12 h", row.forecast_12h],
                  ["+24 h", row.forecast_24h],
                ] as const).map(([label, risk]) => (
                  <div key={label} className="flex flex-col items-start gap-1">
                    <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
                    <RiskBadge risk={risk} compact />
                  </div>
                ))}
              </div>
            </div>

            <HourlyChart hours={hours} nowHour={nowHour} />

            <ManualLevel barangayName={barangayName} row={row} overrideHours={overrideHours} onChanged={onChanged} />
          </>
        )}
      </div>
    </section>
  );
}

function TrendTag({ trend }: { trend: Trend }) {
  const { className, icon: Icon } = TREND_STYLE[trend];
  return (
    <span className={`risk-badge is-compact ${className}`} title="+24 h level compared with the current level">
      <Icon size={12} aria-hidden="true" /> {trend}
    </span>
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

function Skeleton() {
  const block = (className: string) => <div className={`animate-pulse rounded-xl ${className}`} style={{ background: "var(--border)" }} />;
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading barangay status">
      {block("h-8 w-1/3")}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i}>{block("h-20")}</div>)}
      </div>
      {block("h-44")}
    </div>
  );
}

function HourlyChart({ hours, nowHour }: { hours: ForecastHour[]; nowHour: number }) {
  if (hours.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
        No hourly forecast for the next 24 hours yet. It refreshes automatically every 30 minutes.
      </p>
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Hourly rainfall (mm), next 24 hours</p>
      <div className="rounded-xl border bg-white" style={{ borderColor: "var(--border)", height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={hours} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
            <XAxis dataKey="t" tickFormatter={(t: number) => formatManilaHour(t)} interval="preserveStartEnd" minTickGap={28} tick={{ fontSize: 11, fill: "#55657a" }} />
            <YAxis tick={{ fontSize: 11, fill: "#55657a" }} width={36} allowDecimals />
            <Tooltip content={<HourTooltip />} cursor={{ fill: "rgba(59,130,196,0.08)" }} />
            <Bar dataKey="mm" name="Rain (mm)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {hours.map((h) => (
                <Cell key={h.t} fill={intensityOf(h.mm).color} stroke={h.t === nowHour ? "#1e2a38" : undefined} strokeWidth={h.t === nowHour ? 1.5 : 0} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-secondary)" }} aria-label="Chart legend">
        {INTENSITY.map((band) => (
          <li key={band.label} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: band.color }} aria-hidden="true" />
            {band.label} ({band.range})
          </li>
        ))}
      </ul>
    </div>
  );
}

function HourTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as ForecastHour;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
      <p className="font-semibold">{formatManilaWhen(point.t)}</p>
      <p>{point.mm.toFixed(1)} mm</p>
      <p>{point.prob == null ? "Chance unavailable" : `${Math.round(point.prob)}% chance of rain`}</p>
      {point.simulated && <p style={{ color: "var(--risk-medium-text)" }}>Simulated data</p>}
    </div>
  );
}

function ManualLevel({
  barangayName,
  row,
  overrideHours,
  onChanged,
}: {
  barangayName: string;
  row: MyBarangayRow;
  overrideHours: number | null;
  onChanged: () => Promise<void>;
}) {
  const [pending, setPending] = useState<RiskLevel | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const isManual = row.risk_source === "manual";
  const autoHigher = isManual && row.auto_risk && row.flood_risk && RISK_RANK[row.auto_risk] > RISK_RANK[row.flood_risk];
  const hoursText = overrideHours == null ? "a few hours" : `${overrideHours} ${overrideHours === 1 ? "hour" : "hours"}`;

  const save = async () => {
    if (!pending || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      // Only flood_risk: the database marks it manual and sets the override timer.
      const { data, error } = await supabase.from("barangays").update({ flood_risk: pending }).eq("name", barangayName).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("The database did not save the change (no permission to update this barangay).");
      await onChanged();
      setMessage({ kind: "ok", text: `Level set to ${LEVEL_LABEL[pending]}.` });
      setPending(null);
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err, "Unable to set the level.") });
    } finally {
      setSaving(false);
    }
  };

  const returnToAuto = async () => {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc("barangay_return_to_auto", { p_barangay: barangayName });
      if (error) throw error;
      await onChanged();
      const level = asRiskLevel(data);
      setMessage({ kind: "ok", text: level ? `Back to automatic: ${LEVEL_LABEL[level]}.` : "Back to automatic." });
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err, "Unable to return to automatic.") });
    } finally {
      setSaving(false);
    }
  };

  const returnButton = (
    <button type="button" className="clay-btn clay-btn-secondary" onClick={() => void returnToAuto()} disabled={saving}>
      {saving && !pending ? <Loader size={16} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}
      Return to automatic
    </button>
  );

  return (
    <div id="barangay-manual-level" className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Set the level manually</h3>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Use this when you see conditions the forecast does not show.
          </p>
        </div>
        {isManual && !autoHigher && returnButton}
      </div>

      {autoHigher && row.auto_risk && (
        <div role="status" className="mt-3 flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-sm" style={{ background: "#FDF1DC", border: "1px solid #D98E04", color: "var(--risk-medium-text)" }}>
          <p className="flex min-w-[12rem] flex-1 items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <strong>The forecast is higher than your setting.</strong> Automatic level: {LEVEL_WORD[row.auto_risk]}.
            </span>
          </p>
          {returnButton}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Choose a flood level">
        {(["low", "medium", "high"] as RiskLevel[]).map((level) => {
          const current = row.flood_risk === level;
          const chosen = pending === level;
          return (
            <button
              key={level}
              type="button"
              disabled={saving}
              aria-pressed={chosen}
              onClick={() => {
                setMessage(null);
                setPending(chosen ? null : level);
              }}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold"
              style={{
                borderColor: chosen ? `var(--risk-${level})` : "var(--border)",
                background: chosen ? "#f4f7fb" : "#fff",
                color: "var(--text-primary)",
              }}
            >
              <RiskBadge risk={level} compact />
              {current && <span className="text-xs" style={{ color: "var(--text-secondary)" }}>(current)</span>}
            </button>
          );
        })}
      </div>

      {pending && (
        <div className="mt-3 rounded-lg p-3" style={{ background: "#f4f7fb" }}>
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            Set {barangayName} to <strong>{LEVEL_LABEL[pending]}</strong>? This overrides the automatic level for {hoursText}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="clay-btn clay-btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader size={16} className="animate-spin" aria-hidden="true" /> : null}
              {saving ? "Saving..." : "Confirm"}
            </button>
            <button type="button" className="clay-btn clay-btn-secondary" onClick={() => setPending(null)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className="mt-3 bg-white px-3 py-2 text-sm"
          style={{ color: "var(--text-primary)", borderLeft: `4px solid ${message.kind === "error" ? "var(--risk-high)" : "var(--risk-low)"}` }}
        >
          {message.text}
        </p>
      )}
      {row.last_update && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          Level last changed {formatManilaWhen(toTime(row.last_update))}
          {row.risk_source === "manual" && toTime(row.manual_override_until) ? ` · automatic resumes at ${formatManilaTime(toTime(row.manual_override_until))}` : ""}
        </p>
      )}
    </div>
  );
}
