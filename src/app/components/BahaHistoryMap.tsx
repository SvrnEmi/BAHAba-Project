import { useEffect, useMemo, useState } from "react";
import { Map, Overlay } from "pigeon-maps";
import { Droplet, X } from "lucide-react";
import { WATER_LABELS, WATER_LEVELS } from "../../lib/bahaCountdown";
import {
  eventRange,
  fetchFloodEvents,
  fetchFloodHistory,
  formatDayTime,
  historyPhotoUrl,
  type FloodEvent,
  type HistoryReport,
} from "../../lib/floodHistory";
import { WATER_COLOR, WaterLevelIcon } from "./WaterLevelIcon";

const ODIONGAN: [number, number] = [12.4018, 122.0234];

/** Center and zoom that fit every report (rough, no map size needed). */
function fit(reports: HistoryReport[]): { center: [number, number]; zoom: number } {
  if (!reports.length) return { center: ODIONGAN, zoom: 13 };
  const lats = reports.map((r) => r.lat);
  const lngs = reports.map((r) => r.lng);
  const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
  const zoom = span < 0.002 ? 16 : Math.max(10, Math.min(16, Math.floor(Math.log2(360 / span)) - 1));
  return { center: [(Math.max(...lats) + Math.min(...lats)) / 2, (Math.max(...lngs) + Math.min(...lngs)) / 2], zoom };
}

/**
 * Baha History: where flooding actually happened, from approved community
 * and quick reports, colored by water level and filtered by flood event.
 * Data comes from flood_history(), which never returns reporter details.
 */
export function BahaHistoryMap({ eventId: initialEventId = null, events: eventsProp }: { eventId?: number | null; events?: FloodEvent[] }) {
  const [loadedEvents, setLoadedEvents] = useState<FloodEvent[]>([]);
  const events = eventsProp ?? loadedEvents;
  const [eventId, setEventId] = useState<number | null>(initialEventId);
  const [reports, setReports] = useState<HistoryReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HistoryReport | null>(null);
  const [view, setView] = useState(() => fit([]));
  const [retry, setRetry] = useState(0);

  useEffect(() => setEventId(initialEventId), [initialEventId]);

  useEffect(() => {
    if (eventsProp) return;
    let cancelled = false;
    fetchFloodEvents()
      .then((rows) => !cancelled && setLoadedEvents(rows))
      .catch((e) => console.error("Flood events unavailable:", e));
    return () => {
      cancelled = true;
    };
  }, [eventsProp]);

  useEffect(() => {
    let cancelled = false;
    setReports(null);
    setError(null);
    setSelected(null);
    fetchFloodHistory(eventId)
      .then((rows) => {
        if (cancelled) return;
        setReports(rows);
        setView(fit(rows));
      })
      .catch((e) => {
        console.error("Baha history failed:", e);
        if (!cancelled) setError("Could not load flood history. Check your connection.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, retry]);

  const event = events.find((e) => e.id === eventId) ?? null;
  // Deepest last, so it draws on top.
  const sorted = useMemo(
    () => [...(reports ?? [])].sort((a, b) => WATER_LEVELS.indexOf(a.water_level) - WATER_LEVELS.indexOf(b.water_level)),
    [reports],
  );
  const count = reports?.length ?? 0;

  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text-primary)" }} htmlFor="baha-event">
        Flood event
      </label>
      <select
        id="baha-event"
        className="clay-input min-h-12 w-full px-3 text-[15px]"
        value={eventId ?? ""}
        onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">All verified reports</option>
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name} ({eventRange(e)})
          </option>
        ))}
      </select>
      <p className="mt-2 mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }} aria-live="polite">
        {reports == null && !error
          ? "Loading reports..."
          : `${count} verified ${count === 1 ? "report" : "reports"}${event ? ` - ${eventRange(event)}` : ""}`}
      </p>

      <div className="clay relative p-1.5" style={{ borderRadius: 26 }}>
        <div className="h-[26rem] overflow-hidden" style={{ borderRadius: 20 }}>
          <Map
            center={view.center}
            zoom={view.zoom}
            onBoundsChanged={({ center, zoom }) => setView({ center, zoom })}
            attributionPrefix={false}
          >
            {sorted.map((r) => (
              <Overlay key={`${r.source}-${r.report_id}`} anchor={[r.lat, r.lng]} offset={[24, 24]}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  aria-label={`${WATER_LABELS.en[r.water_level]} flood report, ${formatDayTime(r.reported_at)}`}
                  className="flex h-12 w-12 items-center justify-center"
                >
                  <span
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-white"
                    style={{ background: WATER_COLOR[r.water_level], border: "3px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.35)" }}
                  >
                    <Droplet size={14} fill="currentColor" aria-hidden="true" />
                  </span>
                </button>
              </Overlay>
            ))}
          </Map>
        </div>

        {(error || (reports && reports.length === 0)) && (
          <div className="absolute top-4 left-4 right-4 z-10 flex items-center gap-3 rounded-xl bg-white px-4 py-2.5 text-sm shadow-md" role="status">
            <span className="flex-1" style={{ color: "var(--text-primary)" }}>
              {error ?? (event ? `No verified reports during ${event.name}.` : "No verified flood reports yet.")}
            </span>
            {error && (
              <button type="button" className="min-h-12 px-2 font-semibold" style={{ color: "var(--primary-shade)" }} onClick={() => setRetry((n) => n + 1)}>
                Retry
              </button>
            )}
          </div>
        )}

        {selected && <ReportDetail report={selected} onClose={() => setSelected(null)} />}
      </div>

      {/* Legend: same water level scale as reports */}
      <div className="clay mt-3 grid grid-cols-5 gap-1 px-2 py-2.5" style={{ borderRadius: 18 }}>
        {WATER_LEVELS.map((level) => (
          <div key={level} className="flex flex-col items-center text-center">
            <WaterLevelIcon level={level} size={30} />
            <span className="mt-1 text-xs leading-tight" style={{ color: "var(--text-primary)" }}>
              {WATER_LABELS.en[level]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Water level, date, barangay and photo. Nothing about the reporter. */
function ReportDetail({ report, onClose }: { report: HistoryReport; onClose: () => void }) {
  const [photo, setPhoto] = useState<string | null | undefined>(report.photo_path ? undefined : null);

  useEffect(() => {
    let cancelled = false;
    if (!report.photo_path) return;
    setPhoto(undefined);
    historyPhotoUrl(report).then((url) => !cancelled && setPhoto(url));
    return () => {
      cancelled = true;
    };
  }, [report]);

  return (
    <div className="absolute bottom-3 left-3 right-3 z-20 max-h-[85%] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-label="Flood report">
      <div className="flex items-start gap-3">
        <WaterLevelIcon level={report.water_level} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold" style={{ color: WATER_COLOR[report.water_level] }}>
            {WATER_LABELS.en[report.water_level]}
          </p>
          <p className="text-[15px]" style={{ color: "var(--text-primary)" }}>
            {formatDayTime(report.reported_at)}
          </p>
          {report.barangay && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Brgy. {report.barangay}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3">
        {photo === undefined ? (
          <div className="h-48 animate-pulse rounded-xl motion-reduce:animate-none" style={{ background: "var(--border)" }} />
        ) : photo ? (
          <img src={photo} alt="Photo of the flooding" loading="lazy" className="max-h-64 w-full rounded-xl object-cover" />
        ) : (
          <p className="rounded-xl px-3 py-4 text-center text-sm" style={{ background: "var(--clay-bg, #EFF4FA)", color: "var(--text-secondary)" }}>
            No photo for this report
          </p>
        )}
      </div>
    </div>
  );
}
