/*
 * Helpers for showing community reports on the resident Home screen.
 */

export type ReportForMatching = {
  location: string | null;
  lat: number | null;
  lng: number | null;
};

export type BarangayPoint = { name: string; lat: number; lng: number };

const MATCH_RADIUS_METERS = 3000;

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

const normalize = (text: string) => text.toLowerCase().replace(/[\s-]+/g, "");

/**
 * Whether a report belongs to [barangay]. community_reports has no barangay
 * column yet, so this decides on the client (replace when one is added):
 *  1. With coordinates: the nearest barangay decides, if it is within 3 km.
 *  2. Otherwise: the location text contains the barangay name (case-insensitive,
 *     spaces and hyphens ignored).
 */
export function reportBelongsToBarangay(
  report: ReportForMatching,
  barangay: string,
  barangays: BarangayPoint[],
): boolean {
  if (report.lat != null && report.lng != null && barangays.length > 0) {
    let nearest: BarangayPoint | null = null;
    let nearestMeters = Infinity;
    for (const b of barangays) {
      const d = distanceMeters(report.lat, report.lng, b.lat, b.lng);
      if (d < nearestMeters) {
        nearest = b;
        nearestMeters = d;
      }
    }
    if (nearest && nearestMeters <= MATCH_RADIUS_METERS) {
      return normalize(nearest.name) === normalize(barangay);
    }
  }
  const wanted = normalize(barangay);
  return wanted.length > 0 && normalize(report.location ?? "").includes(wanted);
}

const WATER_LEVEL_LABELS: Record<string, string> = {
  ankle: "Ankle-deep",
  knee: "Knee-deep",
  waist: "Waist-deep",
  chest: "Chest-deep",
  overhead: "Over head",
};

export function waterLevelLabel(value: string | null | undefined): string {
  return (value && WATER_LEVEL_LABELS[value]) ?? "Water level unknown";
}

/** Never shows a full email: "juan.cruz@x.com" becomes "Juan.cruz". */
export function displayReporterName(userName: string | null | undefined): string {
  const raw = (userName ?? "").trim();
  if (!raw) return "Resident";
  const name = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : raw;
  if (!name) return "Resident";
  return name.charAt(0).toUpperCase() + name.slice(1);
}
