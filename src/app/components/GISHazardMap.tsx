import { useState, useEffect } from "react";
import { Map, Marker, Overlay } from "pigeon-maps";
import { WifiOff, Wifi, Layers, X, Droplets, AlertTriangle, Users, LocateFixed, Loader, Map as MapIcon, Clock } from "lucide-react";
import { nearestPlace, useLiveLocation, userLocationOverlays } from "./map/userLocation";
import { ClayButton, ClayCard, RiskBadge, ScreenHeader, type RiskLevel } from "./clay/Clay";
import { supabase } from "../../lib/supabase";
import { subscribeToTable } from "../../lib/realtime";
import { asRiskLevel, riskSourceLabel } from "../../lib/floodRisk";

type Zone = (typeof barangayData)[number] & { riskSource?: string | null };
type LiveRisk = { flood_risk: string | null; risk_source: string | null };

const RISK_COLORS: Record<RiskLevel, string> = {
  high: "var(--risk-high)",
  medium: "var(--risk-medium)",
  low: "var(--risk-low)",
};

// Real GIS coordinates for Odiongan barangays
const barangayData = [
  {
    id: 1,
    name: "Tuburan",
    lat: 12.4018,
    lng: 122.0234,
    floodRisk: "high",
    color: "var(--risk-high)",
    waterLevel: "2.8 meters",
    population: "1,234",
    evacuated: "45 families",
    lastUpdate: "10 mins ago",
    gpsLat: "12.4018",
    gpsLng: "122.0234",
    description: "Critical flood zone near river confluence. Water level rising rapidly due to upstream rainfall."
  },
  {
    id: 2,
    name: "Gabawan",
    lat: 12.3867,
    lng: 122.0189,
    floodRisk: "medium",
    color: "var(--risk-medium)",
    waterLevel: "1.5 meters",
    population: "892",
    evacuated: "12 families",
    lastUpdate: "25 mins ago",
    gpsLat: "12.3867",
    gpsLng: "122.0189",
    description: "Moderate flooding in low-lying areas. Creek overflow affecting residential zones."
  },
  {
    id: 3,
    name: "Ligaya",
    lat: 12.4123,
    lng: 122.0345,
    floodRisk: "low",
    color: "var(--risk-low)",
    waterLevel: "0.8 meters",
    population: "1,567",
    evacuated: "0 families",
    lastUpdate: "1 hour ago",
    gpsLat: "12.4123",
    gpsLng: "122.0345",
    description: "Minimal flooding, mostly surface water. Drainage system functioning normally."
  },
  {
    id: 4,
    name: "Luntad",
    lat: 12.3945,
    lng: 122.0156,
    floodRisk: "medium",
    color: "var(--risk-medium)",
    waterLevel: "1.7 meters",
    population: "743",
    evacuated: "8 families",
    lastUpdate: "45 mins ago",
    gpsLat: "12.3945",
    gpsLng: "122.0156",
    description: "Flash flood risk in agricultural areas. Roads partially submerged."
  },
  {
    id: 5,
    name: "Panique",
    lat: 12.4256,
    lng: 122.0412,
    floodRisk: "low",
    color: "var(--risk-low)",
    waterLevel: "0.5 meters",
    population: "2,103",
    evacuated: "0 families",
    lastUpdate: "1 hour 20 mins ago",
    gpsLat: "12.4256",
    gpsLng: "122.0412",
    description: "Stable water levels. Well-maintained drainage infrastructure preventing flooding."
  },
  {
    id: 6,
    name: "Poblacion",
    lat: 12.4089,
    lng: 122.0267,
    floodRisk: "medium",
    color: "var(--risk-medium)",
    waterLevel: "1.3 meters",
    population: "3,456",
    evacuated: "15 families",
    lastUpdate: "30 mins ago",
    gpsLat: "12.4089",
    gpsLng: "122.0267",
    description: "Urban flooding in downtown area. Blocked drainage causing water accumulation."
  },
  {
    id: 7,
    name: "Anahao",
    lat: 12.3789,
    lng: 122.0134,
    floodRisk: "high",
    color: "var(--risk-high)",
    waterLevel: "2.5 meters",
    population: "1,876",
    evacuated: "38 families",
    lastUpdate: "15 mins ago",
    gpsLat: "12.3789",
    gpsLng: "122.0134",
    description: "Severe flooding near coastal area. Storm surge contributing to water level rise."
  },
  {
    id: 8,
    name: "Bangon",
    lat: 12.4178,
    lng: 122.0289,
    floodRisk: "low",
    color: "var(--risk-low)",
    waterLevel: "0.6 meters",
    population: "987",
    evacuated: "0 families",
    lastUpdate: "2 hours ago",
    gpsLat: "12.4178",
    gpsLng: "122.0289",
    description: "Minor puddles on roads. Elevated terrain provides natural flood protection."
  },
  {
    id: 9,
    name: "Libertad",
    lat: 12.3912,
    lng: 122.0223,
    floodRisk: "medium",
    color: "var(--risk-medium)",
    waterLevel: "1.9 meters",
    population: "1,234",
    evacuated: "10 families",
    lastUpdate: "40 mins ago",
    gpsLat: "12.3912",
    gpsLng: "122.0223",
    description: "Riverside flooding affecting low-lying residential areas. Monitoring river levels closely."
  },
];

