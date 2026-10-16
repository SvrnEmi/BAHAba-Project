import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "../../styles/leaflet.css";
import { WifiOff, Wifi, Layers, X, Droplets, AlertTriangle, Users, Navigation } from "lucide-react";

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Real GIS coordinates for Odiongan barangays
const barangayData = [
  {
    id: 1,
    name: "Tuburan",
    lat: 12.4018,
    lng: 122.0234,
    floodRisk: "high",
    color: "#ef4444",
    radius: 800,
    waterLevel: "2.8 meters",
    population: "1,234",
    evacuated: "45 families",
    lastUpdate: "10 mins ago",
    description: "Critical flood zone near river confluence. Water level rising rapidly due to upstream rainfall.",
    riskZones: [
      { level: "Critical", area: "Near Odiongan River", households: 45 },
      { level: "High", area: "Low-lying residential", households: 89 },
      { level: "Moderate", area: "Elevated areas", households: 156 }
    ]
  },
  {
    id: 2,
    name: "Gabawan",
    lat: 12.3867,
    lng: 122.0189,
    floodRisk: "medium",
    color: "#eab308",
    radius: 700,
    waterLevel: "1.5 meters",
    population: "892",
    evacuated: "12 families",
    lastUpdate: "25 mins ago",
    description: "Moderate flooding in low-lying areas. Creek overflow affecting residential zones.",
    riskZones: [
      { level: "High", area: "Creek vicinity", households: 34 },
      { level: "Moderate", area: "Central barangay", households: 67 },
      { level: "Low", area: "Upland areas", households: 98 }
    ]
  },
  {
    id: 3,
    name: "Libertad",
    lat: 12.4156,
    lng: 122.0312,
    floodRisk: "low",
    color: "#22c55e",
    radius: 600,
    waterLevel: "0.5 meters",
    population: "1,045",
    evacuated: "0 families",
    lastUpdate: "1 hour ago",
    description: "Minimal flooding, mostly surface water. Drainage system functioning normally.",
    riskZones: [
      { level: "Low", area: "All areas", households: 234 },
      { level: "Safe", area: "Elevated zones", households: 156 }
    ]
  },
  {
    id: 4,
    name: "Panique",
    lat: 12.3945,
    lng: 122.0278,
    floodRisk: "medium",
    color: "#eab308",
    radius: 650,
    waterLevel: "1.2 meters",
    population: "743",
    evacuated: "8 families",
    lastUpdate: "45 mins ago",
    description: "Flash flood risk in agricultural areas. Roads partially submerged.",
    riskZones: [
      { level: "High", area: "Rice fields", households: 23 },
      { level: "Moderate", area: "Main road", households: 45 },
      { level: "Low", area: "Residential", households: 89 }
    ]
  },
  {
    id: 5,
    name: "Poctoy",
    lat: 12.4089,
    lng: 122.0156,
    floodRisk: "high",
    color: "#ef4444",
    radius: 750,
    waterLevel: "2.3 meters",
    population: "1,567",
    evacuated: "34 families",
    lastUpdate: "15 mins ago",
    description: "Severe flooding near coastal areas. Storm surge affecting shoreline communities.",
    riskZones: [
      { level: "Critical", area: "Coastal zone", households: 67 },
      { level: "High", area: "Near-shore", households: 123 },
      { level: "Moderate", area: "Inland", households: 187 }
    ]
  },
  {
    id: 6,
    name: "Canjalon",
    lat: 12.3789,
    lng: 122.0245,
    floodRisk: "low",
    color: "#22c55e",
    radius: 550,
    waterLevel: "0.7 meters",
    population: "654",
    evacuated: "0 families",
    lastUpdate: "2 hours ago",
    description: "Minor waterlogging in agricultural areas. No residential impact.",
    riskZones: [
      { level: "Low", area: "Farmlands", households: 45 },
      { level: "Safe", area: "Residential", households: 134 }
    ]
  },
  {
    id: 7,
    name: "Batiano",
    lat: 12.4234,
    lng: 122.0267,
    floodRisk: "medium",
    color: "#eab308",
    radius: 680,
    waterLevel: "1.8 meters",
    population: "987",
    evacuated: "15 families",
    lastUpdate: "35 mins ago",
    description: "Creek overflow affecting downstream areas. Evacuation ongoing.",
    riskZones: [
      { level: "High", area: "Downstream", households: 56 },
      { level: "Moderate", area: "Creek buffer", households: 89 },
      { level: "Low", area: "Upland", households: 112 }
    ]
  },
  {
    id: 8,
    name: "Liwayway",
    lat: 12.3912,
    lng: 122.0201,
    floodRisk: "low",
    color: "#22c55e",
    radius: 620,
    waterLevel: "0.6 meters",
    population: "876",
    evacuated: "0 families",
    lastUpdate: "1.5 hours ago",
    description: "Minimal impact. Drainage channels clear.",
    riskZones: [
      { level: "Low", area: "Central", households: 78 },
      { level: "Safe", area: "Periphery", households: 145 }
    ]
  },
  {
    id: 9,
    name: "Pit-os",
    lat: 12.4101,
    lng: 122.0334,
    floodRisk: "medium",
    color: "#eab308",
    radius: 690,
    waterLevel: "1.4 meters",
    population: "1,123",
    evacuated: "18 families",
    lastUpdate: "40 mins ago",
    description: "Moderate flooding in lowland subdivisions. Main roads passable.",
    riskZones: [
      { level: "High", area: "Subdivision A", households: 45 },
      { level: "Moderate", area: "Main roads", households: 87 },
      { level: "Low", area: "Highland", households: 134 }
    ]
  }
];

