import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Map, Marker, Overlay } from "pigeon-maps";
import { WifiOff, Wifi, Layers, X, AlertTriangle, LocateFixed, Loader, Map as MapIcon, Clock, History } from "lucide-react";
import { nearestPlace, useLiveLocation, userLocationOverlays } from "./map/userLocation";
import { ClayButton, ClayCard, RiskBadge, ScreenHeader, type RiskLevel } from "./clay/Clay";
import { supabase } from "../../lib/supabase";
import { subscribeToTable } from "../../lib/realtime";
import { asRiskLevel, riskSourceLabel } from "../../lib/floodRisk";
import { formatManilaDateTime } from "../../lib/barangayAdmin";
import { useAuth } from "../../lib/auth";
import { useResidentAlerts, useResidentBarangay } from "../../lib/residentAlerts";
import { MapAlertBanner } from "./alerts/MapAlertBanner";
import { GroundReportsCard } from "./GroundReportsCard";

type RiskZone = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  floodRisk: RiskLevel;
  color: string;
  riskSource: string | null;
  lastUpdate: string | null;
};
type BarangayRow = {
  id: number;
  name: string;
  lat: number | null;
  lng: number | null;
  flood_risk: string | null;
  risk_source: string | null;
  last_update: string | null;
};

const RISK_COLORS: Record<RiskLevel, string> = {
  high: "var(--risk-high)",
  medium: "var(--risk-medium)",
  low: "var(--risk-low)",
};

const ZONE_COLUMNS = "id, name, lat, lng, flood_risk, risk_source, last_update";
/** Midpoint of the barangays; zoom 11.75 fits all of them (Panique to Progreso Weste) in the map. */
const ODIONGAN_CENTER: [number, number] = [12.415, 121.99];

