import { useCallback, useEffect, useState } from "react";
import { Map as MapIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { ClayButton } from "./clay/Clay";
import { BahaHistoryMap } from "./BahaHistoryMap";
import { FloodEventReport } from "./FloodEventReport";
import { errorMessage } from "../../lib/barangayAdmin";
import { deleteFloodEvent, fetchFloodEvents, formatDayTime, saveFloodEvent, type FloodEvent } from "../../lib/floodHistory";

/** ISO string to a datetime-local value in the browser's time zone. */
function toInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Draft = { id?: number; name: string; start: string; end: string };
const emptyDraft = (): Draft => ({
  name: "",
  start: toInput(new Date(Date.now() - 86_400_000).toISOString()),
  end: toInput(new Date().toISOString()),
});

/**
 * MDRRMO: name flood events (e.g. "Typhoon Obet") so the Baha History map can
 * group approved reports by time. Every change is audit-logged by the database.
 */
export function FloodEventsPanel() {
  const [events, setEvents] = useState<FloodEvent[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [mapEvent, setMapEvent] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setEvents(await fetchFloodEvents());
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e, "Could not load flood events.") });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const start = new Date(draft.start);
    const end = new Date(draft.end);
    if (!name || name.length > 80) return setMessage({ kind: "error", text: "Enter a name (up to 80 characters)." });
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start)
      return setMessage({ kind: "error", text: "End must be after start." });
    setSaving(true);
    try {
      await saveFloodEvent({ id: draft.id, name, start, end });
      setMessage({ kind: "ok", text: draft.id ? "Flood event updated." : "Flood event created." });
      setDraft(null);
      await load();
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e, "Could not save the flood event.") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (event: FloodEvent) => {
    if (!window.confirm(`Delete "${event.name}"? Reports are not deleted.`)) return;
    try {
      await deleteFloodEvent(event.id);
      setMessage({ kind: "ok", text: "Flood event deleted." });
      if (mapEvent === event.id) setMapEvent(null);
      await load();
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e, "Could not delete the flood event.") });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <section>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            Flood Events
          </h2>
          {!draft && (
            <ClayButton icon={Plus} onClick={() => setDraft(emptyDraft())}>
              New event
            </ClayButton>
          )}
        </div>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Approved reports made between the start and end time appear under the event on the Baha History map.
        </p>

        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className="mb-3 rounded-lg px-3 py-2 text-sm"
            style={{
              color: "var(--text-primary)",
              borderLeft: `4px solid ${message.kind === "error" ? "var(--risk-high)" : "var(--risk-low)"}`,
              background: "#fff",
            }}
          >
            {message.text}
          </p>
        )}

        {draft && (
          <form
            className="clay mb-4 grid gap-3 p-4"
            style={{ borderRadius: 20 }}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Name
              <input
                className="clay-input min-h-12 px-3 font-normal"
                maxLength={80}
                placeholder="e.g. Typhoon Obet"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Start
              <input
                type="datetime-local"
                className="clay-input min-h-12 px-3 font-normal"
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              End
              <input
                type="datetime-local"
                className="clay-input min-h-12 px-3 font-normal"
                value={draft.end}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <ClayButton type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </ClayButton>
              <ClayButton variant="secondary" onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </ClayButton>
            </div>
          </form>
        )}

        {events == null ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading flood events...
          </p>
        ) : events.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            No flood events yet.
          </p>
        ) : (
          <ul className="grid gap-3">
            {events.map((e) => (
              <li key={e.id} className="rounded-xl border border-border bg-white p-3">
                <p className="font-bold" style={{ color: "var(--text-primary)" }}>
                  {e.name}
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {formatDayTime(e.start_at)} - {formatDayTime(e.end_at)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(
                    [
                      ["View map", MapIcon, () => setMapEvent(e.id)],
                      ["Edit", Pencil, () => setDraft({ id: e.id, name: e.name, start: toInput(e.start_at), end: toInput(e.end_at) })],
                      ["Delete", Trash2, () => void remove(e)],
                    ] as const
                  ).map(([label, Icon, onClick]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={onClick}
                      className="flex min-h-12 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold"
                      style={{ color: label === "Delete" ? "var(--risk-high)" : "var(--primary-shade)" }}
                    >
                      <Icon size={16} aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
                <FloodEventReport event={e} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3" style={{ color: "var(--text-primary)" }}>
          Baha History map
        </h2>
        <BahaHistoryMap eventId={mapEvent} events={events ?? []} />
      </section>
    </div>
  );
}
