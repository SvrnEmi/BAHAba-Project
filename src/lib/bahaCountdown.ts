/**
 * Baha Countdown: plain-language rain timing for one barangay, built from
 * existing barangays columns (filled by update-flood-risk). Mirrors
 * bahaba_app/lib/utils/baha_countdown.dart so both apps say the same thing.
 */

export type CountdownLang = "en" | "fil";
export type WaterLevel = "ankle" | "knee" | "waist" | "chest" | "overhead";
export const WATER_LEVELS: WaterLevel[] = ["ankle", "knee", "waist", "chest", "overhead"];

/** PAGASA rainfall intensity bands, in mm per hour. */
const MODERATE = 2.5;
const HEAVY = 7.5;
const INTENSE = 15;
const TORRENTIAL = 30;
const HOUR = 3600_000;
/** update-flood-risk runs every 30 minutes; older than this is stale. */
const STALE_AFTER = 3 * HOUR;

export type CountdownRow = {
  flood_risk: string | null;
  rain_next_3h: number | string | null;
  peak_rain_mm_h: number | string | null;
  peak_rain_at: string | null;
  auto_updated_at: string | null;
};

export type BahaCountdown = {
  headline: string;
  peakLine: string | null;
  impact: WaterLevel | null;
  stale: boolean;
  heavy: boolean;
};

const manilaTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const manilaDate = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const time = (v: string | null) => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Returns null when the row has no forecast yet. */
export function bahaCountdown(row: CountdownRow, lang: CountdownLang, now = Date.now()): BahaCountdown | null {
  const updated = time(row.auto_updated_at);
  if (updated == null) return null;
  const fil = lang === "fil";

  const next3h = num(row.rain_next_3h);
  let peak = num(row.peak_rain_mm_h);
  let peakAt = time(row.peak_rain_at);
  // peak_rain_at is the start of the wettest hour; once it is over, ignore it.
  if (peakAt != null && now >= peakAt + HOUR) {
    peakAt = null;
    peak = 0;
  }

  const stale = now - updated > STALE_AFTER;
  const heavyNext3h = next3h >= HEAVY * 3;
  const heavy = peak >= HEAVY || heavyNext3h;
  const within3h = fil ? "Inaasahan ang malakas na ulan sa loob ng 3 oras." : "Heavy rain expected within 3 hours.";

  let headline: string;
  if (peak >= HEAVY && peakAt != null) {
    const minutes = Math.floor((peakAt - now) / 60000);
    if (minutes <= 0) headline = fil ? "Malakas na ang ulan ngayon." : "Heavy rain now.";
    else if (minutes < 60)
      headline = fil ? "Inaasahan ang malakas na ulan sa loob ng isang oras." : "Heavy rain expected within the hour.";
    else if (heavyNext3h && minutes > 180) headline = within3h;
    else {
      const hours = Math.round(minutes / 60);
      headline = fil
        ? `Inaasahan ang malakas na ulan sa loob ng mga ${hours} oras.`
        : `Heavy rain expected in about ${hours} ${hours === 1 ? "hour" : "hours"}.`;
    }
  } else if (heavyNext3h) headline = within3h;
  else if (peak >= MODERATE) headline = fil ? "Inaasahan ang katamtamang ulan." : "Moderate rain expected.";
  else if (peak > 0 || next3h > 0)
    headline = fil ? "Mahinang ulan lang sa susunod na 24 oras." : "Light rain only in the next 24 hours.";
  else headline = fil ? "Walang inaasahang ulan sa susunod na 24 oras." : "No rain expected in the next 24 hours.";

  return {
    headline,
    peakLine: peakAt == null || peak <= 0 ? null : peakLine(peakAt, now, fil),
    impact: expectedImpact(peak, next3h, row.flood_risk),
    stale,
    heavy,
  };
}

/** Expected flooding on the shared scale; a forecast never claims overhead. */
export function expectedImpact(peakMmH: number, next3hMm: number, risk: string | null): WaterLevel | null {
  const rate = Math.max(peakMmH, next3hMm / 3);
  let rank = rate >= TORRENTIAL ? 4 : rate >= INTENSE ? 3 : rate >= HEAVY ? 2 : rate >= MODERATE ? 1 : 0;
  // Ground already saturated: the current risk sets a floor.
  rank = Math.max(rank, risk === "high" ? 2 : risk === "medium" ? 1 : 0);
  return ([null, "ankle", "knee", "waist", "chest"] as const)[rank];
}

function peakLine(peakAt: number, now: number, fil: boolean) {
  if (now >= peakAt) return fil ? "Pinakamalakas na ngayon." : "Peak is happening now.";
  const t = manilaTime.format(peakAt);
  const tomorrow = manilaDate.format(peakAt) !== manilaDate.format(now);
  if (fil) return tomorrow ? `Pinakamalakas bukas bandang ${t}.` : `Pinakamalakas bandang ${t}.`;
  return tomorrow ? `Peak around ${t} tomorrow.` : `Peak around ${t}.`;
}

export const WATER_LABELS: Record<CountdownLang, Record<WaterLevel, string>> = {
  en: { ankle: "Ankle-deep", knee: "Knee-deep", waist: "Waist-deep", chest: "Chest-deep", overhead: "Over head" },
  fil: {
    ankle: "Hanggang bukung-bukong",
    knee: "Hanggang tuhod",
    waist: "Hanggang baywang",
    chest: "Hanggang dibdib",
    overhead: "Lampas ulo",
  },
};

export const WATER_SHORT: Record<CountdownLang, Record<WaterLevel, string>> = {
  en: { ankle: "Ankle", knee: "Knee", waist: "Waist", chest: "Chest", overhead: "Head" },
  fil: { ankle: "Bukong", knee: "Tuhod", waist: "Baywang", chest: "Dibdib", overhead: "Ulo" },
};

export const RISK_LABELS: Record<CountdownLang, Record<"low" | "medium" | "high", string>> = {
  en: { low: "Low Risk", medium: "Medium Risk", high: "High Risk" },
  fil: { low: "Mababang panganib", medium: "Katamtamang panganib", high: "Mataas na panganib" },
};

/** "Updated 12 min ago" / "Na-update 12 min ang nakalipas". */
export function countdownUpdated(value: string | null, lang: CountdownLang, now = Date.now()) {
  const fil = lang === "fil";
  const t = time(value);
  if (t == null) return fil ? "Wala pang update" : "Not yet updated";
  const minutes = Math.floor((now - t) / 60000);
  if (minutes < 1) return fil ? "Na-update ngayon lang" : "Updated just now";
  let ago: string;
  if (minutes < 60) ago = `${minutes} min`;
  else if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    ago = fil ? `${h} oras` : `${h} ${h === 1 ? "hr" : "hrs"}`;
  } else {
    const d = Math.floor(minutes / 1440);
    ago = fil ? `${d} araw` : `${d} ${d === 1 ? "day" : "days"}`;
  }
  return fil ? `Na-update ${ago} ang nakalipas` : `Updated ${ago} ago`;
}
