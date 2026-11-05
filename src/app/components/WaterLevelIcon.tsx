import type { WaterLevel } from "../../lib/bahaCountdown";

/** Water height from the feet, as a fraction of the icon (matches Flutter). */
const FILL: Record<WaterLevel, number> = { ankle: 0.14, knee: 0.32, waist: 0.5, chest: 0.68, overhead: 0.96 };

/** Deeper water reads warmer, matching the risk colors. */
export const WATER_COLOR: Record<WaterLevel, string> = {
  ankle: "var(--primary)",
  knee: "var(--primary-shade)",
  waist: "var(--risk-medium)",
  chest: "var(--risk-high)",
  overhead: "#7B1F16",
};

/** A standing person with water up to `level`. Shared picture for the water scale. */
export function WaterLevelIcon({ level, size = 36, active = true }: { level: WaterLevel; size?: number; active?: boolean }) {
  const top = 100 * (1 - FILL[level]);
  const body = active ? "var(--ink)" : "var(--text-secondary)";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="14" r="10" fill={body} />
      <rect x="36" y="27" width="28" height="33" rx="8" fill={body} />
      <rect x="38" y="55" width="10" height="43" rx="4" fill={body} />
      <rect x="52" y="55" width="10" height="43" rx="4" fill={body} />
      <rect x="0" y={top} width="100" height={100 - top} rx="10" fill={active ? WATER_COLOR[level] : "var(--border)"} opacity="0.75" />
    </svg>
  );
}
