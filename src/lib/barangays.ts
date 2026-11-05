import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * The 25 official barangays of Odiongan, Romblon (PSA). Fallback for when the
 * barangays table cannot be read: guests on Quick Report and Register (RLS
 * allows authenticated reads only) and offline use. Screens use the helpers
 * below, never this list. Names must match barangays.name exactly.
 */
export const OFFICIAL_BARANGAYS: readonly string[] = [
  "Amatong",
  "Anahao",
  "Bangon",
  "Batiano",
  "Budiong",
  "Canduyong",
  "Dapawan",
  "Gabawan",
  "Libertad",
  "Ligaya",
  "Liwanag",
  "Liwayway",
  "Malilico",
  "Mayha",
  "Panique",
  "Pato-o",
  "Poctoy",
  "Progreso Este",
  "Progreso Weste",
  "Rizal",
  "Tabing Dagat",
  "Tabobo-an",
  "Tuburan",
  "Tulay",
  "Tumingad",
];

// One read per session. A failed or empty read (signed out, RLS returns no
// rows) is not cached, so the next caller, e.g. after sign-in, retries.
let cached: Promise<string[] | null> | null = null;

/** Barangay names from the table (order by name), or null when it cannot be read. */
export function loadBarangayNames(): Promise<string[] | null> {
  cached ??= Promise.resolve(supabase.from("barangays").select("name").order("name")).then(
    ({ data, error }) => {
      const names = error ? [] : ((data as { name: unknown }[] | null) ?? []).map((b) => String(b.name ?? "").trim()).filter(Boolean);
      if (names.length) return names;
      cached = null;
      return null;
    },
    () => {
      cached = null;
      return null;
    },
  );
  return cached;
}

/** Names from the table, or the official list until (or if never) the table is readable. */
export async function barangayNamesOrOfficial(): Promise<string[]> {
  return (await loadBarangayNames()) ?? [...OFFICIAL_BARANGAYS];
}

/** Barangay names for pickers: the official list at once, the table's list once loaded. */
export function useBarangayNames(enabled = true): string[] {
  const [names, setNames] = useState<string[]>(() => [...OFFICIAL_BARANGAYS]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadBarangayNames().then((loaded) => {
      if (!cancelled && loaded) setNames(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return names;
}
