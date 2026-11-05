import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

/*
 * Field observations: what barangay officials see on the ground. The client
 * sends barangay (row-level security only accepts the official's own);
 * observed_by and observed_at default in the database, and the database writes
 * the audit log. This table has no realtime, so pages reload after each change.
 */

export type ObservationKind = "waterway" | "road";

export type Observation = {
  id: number;
  barangay: string;
  kind: ObservationKind;
  location: string;
  status: string;
  note: string | null;
  observed_by: string | null;
  observed_at: string;
};

export type ObservationInput = { kind: ObservationKind; location: string; status: string; note: string };

const COLUMNS = "id, barangay, kind, location, status, note, observed_by, observed_at";

export const LOCATION_MIN = 2;
export const LOCATION_MAX = 120;
export const NOTE_MAX = 300;

export const KIND_LABELS: Record<ObservationKind, string> = { waterway: "Waterway", road: "Road" };

/** The only kind and status pairs the database accepts. */
export const STATUS_OPTIONS: Record<ObservationKind, ReadonlyArray<{ value: string; label: string; badge: string }>> = {
  waterway: [
    { value: "normal", label: "Normal", badge: "risk-badge-low" },
    { value: "rising", label: "Rising", badge: "risk-badge-medium" },
    { value: "overflowing", label: "Overflowing", badge: "risk-badge-high" },
  ],
  road: [
    { value: "passable", label: "Passable", badge: "risk-badge-low" },
    { value: "impassable", label: "Impassable", badge: "risk-badge-high" },
  ],
};

export const statusOption = (kind: ObservationKind, status: string) =>
  STATUS_OPTIONS[kind].find((o) => o.value === status) ?? { value: status, label: status, badge: "risk-badge-neutral" };

const locationKey = (o: Pick<Observation, "kind" | "location">) => `${o.kind}:${o.location.trim().toLowerCase()}`;

/** Ids of the newest observation of each location. `rows` must be newest first. */
export function latestObservationIds(rows: Observation[]): Set<number> {
  const seen = new Set<string>();
  const ids = new Set<number>();
  for (const row of rows) {
    const key = locationKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    ids.add(row.id);
  }
  return ids;
}

/** Older than this, a reading may no longer be true. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export const isStaleObservation = (row: Pick<Observation, "observed_at">, now: number) => now - new Date(row.observed_at).getTime() > STALE_AFTER_MS;

const REFRESH_MS = 60_000;

/**
 * Latest reading of each place in a barangay, newest first. The table has no
 * realtime, so it is read on open, when the tab comes back and once a minute.
 */
export function useGroundReports(barangay: string | null) {
  const [rows, setRows] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!barangay) return;
    let cancelled = false;
    setLoading(true);
    setRows([]);
    const load = async () => {
      try {
        const all = await listObservations(barangay);
        if (cancelled) return;
        const latest = latestObservationIds(all);
        setRows(all.filter((row) => latest.has(row.id)));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err && typeof err === "object" && "message" in err ? String(err.message) : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refreshIfVisible, REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [barangay, reloadKey]);

  return { rows, loading, error, reload };
}

const clean = (input: ObservationInput) => ({
  kind: input.kind,
  location: input.location.trim(),
  status: input.status,
  note: input.note.trim() || null,
});

export async function listObservations(barangay: string): Promise<Observation[]> {
  const { data, error } = await supabase
    .from("field_observations")
    .select(COLUMNS)
    .eq("barangay", barangay)
    .order("observed_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as Observation[];
}

export const OBSERVATION_PAGE = 200;

/** MDRRMO: every barangay, newest first. Empty filters show everything. */
export async function listAllObservations(filter: { barangay: string; kind: "" | ObservationKind }): Promise<Observation[]> {
  let query = supabase.from("field_observations").select(COLUMNS);
  if (filter.barangay) query = query.eq("barangay", filter.barangay);
  if (filter.kind) query = query.eq("kind", filter.kind);
  const { data, error } = await query.order("observed_at", { ascending: false }).limit(OBSERVATION_PAGE);
  if (error) throw error;
  return (data ?? []) as unknown as Observation[];
}

export async function createObservation(barangay: string, input: ObservationInput): Promise<void> {
  const { error } = await supabase.from("field_observations").insert({ barangay, ...clean(input) });
  if (error) throw error;
}

export async function updateObservation(id: number, input: ObservationInput): Promise<void> {
  const { data, error } = await supabase.from("field_observations").update(clean(input)).eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The database did not save the change (no permission for this observation).");
}

export async function deleteObservation(id: number): Promise<void> {
  const { data, error } = await supabase.from("field_observations").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The database did not delete it (no permission for this observation).");
}
