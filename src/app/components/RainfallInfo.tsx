import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, CloudRain, HelpCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { usePagasaLevels, type PagasaLevelRow } from "../../lib/alerts";
import { RiskBadge } from "./clay/Clay";

/*
 * "How rainfall risk works": plain-language explanation of the automatic
 * flood level. Thresholds come from risk_settings (id = 1) and the PAGASA
 * table from pagasa_levels, so the page always shows the live values.
 * Public route (/rainfall-info); linked from MDRRMO Settings, the forecast
 * panels and (short version) the resident Home screen.
 */

type Rules = {
  autoEnabled: boolean | null;
  medium3: number | null;
  high3: number | null;
  medium24: number | null;
  high24: number | null;
  overrideHours: number | null;
  holddownHours: number | null;
};

const n = (value: unknown) => {
  const v = Number(value);
  return value == null || !Number.isFinite(v) ? null : v;
};

function useRiskRules() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("risk_settings")
      .select("auto_enabled, medium_mm_3h, high_mm_3h, medium_mm_24h, high_mm_24h, override_hours, holddown_hours")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error: readError }) => {
        if (cancelled) return;
        if (readError || !data) {
          setError(readError?.message ?? "No settings row");
          return;
        }
        const row = data as Record<string, unknown>;
        setRules({
          autoEnabled: typeof row.auto_enabled === "boolean" ? row.auto_enabled : null,
          medium3: n(row.medium_mm_3h),
          high3: n(row.high_mm_3h),
          medium24: n(row.medium_mm_24h),
          high24: n(row.high_mm_24h),
          overrideHours: n(row.override_hours),
          holddownHours: n(row.holddown_hours),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { rules, error };
}

const mm = (v: number | null) => (v == null ? "?" : `${v} mm`);
const hrs = (v: number | null) => (v == null ? "a few hours" : `${v} ${v === 1 ? "hour" : "hours"}`);

function range(min: number | null, max: number | null) {
  if (min == null && max == null) return "-";
  if (max == null) return `${min} mm or more`;
  if (min == null || min === 0) return `below ${max} mm`;
  return `${min} to ${max} mm`;
}

const SWATCH: Record<string, string> = { yellow: "var(--pagasa-yellow)", orange: "var(--pagasa-orange)", red: "var(--pagasa-red)" };

function PagasaTable({ rows, error }: { rows: PagasaLevelRow[] | null; error: string | null }) {
  if (error) return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>The PAGASA table could not be loaded ({error}).</p>;
  if (!rows) return <div className="h-24 animate-pulse rounded-2xl bg-white/70" aria-busy="true" />;
  if (!rows.length) return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>The PAGASA table is empty.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl bg-white">
      <table className="w-full min-w-[520px] text-left text-sm">
        <caption className="sr-only">PAGASA rainfall warning levels</caption>
        <thead>
          <tr className="border-b" style={{ color: "var(--text-secondary)" }}>
            <th scope="col" className="p-3 text-xs font-semibold">Color and label</th>
            <th scope="col" className="p-3 text-xs font-semibold">Rain per hour</th>
            <th scope="col" className="p-3 text-xs font-semibold">Rain in 24 h</th>
            <th scope="col" className="p-3 text-xs font-semibold">What it means</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-b last:border-0 align-top">
              <th scope="row" className="p-3 font-semibold" style={{ color: "var(--text-primary)" }}>
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ background: SWATCH[r.color?.toLowerCase()] ?? "var(--text-secondary)" }} />
                  {r.color ? r.color.charAt(0).toUpperCase() + r.color.slice(1) : r.code} - {r.label}
                </span>
                {r.alert_level && <span className="block text-xs font-normal" style={{ color: "var(--text-secondary)" }}>BAHAba level: {r.alert_level}</span>}
              </th>
              <td className="p-3">{range(r.hourly_mm_min, r.hourly_mm_max)}</td>
              <td className="p-3">{range(r.advisory_24h_mm_min, r.advisory_24h_mm_max)}</td>
              <td className="p-3" style={{ color: "var(--text-secondary)" }}>{r.meaning ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="clay space-y-2 p-5 text-sm font-normal leading-relaxed" style={{ color: "var(--text-primary)" }}>
      <h2 className="text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function RainfallInfoPage() {
  const navigate = useNavigate();
  const { rules, error: rulesError } = useRiskRules();
  const { rows, error: pagasaError } = usePagasaLevels();

  return (
    <div className="min-h-screen bg-background px-[18px] pt-4 pb-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
            aria-label="Back"
            className="clay clay-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--primary-brand)" }}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>How rainfall risk works</h1>
        </div>

        <Section title="Where the numbers come from">
          <p>
            BAHAba reads the rainfall <strong>forecast</strong> from Open-Meteo, a free weather-model service. These are model
            estimates of how much rain will fall, <strong>not readings from rain gauges</strong> in Odiongan.
          </p>
          <p>The forecast is read again <strong>every 30 minutes</strong>, for one point in each barangay.</p>
        </Section>

        <Section title="How the flood level is chosen">
          <p>For each barangay BAHAba looks at two numbers from the forecast:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>The worst 3-hour burst</strong>: the most rain expected in any 3 hours in a row.</li>
            <li><strong>The 24-hour total</strong>: all the rain expected in the next 24 hours.</li>
          </ul>
          {rules ? (
            <ul className="space-y-2 pt-1">
              <li className="flex flex-wrap items-center gap-2">
                <RiskBadge risk="high" compact /> {mm(rules.high3)} or more in 3 hours, or {mm(rules.high24)} or more in 24 hours
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <RiskBadge risk="medium" compact /> {mm(rules.medium3)} or more in 3 hours, or {mm(rules.medium24)} or more in 24 hours
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <RiskBadge risk="low" compact /> Less rain than that
              </li>
            </ul>
          ) : (
            <p style={{ color: "var(--text-secondary)" }}>
              {rulesError ? "The current thresholds could not be loaded. Ask the MDRRMO for the current values." : "Loading the current thresholds..."}
            </p>
          )}
          {rules?.autoEnabled === false && (
            <p className="bg-white px-3 py-2" style={{ borderLeft: "4px solid var(--risk-medium)" }}>
              Automatic updates are currently <strong>off</strong>; levels are set by hand.
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>These thresholds are set by the MDRRMO in Settings and may change.</p>
        </Section>

        <Section title="When a level is set by hand">
          <p>
            A barangay admin or the MDRRMO can set the level themselves. A manual level <strong>holds for {hrs(rules?.overrideHours ?? null)}</strong>;
            after that, or when they choose "Return to automatic", the forecast takes over again.
          </p>
          <p>
            Once the level goes up, it stays up for at least <strong>{hrs(rules?.holddownHours ?? null)}</strong> so it does not flicker
            between levels.
          </p>
        </Section>

        <Section title="PAGASA alert colors">
          <p>
            Alerts use the PAGASA colors. They are always shown with their label: Yellow - Be Alert, Orange - Be Prepared, Red - Take Action.
            The table below is read from BAHAba's PAGASA settings.
          </p>
          <PagasaTable rows={rows} error={pagasaError} />
        </Section>

        <Section title="Limitations">
          <ul className="list-disc space-y-1 pl-5">
            <li>Forecasts are model estimates and can be wrong, especially for short, heavy thunderstorms.</li>
            <li>Each barangay uses one approximate point; nearby barangays often show the same numbers because the model grid is several kilometers wide.</li>
            <li>Rainfall is not the same as flooding: drainage, rivers and tides also matter. Community reports help fill that gap.</li>
            <li>
              BAHAba <strong>does not replace official PAGASA bulletins</strong> or instructions from the MDRRMO. In an emergency, call 911 or the
              MDRRMO at +63 919 079 8427.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

/** Small link used by settings and forecast panels. */
export function RainfallInfoLink({ className = "" }: { className?: string }) {
  return (
    <Link to="/rainfall-info" className={`inline-flex min-h-10 items-center gap-1 text-sm font-semibold underline ${className}`} style={{ color: "var(--primary-shade)" }}>
      <HelpCircle size={16} aria-hidden="true" /> How rainfall risk works
    </Link>
  );
}

/** Short version for the resident Home screen. */
export function RainfallInfoShort() {
  return (
    <section className="clay space-y-2 p-4" aria-labelledby="rain-info-short-title">
      <h2 id="rain-info-short-title" className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
        <CloudRain size={18} aria-hidden="true" style={{ color: "var(--primary-brand)" }} /> How rainfall risk works
      </h2>
      <p className="text-[13px] font-normal leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        Every 30 minutes BAHAba checks the Open-Meteo rain forecast for your barangay. Heavy rain in 3 hours or a lot of rain in 24 hours
        raises the level. It is a forecast, not a rain gauge, and does not replace official PAGASA bulletins.
      </p>
      <RainfallInfoLink />
    </section>
  );
}
