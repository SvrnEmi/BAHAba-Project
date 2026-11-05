import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, History, Timer } from "lucide-react";
import { ClayCard } from "./clay/Clay";
import {
  bahaCountdown,
  countdownUpdated,
  RISK_LABELS,
  WATER_LABELS,
  WATER_LEVELS,
  WATER_SHORT,
  type CountdownLang,
  type CountdownRow,
} from "../../lib/bahaCountdown";
import { WATER_COLOR, WaterLevelIcon } from "./WaterLevelIcon";

const LANG_KEY = "baha_countdown_lang";

function readLang(): CountdownLang {
  try {
    return localStorage.getItem(LANG_KEY) === "fil" ? "fil" : "en";
  } catch {
    return "en";
  }
}

/**
 * Home card: when heavy rain is expected in the resident's barangay, when it
 * peaks, and how deep the water may get. Uses only existing barangays columns.
 */
export function BahaCountdownCard({ row }: { row: CountdownRow }) {
  const [lang, setLangState] = useState<CountdownLang>(readLang);
  const [now, setNow] = useState(() => Date.now());

  // "in about 2 hours" and "Updated 5 min ago" move with the clock.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const setLang = (next: CountdownLang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Per-device convenience only.
    }
  };

  const fil = lang === "fil";
  const countdown = bahaCountdown(row, lang, now);
  const risk = row.flood_risk === "low" || row.flood_risk === "medium" || row.flood_risk === "high" ? row.flood_risk : null;
  const RiskIcon = risk === "low" ? CheckCircle2 : risk ? AlertTriangle : HelpCircle;
  const heavy = countdown?.heavy ?? false;
  const impact = countdown?.impact ?? null;
  const impactText = impact
    ? `${fil ? "Posibleng baha" : "Possible flooding"}: ${WATER_LABELS[lang][impact]}`
    : fil
      ? "Walang inaasahang baha"
      : "No flooding expected";

  return (
    <ClayCard className="p-4 mb-5">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: heavy ? "var(--peach)" : "var(--lavender)" }}
        >
          <Timer size={22} style={{ color: heavy ? "var(--peach-icon)" : "var(--lavender-icon)" }} aria-hidden="true" />
        </span>
        <h2 className="min-w-0 flex-1 text-base font-bold" style={{ color: "var(--text-primary)" }}>
          Baha Countdown
        </h2>
        <div role="group" aria-label="Language" className="flex">
          {(
            [
              ["en", "EN", "English"],
              ["fil", "FIL", "Filipino"],
            ] as const
          ).map(([value, label, name]) => (
            <button
              key={value}
              type="button"
              aria-pressed={lang === value}
              aria-label={name}
              onClick={() => setLang(value)}
              className="flex h-12 min-w-12 items-center justify-center"
            >
              <span
                className="rounded-lg px-2.5 py-1.5 text-[13px] font-bold"
                style={
                  lang === value
                    ? { background: "var(--primary-shade)", color: "#fff" }
                    : { color: "var(--primary-shade)" }
                }
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {countdown ? (
        <>
          <p
            aria-live="polite"
            className="mt-3 text-[19px] font-bold leading-snug"
            style={{ color: heavy ? "var(--risk-high)" : "var(--text-primary)" }}
          >
            {countdown.headline}
          </p>
          {countdown.peakLine && (
            <p className="mt-1 text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {countdown.peakLine}
            </p>
          )}
          <p className="mt-3.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {impactText}
          </p>
          <div className="mt-2 grid grid-cols-5 gap-1" role="img" aria-label={impactText}>
            {WATER_LEVELS.map((level) => {
              const active = level === impact;
              return (
                <div
                  key={level}
                  className="flex flex-col items-center rounded-[10px] py-1.5"
                  style={{
                    border: `2px solid ${active ? WATER_COLOR[level] : "transparent"}`,
                    background: active ? `color-mix(in srgb, ${WATER_COLOR[level]} 12%, transparent)` : undefined,
                  }}
                >
                  <WaterLevelIcon level={level} active={active} />
                  <span
                    className="mt-1 truncate text-[11px]"
                    style={{
                      color: active ? "var(--text-primary)" : "var(--text-secondary)",
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    {WATER_SHORT[lang][level]}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mt-3 text-[15px]" style={{ color: "var(--text-primary)" }}>
          {fil ? "Wala pang forecast ng ulan para sa inyong barangay." : "No rain forecast for your barangay yet."}
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className={`risk-badge ${risk ? `risk-badge-${risk}` : "risk-badge-neutral"}`}>
          <RiskIcon size={16} aria-hidden="true" />
          {risk ? RISK_LABELS[lang][risk] : fil ? "Walang datos" : "Risk unavailable"}
        </span>
        <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {countdownUpdated(row.auto_updated_at, lang, now)}
        </span>
      </div>
      {countdown?.stale && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-primary)" }}>
          <History size={18} style={{ color: "var(--risk-medium)" }} aria-hidden="true" />
          {fil ? "Maaaring luma na ang forecast." : "Forecast may be out of date."}
        </p>
      )}
      {countdown && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
          {fil ? "Awtomatikong tantiya mula sa forecast ng ulan." : "Automatic estimate from the rain forecast."}
        </p>
      )}
    </ClayCard>
  );
}