export function GISHazardMap() {
  const [offlineMode, setOfflineMode] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [selectedZone, setSelectedBarangay] = useState<Zone | null>(null);
  // Live flood_risk / risk_source from Supabase, keyed by barangay name.
  const [liveRisk, setLiveRisk] = useState<Record<string, LiveRisk>>({});
  const [mapCenter, setMapCenter] = useState<[number, number]>([12.4018, 122.0234]);
  const [zoom, setZoom] = useState(13);

  // Live user location: starts on "Locate me", then follows watchPosition.
  // Recenters (zoom 15) on the first fix and on each button press only.
  const location = useLiveLocation((fix) => {
    setMapCenter([fix.lat, fix.lng]);
    setZoom(15);
  });

  // Live risk levels: initial load plus realtime updates, so changes from the
  // 30-minute job or the MDRRMO rainfall simulation show up immediately.
  useEffect(() => {
    let cancelled = false;
    const apply = (rows: Array<LiveRisk & { name: string }>) =>
      setLiveRisk((current) => {
        const next = { ...current };
        for (const row of rows) next[row.name] = { flood_risk: row.flood_risk, risk_source: row.risk_source };
        return next;
      });

    void supabase
      .from("barangays")
      .select("name, flood_risk, risk_source")
      .then(({ data, error }) => {
        if (!cancelled && !error && data) apply(data as Array<LiveRisk & { name: string }>);
      });

    const unsubscribe = subscribeToTable("barangays", (payload) => {
      if (payload.eventType !== "UPDATE") return;
      apply([payload.new as LiveRisk & { name: string }]);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const zones: Zone[] = barangayData.map((zone) => {
    const live = liveRisk[zone.name];
    const risk = asRiskLevel(live?.flood_risk);
    if (!live) return zone;
    return {
      ...zone,
      ...(risk ? { floodRisk: risk, color: RISK_COLORS[risk] } : {}),
      riskSource: live.risk_source,
    };
  });
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
        <h2 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>Barangay Flood Zones (9 locations)</h2>
        <div className="space-y-3">
          {zones.map((zone) => (
            <ClayCard key={zone.id} radius={20} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold mb-1.5" style={{ color: "var(--text-primary)" }}>{zone.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge risk={zone.floodRisk as RiskLevel} compact />
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{zone.waterLevel}</span>
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

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <ClayCard radius={20} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets size={18} style={{ color: "var(--lavender-icon)" }} />
                    <p className="text-xs text-gray-600">Water Level</p>
                  </div>
                  <p className="text-lg font-bold">{selectedBarangay.waterLevel}</p>
                </ClayCard>

                <ClayCard radius={20} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users size={18} style={{ color: "var(--mint-icon)" }} />
                    <p className="text-xs text-gray-600">Population</p>
                  </div>
                  <p className="text-lg font-bold">{selectedBarangay.population}</p>
                </ClayCard>

                <ClayCard radius={20} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={18} style={{ color: "var(--peach-icon)" }} />
                    <p className="text-xs text-gray-600">Evacuated</p>
                  </div>
                  <p className="text-lg font-bold">{selectedBarangay.evacuated}</p>
                </ClayCard>

                <ClayCard radius={20} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={18} style={{ color: "var(--lavender-icon)" }} />
                    <p className="text-xs text-gray-600">Last Update</p>
                  </div>
                  <p className="text-lg font-bold">{selectedBarangay.lastUpdate}</p>
                </ClayCard>
              </div>

              {/* GPS Coordinates */}
              <div>
                <h3 className="text-sm mb-2">GPS Coordinates</h3>
                <div className="rounded-2xl border bg-white p-4">
                  <p className="text-sm text-gray-700 font-mono">
                    {selectedBarangay.gpsLat}, {selectedBarangay.gpsLng}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Latitude, Longitude
                  </p>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-sm mb-2">Situation Report</h3>
                <p className="text-sm text-gray-700 rounded-2xl border bg-white p-4">
                  {selectedBarangay.description}
                </p>
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
