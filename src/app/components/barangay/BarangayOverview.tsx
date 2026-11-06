/* Overview tab: counts for the official's own barangay, from data the dashboard already holds. */

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="clay p-4">
      <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</p>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
    </div>
  );
}

export function BarangayOverview({
  barangay,
  residents,
  liveAlerts,
  communityReports,
  quickReports,
  pendingReports,
  level,
}: {
  barangay: string;
  residents: number | null;
  liveAlerts: number;
  communityReports: number;
  quickReports: number;
  pendingReports: number;
  level: string;
}) {
  return (
    <section aria-labelledby="barangay-overview-title" className="space-y-3">
      <h3 id="barangay-overview-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Overview of {barangay}</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile label="Barangay residents" value={residents === null ? "..." : String(residents)} />
        <Tile label="Live alerts" value={String(liveAlerts)} />
        <Tile label="Current level" value={level} />
        <Tile label="Community reports" value={String(communityReports)} />
        <Tile label="Quick reports" value={String(quickReports)} />
        <Tile label="Waiting for MDRRMO" value={String(pendingReports)} />
      </div>
    </section>
  );
}
