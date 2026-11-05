import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useBarangayNames } from "../../lib/barangays";
import { errorMessage, relativeTime, toTime } from "../../lib/barangayAdmin";
import {
  KIND_LABELS,
  OBSERVATION_PAGE,
  deleteObservation,
  listAllObservations,
  statusOption,
  type Observation,
  type ObservationKind,
} from "../../lib/fieldObservations";

/* MDRRMO: read-only list of every barangay's observations. A wrong entry can be deleted. */
export function MdrrmoObservations({ now }: { now: number }) {
  const barangays = useBarangayNames();
  const [barangay, setBarangay] = useState("");
  const [kind, setKind] = useState<"" | ObservationKind>("");
  const [rows, setRows] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listAllObservations({ barangay, kind }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unable to load the observations."));
    } finally {
      setLoading(false);
    }
  }, [barangay, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (row: Observation) => {
    if (!window.confirm(`Delete this observation of ${row.location} (${row.barangay})? This cannot be undone.`)) return;
    setBusyId(row.id);
    try {
      await deleteObservation(row.id);
      setError(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Unable to delete the observation."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Field Observations</h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>What barangay officials report from the ground, newest first.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="clay-label">Barangay</span>
          <select className="clay-input" value={barangay} onChange={(e) => setBarangay(e.target.value)}>
            <option value="">All barangays</option>
            {barangays.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="clay-label">Kind</span>
          <select className="clay-input" value={kind} onChange={(e) => setKind(e.target.value as "" | ObservationKind)}>
            <option value="">All kinds</option>
            {(Object.keys(KIND_LABELS) as ObservationKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ color: "var(--text-primary)", borderLeft: "4px solid var(--risk-high)" }}>{error}</p>
      )}
      {loading && rows.length === 0 ? (
        <div className="clay h-24 animate-pulse" aria-busy="true" />
      ) : rows.length === 0 ? (
        !error && <div className="clay p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No observations match these filters.</div>
      ) : (
        <>
          <ul className="space-y-3" aria-busy={loading}>
            {rows.map((row) => {
              const status = statusOption(row.kind, row.status);
              return (
                <li key={row.id} id={`mdrrmo-observation-${row.id}`} className="clay space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`risk-badge is-compact ${status.badge}`}>{status.label}</span>
                    <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{KIND_LABELS[row.kind]} · {row.barangay}</span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>· {relativeTime(toTime(row.observed_at), now)}</span>
                  </div>
                  <p className="break-words text-sm font-bold" style={{ color: "var(--text-primary)" }}>{row.location}</p>
                  {row.note && <p className="whitespace-pre-wrap break-words text-sm font-normal" style={{ color: "var(--text-primary)" }}>{row.note}</p>}
                  <button
                    type="button"
                    className="clay-btn clay-btn-secondary text-sm"
                    disabled={busyId === row.id}
                    aria-label={`Delete observation of ${row.location} in ${row.barangay}`}
                    onClick={() => void remove(row)}
                  >
                    <Trash2 size={16} aria-hidden="true" /> Delete
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length === OBSERVATION_PAGE && (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Showing the newest {OBSERVATION_PAGE}. Use the filters to narrow the list.</p>
          )}
        </>
      )}
    </div>
  );
}
