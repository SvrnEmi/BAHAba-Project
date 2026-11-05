import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader, Pencil, Save, Send, Trash2 } from "lucide-react";
import { errorMessage, relativeTime, toTime } from "../../../lib/barangayAdmin";
import {
  KIND_LABELS,
  LOCATION_MAX,
  LOCATION_MIN,
  NOTE_MAX,
  STATUS_OPTIONS,
  createObservation,
  deleteObservation,
  latestObservationIds,
  listObservations,
  statusOption,
  updateObservation,
  type Observation,
  type ObservationInput,
  type ObservationKind,
} from "../../../lib/fieldObservations";

/* Field Observations: post, edit and delete what is seen on the ground in the official's own barangay. */

const emptyForm = (): ObservationInput => ({ kind: "waterway", location: "", status: STATUS_OPTIONS.waterway[0].value, note: "" });

type Notice = { kind: "ok" | "error"; text: string };

function NoticeLine({ notice }: { notice: Notice }) {
  return (
    <p
      role={notice.kind === "error" ? "alert" : "status"}
      className="bg-white px-3 py-2 text-sm"
      style={{ color: "var(--text-primary)", borderLeft: `4px solid ${notice.kind === "error" ? "var(--risk-high)" : "var(--risk-low)"}` }}
    >
      {notice.text}
    </p>
  );
}

export function BarangayObservations({ barangay, now }: { barangay: string; now: number }) {
  const [rows, setRows] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<ObservationInput>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setRows(await listObservations(barangay));
    } catch (err) {
      setLoadError(errorMessage(err, "Unable to load the observations."));
    } finally {
      setLoading(false);
    }
  }, [barangay]);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = useMemo(() => latestObservationIds(rows), [rows]);

  const setKind = (kind: ObservationKind) =>
    // A status from the other kind would be refused by the database.
    setForm((f) => ({ ...f, kind, status: STATUS_OPTIONS[kind][0].value }));

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const submit = async () => {
    const location = form.location.trim();
    if (location.length < LOCATION_MIN) {
      setNotice({ kind: "error", text: `Enter a location of at least ${LOCATION_MIN} characters.` });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      if (editingId === null) await createObservation(barangay, form);
      else await updateObservation(editingId, form);
      setNotice({ kind: "ok", text: editingId === null ? "Observation posted." : "Observation updated." });
      resetForm();
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, "Unable to save the observation.") });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: Observation) => {
    setEditingId(row.id);
    setForm({ kind: row.kind, location: row.location, status: row.status, note: row.note ?? "" });
    setNotice(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const remove = async (row: Observation) => {
    if (!window.confirm(`Delete this observation of ${row.location}? This cannot be undone.`)) return;
    setBusyId(row.id);
    setNotice(null);
    try {
      await deleteObservation(row.id);
      if (editingId === row.id) resetForm();
      setNotice({ kind: "ok", text: "Observation deleted." });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, "Unable to delete the observation.") });
    } finally {
      setBusyId(null);
    }
  };

  /** One tap: a new reading for the same place, keeping the earlier ones as history. */
  const postReading = async (row: Observation, status: string) => {
    setBusyId(row.id);
    setNotice(null);
    try {
      await createObservation(barangay, { kind: row.kind, location: row.location, status, note: "" });
      setNotice({ kind: "ok", text: `${row.location} is now ${statusOption(row.kind, status).label}.` });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, "Unable to post the reading.") });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <form
        ref={formRef}
        className="clay space-y-4 p-5"
        aria-labelledby="observation-form-title"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <h3 id="observation-form-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            {editingId === null ? "Field Observations" : "Edit observation"}
          </h3>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Record what you see at creeks, rivers and roads in {barangay}.</p>
        </div>
        <label className="block">
          <span className="clay-label">Barangay</span>
          <input className="clay-input opacity-70" value={barangay} readOnly aria-readonly="true" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="clay-label">Kind</span>
            <select className="clay-input" value={form.kind} onChange={(e) => setKind(e.target.value as ObservationKind)} disabled={saving}>
              {(Object.keys(KIND_LABELS) as ObservationKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="clay-label">Status</span>
            <select className="clay-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} disabled={saving}>
              {STATUS_OPTIONS[form.kind].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="clay-label">Location</span>
          <input
            className="clay-input"
            value={form.location}
            maxLength={LOCATION_MAX}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder={`e.g., ${barangay} creek`}
            disabled={saving}
          />
        </label>
        <label className="block">
          <span className="clay-label">Note (optional)</span>
          <textarea className="clay-input min-h-20" value={form.note} maxLength={NOTE_MAX} onChange={(e) => setForm({ ...form, note: e.target.value })} disabled={saving} />
          <span className="mt-1 block text-right text-xs" style={{ color: "var(--text-secondary)" }}>{form.note.length}/{NOTE_MAX}</span>
        </label>
        {notice && <NoticeLine notice={notice} />}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" className="clay-btn clay-btn-primary" disabled={saving}>
            {saving ? <Loader size={18} className="animate-spin" aria-hidden="true" /> : editingId === null ? <Send size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
            {saving ? "Saving..." : editingId === null ? "Post observation" : "Save changes"}
          </button>
          {editingId !== null && (
            <button type="button" className="clay-btn clay-btn-secondary" onClick={resetForm} disabled={saving}>Cancel</button>
          )}
        </div>
      </form>

      <section aria-labelledby="observation-list-title" className="space-y-3">
        <h3 id="observation-list-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          Observations in {barangay} ({rows.length})
        </h3>
        {loadError ? (
          <div className="space-y-2">
            <NoticeLine notice={{ kind: "error", text: `Could not load the observations: ${loadError}` }} />
            <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={() => void load()}>Try again</button>
          </div>
        ) : loading ? (
          <div className="clay h-24 animate-pulse" aria-busy="true" />
        ) : rows.length === 0 ? (
          <div className="clay p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No observations yet. Post what you see on the ground.</div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => {
              const current = statusOption(row.kind, row.status);
              const busy = busyId === row.id;
              return (
                <li key={row.id} id={`observation-${row.id}`} className="clay space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`risk-badge is-compact ${current.badge}`}>{current.label}</span>
                    <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{KIND_LABELS[row.kind]}</span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>· {relativeTime(toTime(row.observed_at), now)}</span>
                  </div>
                  <p className="break-words text-sm font-bold" style={{ color: "var(--text-primary)" }}>{row.location}</p>
                  {row.note && <p className="whitespace-pre-wrap break-words text-sm font-normal" style={{ color: "var(--text-primary)" }}>{row.note}</p>}
                  {latest.has(row.id) && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Update status:</span>
                      {STATUS_OPTIONS[row.kind].filter((o) => o.value !== row.status).map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className="clay-btn clay-btn-secondary text-sm"
                          disabled={busy}
                          aria-label={`Update ${row.location} to ${o.label}`}
                          onClick={() => void postReading(row, o.value)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={busy} aria-label={`Edit observation of ${row.location}`} onClick={() => startEdit(row)}>
                      <Pencil size={16} aria-hidden="true" /> Edit
                    </button>
                    <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={busy} aria-label={`Delete observation of ${row.location}`} onClick={() => void remove(row)}>
                      <Trash2 size={16} aria-hidden="true" /> Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
