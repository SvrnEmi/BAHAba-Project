import { supabase } from "./supabase";

export type RiskLevel = "low" | "medium" | "high";
export type RiskSource = "auto" | "manual" | "simulation";

/** How a barangay's current flood risk was set (barangays.risk_source). */
export function riskSourceLabel(source: string | null | undefined): string | null {
  switch (source) {
    case "auto":
      return "Automated estimate";
    case "manual":
      return "Set by barangay admin";
    case "simulation":
      return "Demo simulation";
    default:
      return null;
  }
}

export function asRiskLevel(value: unknown): RiskLevel | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

/**
 * rain_simulation: a single row (id = 1) read by update-flood-risk. Column
 * names live here so they can be matched to the live schema in one place.
 */
export const RAIN_SIMULATION = {
  table: "rain_simulation",
  rowId: 1,
  active: "active",
  mmPerHour: "mm_per_hour",
  durationHours: "duration_hours",
  expiresAt: "expires_at",
  updatedAt: "updated_at",
} as const;

/**
 * Asks the backend to recompute barangays.flood_risk now instead of waiting
 * for the 30-minute schedule. Sent with the signed-in user's session token.
 */
export async function runFloodRiskUpdate() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again to run the flood risk update.");

  const { error } = await supabase.functions.invoke("update-flood-risk", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
}