// Component to handle map centering
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  return null;
}

export function EnhancedHazardMap() {
  const [offlineMode, setOfflineMode] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [selectedBarangay, setSelectedBarangay] = useState<typeof barangayData[0] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([12.4018, 122.0234]);

  // Get user's current location
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: [number, number] = [position.coords.latitude, position.coords.longitude];
          setUserLocation(coords);
        },
        (error) => {
          console.log("Location access denied:", error);
        }
      );
    }
  }, []);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "high": return "#ef4444";
      case "medium": return "#eab308";
      case "low": return "#22c55e";
      default: return "#3b82f6";
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
    <div className="min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white px-6 py-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl">GIS Hazard Map</h1>
          <button
            onClick={() => setOfflineMode(!offlineMode)}
            className="flex items-center gap-2 bg-blue-700 px-3 py-1.5 rounded-full text-sm"
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
        <p className="text-blue-100 text-sm">OpenStreetMap • Odiongan flood zones</p>
      </div>

      {/* OpenStreetMap Container */}
      <div className="relative">
        <div className="h-96">
          <MapContainer
            center={mapCenter}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController center={mapCenter} />
            {barangayData.map((barangay) => (
              <Circle
                key={`circle-${barangay.id}`}
                center={[barangay.lat, barangay.lng]}
                radius={barangay.radius}
                pathOptions={{
                  color: barangay.color,
                  fillColor: barangay.color,
                  fillOpacity: 0.3,
                  weight: 2
                }}
              />
            ))}
            {barangayData.map((barangay) => (
              <Marker
                key={`marker-${barangay.id}`}
                position={[barangay.lat, barangay.lng]}
                eventHandlers={{
                  click: () => {
                    setSelectedBarangay(barangay);
                    setMapCenter([barangay.lat, barangay.lng]);
                  }
                }}
              >
                <Popup>
                  <div className="p-2">
                    <h3 className="font-bold text-sm mb-1">{barangay.name}</h3>
                    <p className="text-xs text-gray-600 mb-1">{getRiskLabel(barangay.floodRisk)}</p>
                    <p className="text-xs">Water Level: {barangay.waterLevel}</p>
                    <button
                      onClick={() => setSelectedBarangay(barangay)}
                      className="text-xs text-blue-600 mt-2 hover:underline"
                    >
                      View Details →
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
            {userLocation && (
              <Marker position={userLocation}>
                <Popup>
                  <div className="p-2">
                    <p className="text-xs font-semibold">Your Location</p>
                    <p className="text-xs text-gray-600">
                      {userLocation[0].toFixed(4)}, {userLocation[1].toFixed(4)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        {/* Map Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="bg-white p-2.5 rounded-lg shadow-md hover:bg-gray-50"
          >
            <Layers size={20} className="text-gray-700" />
          </button>
          {userLocation && (
            <button
              onClick={() => setMapCenter(userLocation)}
              className="bg-white p-2.5 rounded-lg shadow-md hover:bg-gray-50"
              title="Center on my location"
            >
              <Navigation size={20} className="text-blue-600" />
            </button>
          )}
        </div>

        {/* Legend */}
        {showLegend && (
          <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg p-4 z-10">
            <h3 className="text-sm font-semibold mb-3">Flood Risk Levels</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-sm text-gray-700">High Risk (2m+)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span className="text-sm text-gray-700">Medium Risk (1-2m)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-sm text-gray-700">Low Risk (&lt;1m)</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                <strong>GIS Data Source:</strong> OpenStreetMap
              </p>
              <p className="text-xs text-gray-500">
                Last updated: {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Barangay List */}
      <div className="px-6 py-6">
        <h2 className="text-lg font-semibold mb-4">Barangay Flood Zones (GIS-Based)</h2>
        <div className="space-y-3">
          {barangayData.map((zone) => (
            <div
              key={zone.id}
              className="bg-white rounded-xl shadow-md p-4 flex items-center justify-between hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedBarangay(zone);
                setMapCenter([zone.lat, zone.lng]);
              }}
            >
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: zone.color }}></div>
                <div>
                  <p className="text-sm font-medium">{zone.name}</p>
                  <p className="text-xs text-gray-500">
                    {getRiskLabel(zone.floodRisk)} • {zone.waterLevel}
                  </p>
                  <p className="text-xs text-gray-400">
                    GPS: {zone.lat.toFixed(4)}, {zone.lng.toFixed(4)}
                  </p>
                </div>
              </div>
              <button className="text-blue-600 text-sm hover:bg-blue-50 px-3 py-1 rounded-lg transition-colors">
                View
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Enhanced Barangay Detail Modal */}
      {selectedBarangay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">{selectedBarangay.name}</h2>
                <p className="text-sm text-gray-500">GIS Flood Zone Analysis</p>
              </div>
              <button
                onClick={() => setSelectedBarangay(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* GPS Coordinates */}
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-xs text-gray-600 mb-1">GPS Coordinates</p>
                <p className="text-sm font-mono">
                  Lat: {selectedBarangay.lat.toFixed(6)}, Lng: {selectedBarangay.lng.toFixed(6)}
                </p>
              </div>

              {/* Risk Level Badge */}
              <div className={`bg-opacity-10 border-2 rounded-xl p-4 flex items-center gap-3`}
                style={{
                  backgroundColor: `${selectedBarangay.color}20`,
                  borderColor: selectedBarangay.color
                }}>
                <AlertTriangle size={32} style={{ color: selectedBarangay.color }} />
                <div>
                  <p className="text-sm text-gray-600 mb-1">Current Risk Level</p>
                  <p className="text-xl font-bold capitalize">{getRiskLabel(selectedBarangay.floodRisk)}</p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets size={18} className="text-blue-600" />
                    <p className="text-xs text-gray-600">Water Level</p>
                  </div>
                  <p className="text-lg font-semibold">{selectedBarangay.waterLevel}</p>
                </div>

                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users size={18} className="text-purple-600" />
                    <p className="text-xs text-gray-600">Population</p>
                  </div>
                  <p className="text-lg font-semibold">{selectedBarangay.population}</p>
                </div>

                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={18} className="text-orange-600" />
                    <p className="text-xs text-gray-600">Evacuated</p>
                  </div>
                  <p className="text-lg font-semibold">{selectedBarangay.evacuated}</p>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <p className="text-xs text-gray-600">Last Update</p>
                  </div>
                  <p className="text-sm font-semibold">{selectedBarangay.lastUpdate}</p>
                </div>
              </div>

              {/* Risk Zones Table */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Detailed Risk Zones</h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Zone</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Risk Level</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Households</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedBarangay.riskZones.map((zone, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs">{zone.area}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              zone.level === 'Critical' ? 'bg-red-100 text-red-700' :
                              zone.level === 'High' ? 'bg-orange-100 text-orange-700' :
                              zone.level === 'Moderate' ? 'bg-yellow-100 text-yellow-700' :
                              zone.level === 'Low' ? 'bg-blue-100 text-blue-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {zone.level}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-medium">{zone.households}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Situation Report</h3>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-4">
                  {selectedBarangay.description}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => setMapCenter([selectedBarangay.lat, selectedBarangay.lng])}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Center Map on Barangay
                </button>
                <button className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors font-medium">
                  Contact Barangay Officials
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
