import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { relativeTime, toTime } from "../../lib/barangayAdmin";
import { isStaleObservation, statusOption, useGroundReports } from "../../lib/fieldObservations";
import { STRINGS } from "../../lib/strings";

const T = STRINGS.ground;

/** "Reported on the ground": the latest reading of each place in one barangay. */
export function GroundReportsCard({ barangay, ownBarangay = false, className = "" }: { barangay: string | null; ownBarangay?: boolean; className?: string }) {
  const { rows, loading, error, reload } = useGroundReports(barangay);
  const [now, setNow] = useState(() => Date.now());

  // Times and the "out of date" mark stay current.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!barangay) return null;

  return (
    <section className={`clay space-y-3 p-4 ${className}`} aria-label={T.title}>
      <div className="flex items-start gap-2">
        <Eye size={20} className="mt-0.5 shrink-0" style={{ color: "var(--primary-shade)" }} aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-tight" style={{ color: "var(--text-primary)" }}>{T.title}</h2>
          <p className="break-words text-[13px]" style={{ color: "var(--text-secondary)" }}>{T.subtitle(barangay)}</p>
        </div>
      </div>
      {error ? (
        <div className="space-y-2">
          <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ color: "var(--text-primary)", borderLeft: "4px solid var(--risk-high)" }}>{T.loadFailed} {error}</p>
          <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={reload}>{T.retry}</button>
        </div>
      ) : loading ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{T.checking}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{ownBarangay ? T.none : T.noneFor(barangay)}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const stale = isStaleObservation(row, now);
            const textColor = stale ? "var(--text-secondary)" : "var(--text-primary)";
            return (
              <li key={row.id} className="rounded-2xl bg-white p-3" style={stale ? { background: "var(--nav-well)" } : undefined} data-stale={stale || undefined}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`risk-badge is-compact ${stale ? "risk-badge-neutral" : statusOption(row.kind, row.status).badge}`}>
                    {T.statuses[row.status] ?? row.status}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{T.kinds[row.kind] ?? row.kind}</span>
                </div>
                <p className="mt-1 break-words text-sm font-bold" style={{ color: textColor }}>{row.location}</p>
                {row.note && <p className="whitespace-pre-wrap break-words text-sm font-normal" style={{ color: textColor }}>{row.note}</p>}
                <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                  {relativeTime(toTime(row.observed_at), now)}
                  {stale && <span className="font-semibold"> · {T.outOfDate}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
