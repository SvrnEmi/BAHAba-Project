import { useState } from "react";
import { WifiOff, Wifi, ZoomIn, ZoomOut, Layers, X, Droplets, AlertTriangle, Users } from "lucide-react";

export function HazardMap() {
  const [offlineMode, setOfflineMode] = useState(false);
  const [showLegend, setShowLegend] = useState(true);
  const [selectedBarangay, setSelectedBarangay] = useState<number | null>(null);

  const floodZones = [
    {
      name: "Barangay Tuburan",
      level: "high",
      color: "bg-red-500",
      waterLevel: "2.8 meters",
      population: "1,234",
      evacuated: "45 families",
      lastUpdate: "10 mins ago",
      gpsLat: "12.4018",
      gpsLng: "122.0234",
      description: "Critical flood zone near river confluence. Water level rising rapidly due to upstream rainfall."
    },
    {
      name: "Barangay Gabawan",
      level: "medium",
      color: "bg-yellow-500",
      waterLevel: "1.5 meters",
      population: "892",
      evacuated: "12 families",
      lastUpdate: "25 mins ago",
      gpsLat: "12.3867",
      gpsLng: "122.0189",
      description: "Moderate flooding in low-lying areas. Creek overflow affecting residential zones."
    },
    {
      name: "Barangay Ligaya",
      level: "low",
      color: "bg-green-500",
      waterLevel: "0.8 meters",
      population: "1,567",
      evacuated: "0 families",
      lastUpdate: "1 hour ago",
      gpsLat: "12.4123",
      gpsLng: "122.0345",
      description: "Minimal flooding, mostly surface water. Drainage system functioning normally."
    },
    {
      name: "Barangay Luntad",
      level: "medium",
      color: "bg-yellow-500",
      waterLevel: "1.7 meters",
      population: "743",
      evacuated: "8 families",
      lastUpdate: "45 mins ago",
      gpsLat: "12.3945",
      gpsLng: "122.0156",
      description: "Flash flood risk in agricultural areas. Roads partially submerged."
    },
    {
      name: "Barangay Panique",
      level: "low",
      color: "bg-green-500",
      waterLevel: "0.5 meters",
      population: "2,103",
      evacuated: "0 families",
      lastUpdate: "1 hour 20 mins ago",
      gpsLat: "12.4256",
      gpsLng: "122.0412",
      description: "Stable water levels. Well-maintained drainage infrastructure preventing flooding."
    },
    {
      name: "Barangay Poblacion",
      level: "medium",
      color: "bg-yellow-500",
      waterLevel: "1.3 meters",
      population: "3,456",
      evacuated: "15 families",
      lastUpdate: "30 mins ago",
      gpsLat: "12.4089",
      gpsLng: "122.0267",
      description: "Urban flooding in downtown area. Blocked drainage causing water accumulation."
    },
    {
      name: "Barangay Anahao",
      level: "high",
      color: "bg-red-500",
      waterLevel: "2.5 meters",
      population: "1,876",
      evacuated: "38 families",
      lastUpdate: "15 mins ago",
      gpsLat: "12.3789",
      gpsLng: "122.0134",
      description: "Severe flooding near coastal area. Storm surge contributing to water level rise."
    },
    {
      name: "Barangay Bangon",
      level: "low",
      color: "bg-green-500",
      waterLevel: "0.6 meters",
      population: "987",
      evacuated: "0 families",
      lastUpdate: "2 hours ago",
      gpsLat: "12.4178",
      gpsLng: "122.0289",
      description: "Minor puddles on roads. Elevated terrain provides natural flood protection."
    },
    {
      name: "Barangay Libertad",
      level: "medium",
      color: "bg-yellow-500",
      waterLevel: "1.9 meters",
      population: "1,234",
      evacuated: "10 families",
      lastUpdate: "40 mins ago",
      gpsLat: "12.3912",
      gpsLng: "122.0223",
      description: "Riverside flooding affecting low-lying residential areas. Monitoring river levels closely."
    },
  ];

  const selectedZone = selectedBarangay !== null ? floodZones[selectedBarangay] : null;

  return (
    <div className="min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white px-6 py-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl">Hazard Map</h1>
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
        <p className="text-blue-100 text-sm">Odiongan flood-prone zones</p>
      </div>

      {/* Map Container */}
      <div className="relative">
        {/* Simulated Map */}
        <div className="h-96 bg-gradient-to-br from-blue-200 via-green-200 to-blue-100 relative">
          {/* Flood Zone Markers */}
          <div className="absolute top-16 left-12 w-24 h-24 bg-red-500 opacity-40 rounded-full blur-md"></div>
          <div className="absolute bottom-24 right-16 w-32 h-32 bg-yellow-500 opacity-40 rounded-full blur-md"></div>
          <div className="absolute top-32 right-20 w-20 h-20 bg-green-500 opacity-40 rounded-full blur-md"></div>
          <div className="absolute bottom-16 left-20 w-28 h-28 bg-yellow-500 opacity-40 rounded-full blur-md"></div>

          {/* Center Marker */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="w-4 h-4 bg-blue-600 rounded-full border-4 border-white shadow-lg"></div>
          </div>
        </div>

        {/* Map Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          <button className="bg-white p-2.5 rounded-lg shadow-md hover:bg-gray-50">
            <ZoomIn size={20} className="text-gray-700" />
          </button>
          <button className="bg-white p-2.5 rounded-lg shadow-md hover:bg-gray-50">
            <ZoomOut size={20} className="text-gray-700" />
          </button>
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="bg-white p-2.5 rounded-lg shadow-md hover:bg-gray-50"
          >
            <Layers size={20} className="text-gray-700" />
          </button>
        </div>

        {/* Legend */}
        {showLegend && (
          <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg p-4">
            <h3 className="text-sm mb-3">Flood Risk Levels</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-sm text-gray-700">High Risk</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span className="text-sm text-gray-700">Medium Risk</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-sm text-gray-700">Low Risk</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barangay List */}
      <div className="px-6 py-6">
        <h2 className="text-lg mb-4">Barangay Flood Zones</h2>
        <div className="space-y-3">
          {floodZones.map((zone, index) => (
            <div
              key={index}
              className="bg-white rounded-xl shadow-md p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 ${zone.color} rounded-full`}></div>
                <div>
                  <p className="text-sm">{zone.name}</p>
                  <p className="text-xs text-gray-500 capitalize">
                    {zone.level} risk
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedBarangay(index)}
                className="text-blue-600 text-sm hover:bg-blue-50 px-3 py-1 rounded-lg transition-colors">
                View
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Barangay Detail Modal */}
      {selectedZone && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg">{selectedZone.name}</h2>
                <p className="text-sm text-gray-500">Flood Zone Details</p>
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
              {/* Risk Level Badge */}
              <div className={`${selectedZone.color} bg-opacity-10 border-2 ${selectedZone.color.replace('bg-', 'border-')} rounded-xl p-4 flex items-center gap-3`}>
                <AlertTriangle size={32} className={selectedZone.color.replace('bg-', 'text-')} />
                <div>
                  <p className="text-sm text-gray-600 mb-1">Current Risk Level</p>
                  <p className="text-xl capitalize">{selectedZone.level} Risk</p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets size={18} className="text-blue-600" />
                    <p className="text-xs text-gray-600">Water Level</p>
                  </div>
                  <p className="text-lg">{selectedZone.waterLevel}</p>
                </div>

                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users size={18} className="text-purple-600" />
                    <p className="text-xs text-gray-600">Population</p>
                  </div>
                  <p className="text-lg">{selectedZone.population}</p>
                </div>

                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={18} className="text-orange-600" />
                    <p className="text-xs text-gray-600">Evacuated</p>
                  </div>
                  <p className="text-lg">{selectedZone.evacuated}</p>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <p className="text-xs text-gray-600">Last Update</p>
                  </div>
                  <p className="text-lg">{selectedZone.lastUpdate}</p>
                </div>
              </div>

              {/* GPS Coordinates */}
              <div>
                <h3 className="text-sm mb-2">GPS Coordinates</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-700 font-mono">
                    {selectedZone.gpsLat}, {selectedZone.gpsLng}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Latitude, Longitude
                  </p>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-sm mb-2">Situation Report</h3>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-4">
                  {selectedZone.description}
                </p>
              </div>

              {/* Map Preview */}
              <div>
                <h3 className="text-sm mb-2">Location Map</h3>
                <div className="h-48 bg-gradient-to-br from-blue-200 via-green-200 to-blue-100 rounded-lg relative overflow-hidden">
                  <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 ${selectedZone.color} opacity-40 rounded-full blur-lg`}></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 bg-blue-600 rounded-full border-4 border-white shadow-lg"></div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                  View Live Updates
                </button>
                <button className="w-full border border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors">
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