function toZone(row: BarangayRow): RiskZone | null {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (row.lat == null || row.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const floodRisk = asRiskLevel(row.flood_risk) ?? "low";
  return {
    id: row.id,
    name: row.name,
    lat,
    lng,
    floodRisk,
    color: RISK_COLORS[floodRisk],
    riskSource: row.risk_source,
    lastUpdate: row.last_update,
  };
}

export function GISHazardMap() {
  const { session } = useAuth();
  const residentBarangay = useResidentBarangay(session?.user.id ?? null);
  const { alerts: currentAlerts } = useResidentAlerts(residentBarangay);
  const [offlineMode, setOfflineMode] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [selectedZone, setSelectedBarangay] = useState<RiskZone | null>(null);
  // Barangays from Supabase (name, coordinates, live flood_risk), keyed by id.
  const [rows, setRows] = useState<Record<number, BarangayRow>>({});
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [mapCenter, setMapCenter] = useState<[number, number]>(ODIONGAN_CENTER);
  const [zoom, setZoom] = useState(11.75);

  // Live user location: starts on "Locate me", then follows watchPosition.
  // Recenters (zoom 15) on the first fix and on each button press only.
  const location = useLiveLocation((fix) => {
    setMapCenter([fix.lat, fix.lng]);
    setZoom(15);
  });

  // Initial load plus realtime updates, so changes from the 30-minute job or
  // the MDRRMO rainfall simulation show up immediately.
  useEffect(() => {
    let cancelled = false;
    const apply = (list: BarangayRow[]) =>
      setRows((current) => {
        const next = { ...current };
        for (const row of list) next[row.id] = { ...next[row.id], ...row };
        return next;
      });

    setLoadState("loading");
    void supabase
      .from("barangays")
      .select(ZONE_COLUMNS)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.length) {
          setLoadState("error");
          return;
        }
        apply(data as BarangayRow[]);
        setLoadState("ready");
      });

    const unsubscribe = subscribeToTable("barangays", (payload) => {
      if (payload.eventType === "DELETE") {
        const id = (payload.old as Partial<BarangayRow>).id;
        if (id != null) setRows(({ [id]: _removed, ...rest }) => rest);
        return;
      }
      apply([payload.new as BarangayRow]);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [reloadKey]);

  const zones = Object.values(rows)
    .map(toZone)
    .filter((z): z is RiskZone => z !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const selectedBarangay = selectedZone ? zones.find((z) => z.id === selectedZone.id) ?? selectedZone : null;
  const nearZone = nearestPlace(location.fix, zones);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "high": return "var(--risk-high)";
      case "medium": return "var(--risk-medium)";
      case "low": return "var(--risk-low)";
      default: return "var(--primary)";
    }
  };

  const getRiskLabel = (risk: string) => {
    switch (risk) {
      case "high": return "High Risk";
      case "medium": return "Medium Risk";
      case "low": return "Low Risk";
      default: return "Safe";
    }
  };

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between pr-[18px]">
        <ScreenHeader title="GIS Hazard Map" subtitle="OpenStreetMap • Odiongan flood zones" icon={MapIcon} pastel="lavender" />
          <button
            onClick={() => setOfflineMode(!offlineMode)}
            className="clay clay-press flex min-h-12 shrink-0 items-center gap-2 px-4 text-sm font-semibold"
            style={{ borderRadius: 24, color: "var(--text-primary)" }}
          >
            {offlineMode ? (
              <>
                <WifiOff size={16} />
                Offline
              </>
            ) : (
              <>
                <Wifi size={16} />
                Online
              </>
            )}
          </button>
      </div>

      <MapAlertBanner alerts={currentAlerts} />

      {/* Past floods from verified reports */}
      <div className="px-[18px] mb-3">
        <Link to="/map/history" className="clay-btn clay-btn-secondary w-full">
          <History size={20} aria-hidden="true" />
          Baha History
        </Link>
      </div>

      {/* OpenStreetMap Container: map sits inside a clay frame */}
      <div className="clay relative mx-[18px] p-1.5" style={{ borderRadius: 26 }}>
        <div className="h-96 overflow-hidden" style={{ borderRadius: 20 }}>
          <Map
            center={mapCenter}
            zoom={zoom}
            onBoundsChanged={({ center, zoom }) => {
              setMapCenter(center);
              setZoom(zoom);
            }}
            attributionPrefix={false}
          >
            {/* Barangay Markers */}
            {zones.map((barangay) => (
              <Marker
                key={barangay.id}
                anchor={[barangay.lat, barangay.lng]}
                color={barangay.color}
                onClick={() => setSelectedBarangay(barangay)}
              />
            ))}

            {/* Flood Zone Circles using Overlays */}
            {zones.map((barangay) => (
              <Overlay
                key={`circle-${barangay.id}`}
                anchor={[barangay.lat, barangay.lng]}
                offset={[0, 0]}
              >
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    backgroundColor: barangay.color,
                    opacity: 0.3,
                    border: `2px solid ${barangay.color}`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              </Overlay>
            ))}

            {/* Live user location: accuracy circle + pulsing dot (drawn last, on top) */}
            {userLocationOverlays(location.fix, zoom)}
          </Map>
        </div>

        {/* Map Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
          <button
            onClick={() => setShowLegend(!showLegend)}
            aria-label="Toggle legend"
            title="Toggle legend"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md"
          >
            <Layers size={20} style={{ color: "var(--primary-brand)" }} />
          </button>
        </div>

        {/* Where am I: nearest barangay, accuracy and errors */}
        {(nearZone || location.error) && (
          <div className="absolute top-4 left-4 right-20 z-10 flex flex-col items-start gap-1.5" aria-live="polite">
            {nearZone && (
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold shadow-md" style={{ color: "var(--text-primary)" }}>
                You are near {nearZone.name} · {nearZone.floodRisk.charAt(0).toUpperCase() + nearZone.floodRisk.slice(1)} risk
              </span>
            )}
            {location.fix && location.fix.accuracy > 100 && (
              <span className="rounded-full bg-white px-3 py-1 text-xs shadow-md" style={{ color: "var(--text-secondary)" }}>
                Approximate location (±{Math.round(location.fix.accuracy)} m)
              </span>
            )}
            {location.error && (
              <span role="alert" className="bg-white px-3 py-2 text-xs shadow-md" style={{ color: "var(--text-primary)", borderLeft: "4px solid var(--risk-high)" }}>
                {location.error}
              </span>
            )}
          </div>
        )}

        {/* Locate me */}
        <button
          type="button"
          onClick={location.locate}
          aria-label="Locate me"
          title="Locate me"
          className="absolute bottom-10 right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md"
        >
          {location.locating ? (
            <Loader size={20} className="animate-spin" style={{ color: "var(--primary-brand)" }} aria-hidden="true" />
          ) : (
            <LocateFixed size={20} style={{ color: "var(--primary-brand)" }} aria-hidden="true" />
          )}
        </button>

        {/* Legend */}
        {showLegend && (
          <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg p-4 z-10">
            <h3 className="text-sm font-bold mb-3" style={{ color: "var(--text-primary)" }}>Flood Risk Levels</h3>
            <div className="flex flex-col items-start gap-2">
              <RiskBadge risk="high" compact />
              <RiskBadge risk="medium" compact />
              <RiskBadge risk="low" compact />
            </div>
          </div>
        )}
      </div>

      <p className="mx-[18px] mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        Danger zones update automatically every 30 minutes from rainfall forecasts.
      </p>

      {/* Barangay List */}
      <div className="px-[18px] py-6">
        <h2 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>
          Barangay Flood Zones{zones.length > 0 && ` (${zones.length} barangays)`}
        </h2>
        {loadState === "loading" && zones.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading barangays...</p>
        )}
        {loadState === "error" && zones.length === 0 && (
          <div role="alert" className="clay flex items-center justify-between gap-3 p-4 text-sm" style={{ color: "var(--text-primary)" }}>
            <span>Unable to load the barangay flood zones. Check your connection.</span>
            <ClayButton variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>Retry</ClayButton>
          </div>
        )}
        <div className="space-y-3">
          {zones.map((zone) => (
            <ClayCard key={zone.id} radius={20} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold mb-1.5" style={{ color: "var(--text-primary)" }}>{zone.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge risk={zone.floodRisk} compact />
                </div>
                {riskSourceLabel(zone.riskSource) && (
                  <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{riskSourceLabel(zone.riskSource)}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedBarangay(zone);
                  setMapCenter([zone.lat, zone.lng]);
                  setZoom(15);
                }}
                className="min-h-12 shrink-0 rounded-full px-4 text-sm font-semibold hover:bg-white"
                style={{ color: "var(--primary-shade)" }}
              >
                View
              </button>
            </ClayCard>
          ))}
        </div>
      </div>

      {/* Barangay Detail Modal */}
      {selectedBarangay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end md:items-center justify-center">
          <div className="w-full max-w-lg rounded-t-[28px] md:rounded-[28px] max-h-[90vh] overflow-y-auto" style={{ background: "var(--clay-bg)" }}>
            {/* Modal Header */}
            <div className="sticky top-0 border-b border-gray-200 px-6 py-4 flex items-center justify-between" style={{ background: "var(--clay-bg)" }}>
              <div>
                <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{selectedBarangay.name}</h2>
                <p className="text-sm text-gray-500">Flood Zone Details</p>
              </div>
              <button
                onClick={() => setSelectedBarangay(null)}
                aria-label="Close"
                className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-white"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Risk level banner: solid, high contrast, always labelled. Never clay. */}
              <div className={`risk-badge risk-badge-${selectedBarangay.floodRisk} w-full gap-3 p-4 whitespace-normal`} style={{ borderRadius: 12 }}>
                <AlertTriangle size={32} aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">Current Risk Level</p>
                  <p className="text-xl font-bold capitalize">{selectedBarangay.floodRisk} Risk</p>
                  {riskSourceLabel(selectedBarangay.riskSource) && (
                    <p className="text-xs font-medium">{riskSourceLabel(selectedBarangay.riskSource)}</p>
                  )}
                </div>
              </div>

              <ClayCard radius={20} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={18} style={{ color: "var(--lavender-icon)" }} />
                  <p className="text-xs text-gray-600">Last Update</p>
                </div>
                <p className="text-lg font-bold">{formatManilaDateTime(selectedBarangay.lastUpdate)}</p>
              </ClayCard>

              <GroundReportsCard barangay={selectedBarangay.name} ownBarangay={selectedBarangay.name === residentBarangay} />

              {/* GPS Coordinates */}
              <div>
                <h3 className="text-sm mb-2">GPS Coordinates</h3>
                <div className="rounded-2xl border bg-white p-4">
                  <p className="text-sm text-gray-700 font-mono">
                    {selectedBarangay.lat.toFixed(4)}, {selectedBarangay.lng.toFixed(4)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Latitude, Longitude (approximate barangay centre)
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <ClayButton className="w-full">View Live Updates</ClayButton>
                <ClayButton variant="secondary" className="w-full">Contact Barangay Officials</ClayButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
