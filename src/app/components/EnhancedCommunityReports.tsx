import { useState, useEffect } from "react";
import { Camera, MapPin, AlertCircle, CheckCircle, Clock, XCircle, Navigation, Loader } from "lucide-react";

interface Report {
  id: number;
  location: string;
  gpsCoordinates: { lat: number; lng: number } | null;
  waterLevel: string;
  description: string;
  photo: string | null;
  status: "pending" | "verified" | "rejected";
  timestamp: string;
  rejectionReason?: string;
  admin_reply?: string | null;
  admin_reply_at?: string | null;
}

export function EnhancedCommunityReports() {
  const [reports, setReports] = useState<Report[]>([
    {
      id: 1,
      location: "Barangay Tuburan, Near Bridge",
      gpsCoordinates: { lat: 12.4018, lng: 122.0234 },
      waterLevel: "knee-high",
      description: "Water rising rapidly near the main bridge. Vehicles struggling to pass.",
      photo: null,
      status: "verified",
      timestamp: "2024-05-04 14:30",
    },
    {
      id: 2,
      location: "Barangay Poctoy, Coastal Road",
      gpsCoordinates: { lat: 12.4089, lng: 122.0156 },
      waterLevel: "waist-high",
      description: "Storm surge affecting coastal areas. Evacuation recommended.",
      photo: null,
      status: "pending",
      timestamp: "2024-05-04 15:15",
    },
    {
      id: 3,
      location: "Barangay Gabawan",
      gpsCoordinates: { lat: 12.3867, lng: 122.0189 },
      waterLevel: "ankle-high",
      description: "Minor flooding in agricultural area.",
      photo: null,
      status: "rejected",
      timestamp: "2024-05-04 13:45",
      rejectionReason: "Duplicate report - already verified under report #12",
    },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [newReport, setNewReport] = useState({
    location: "",
    gpsCoordinates: null as { lat: number; lng: number } | null,
    waterLevel: "",
    description: "",
  });

  // Capture GPS coordinates
  const captureGPSLocation = () => {
    if ("geolocation" in navigator) {
      setGpsLoading(true);
      setGpsError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setNewReport({ ...newReport, gpsCoordinates: coords });
          setGpsLoading(false);

          // Reverse geocoding simulation (in real app, use OpenStreetMap Nominatim API)
          setNewReport(prev => ({
            ...prev,
            location: `GPS Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`
          }));
        },
        (error) => {
          setGpsLoading(false);
          let errorMessage = "Unable to get location";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location permission denied. Please enable location access.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Location information unavailable.";
              break;
            case error.TIMEOUT:
              errorMessage = "Location request timed out.";
              break;
          }
          setGpsError(errorMessage);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      setGpsError("Geolocation is not supported by your device");
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert("Photo size must be less than 5MB");
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert("Please select a valid image file");
        return;
      }

      setSelectedPhoto(file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!newReport.gpsCoordinates) {
      alert("Please capture your GPS location before submitting");
      return;
    }

    if (!newReport.waterLevel) {
      alert("Please select water level");
      return;
    }

    if (!newReport.description.trim()) {
      alert("Please provide a description");
      return;
    }

    const report: Report = {
      id: reports.length + 1,
      location: newReport.location,
      gpsCoordinates: newReport.gpsCoordinates,
      waterLevel: newReport.waterLevel,
      description: newReport.description,
      photo: photoPreview,
      status: "pending",
      timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };

    setReports([report, ...reports]);

    // Reset form
    setNewReport({
      location: "",
      gpsCoordinates: null,
      waterLevel: "",
      description: "",
    });
    setSelectedPhoto(null);
    setPhotoPreview(null);
    setShowForm(false);

    // Simulate push notification to admin
    alert("✓ Report submitted successfully! Admin will verify your report soon. You'll receive a notification when status changes.");
  };

  return (
    <div className="min-h-full bg-gray-50 pb-6">
      {/* Header */}
      <div className="bg-blue-600 text-white px-6 py-6">
        <h1 className="text-xl mb-2">Community Reports</h1>
        <p className="text-blue-100 text-sm">Submit flood observations with GPS location</p>
      </div>

      <div className="px-6 py-6">
        {/* Submit Report Button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full bg-blue-600 text-white py-4 rounded-xl font-medium hover:bg-blue-700 transition-colors mb-6 flex items-center justify-center gap-2"
          >
            <Camera size={20} />
            Submit New Flood Report
          </button>
        )}

        {/* Report Submission Form */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Flood Report</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* GPS Location Capture */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  GPS Location (Required) *
                </label>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={captureGPSLocation}
                    disabled={gpsLoading}
                    className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {gpsLoading ? (
                      <>
                        <Loader size={20} className="animate-spin" />
                        Capturing Location...
                      </>
                    ) : (
                      <>
                        <Navigation size={20} />
                        Capture My GPS Location
                      </>
                    )}
                  </button>

                  {newReport.gpsCoordinates && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <CheckCircle size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-green-800">Location Captured</p>
                          <p className="text-xs text-green-700 font-mono mt-1">
                            Lat: {newReport.gpsCoordinates.lat.toFixed(6)}<br />
                            Lng: {newReport.gpsCoordinates.lng.toFixed(6)}
                          </p>
                          <p className="text-xs text-green-600 mt-1">
                            Accuracy: High (GPS-based)
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {gpsError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-red-800">Location Error</p>
                          <p className="text-xs text-red-700 mt-1">{gpsError}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Location Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location Description
                </label>
                <input
                  type="text"
                  value={newReport.location}
                  onChange={(e) => setNewReport({ ...newReport, location: e.target.value })}
                  placeholder="e.g., Near Tuburan Bridge, Main Road"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional: Add landmark or street name for easier identification
                </p>
              </div>

              {/* Water Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estimated Water Level *
                </label>
                <select
                  value={newReport.waterLevel}
                  onChange={(e) => setNewReport({ ...newReport, waterLevel: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select water level</option>
                  <option value="ankle-high">Ankle-high (&lt;0.3m)</option>
                  <option value="knee-high">Knee-high (0.3-0.6m)</option>
                  <option value="waist-high">Waist-high (0.6-1.2m)</option>
                  <option value="chest-high">Chest-high (1.2-1.8m)</option>
                  <option value="overhead">Overhead (&gt;1.8m)</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <textarea
                  value={newReport.description}
                  onChange={(e) => setNewReport({ ...newReport, description: e.target.value })}
                  placeholder="Describe the flooding situation, affected areas, and any hazards..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  required
                ></textarea>
              </div>

              {/* Photo Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Photo Evidence (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                  id="photo-upload"
                />
                <label
                  htmlFor="photo-upload"
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  {photoPreview ? (
                    <div className="w-full">
                      <img
                        src={photoPreview}
                        alt="Preview"
                        className="w-full h-48 object-cover rounded-lg mb-2"
                      />
                      <p className="text-sm text-gray-600 text-center">
                        Click to change photo
                      </p>
                    </div>
                  ) : (
                    <>
                      <Camera size={32} className="text-gray-400 mb-2" />
                      <p className="text-sm text-gray-600">Click to upload photo</p>
                      <p className="text-xs text-gray-500 mt-1">Max 5MB • JPG, PNG</p>
                    </>
                  )}
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Submit Report
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Reports List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">My Reports</h2>

          {reports.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-8 text-center">
              <MapPin size={48} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No reports yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Submit your first flood observation
              </p>
            </div>
          ) : (
            reports.map((report) => (
              <div key={report.id} className="bg-white rounded-xl shadow-md p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin size={16} className="text-blue-600" />
                      <p className="text-sm font-medium">{report.location}</p>
                    </div>
                    {report.gpsCoordinates && (
                      <p className="text-xs text-gray-500 font-mono ml-6">
                        GPS: {report.gpsCoordinates.lat.toFixed(4)}, {report.gpsCoordinates.lng.toFixed(4)}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                      report.status === "verified"
                        ? "bg-green-100 text-green-700"
                        : report.status === "pending"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {report.status === "verified" && <CheckCircle size={14} />}
                    {report.status === "pending" && <Clock size={14} />}
                    {report.status === "rejected" && <XCircle size={14} />}
                    {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                  </span>
                </div>

                {report.photo && (
                  <img
                    src={report.photo}
                    alt="Flood evidence"
                    className="w-full h-48 object-cover rounded-lg mb-3"
                  />
                )}

                <div className="mb-3">
                  <p className="text-sm text-gray-700 mb-2">{report.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Water level: {report.waterLevel}</span>
                    <span>•</span>
                    <span>{report.timestamp}</span>
                  </div>
                </div>

                {report.status === "rejected" && report.rejectionReason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-red-800">Rejection Reason:</p>
                        <p className="text-xs text-red-700 mt-1">{report.rejectionReason}</p>
                      </div>
                    </div>
                  </div>
                )}

                {report.status === "verified" && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-green-700">
                        This report has been verified by MDRRMO and converted to an official flood alert.
                      </p>
                    </div>
                  </div>
                )}

                {report.admin_reply && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 mb-1">Reply from MDRRMO:</p>
                    <p className="text-sm text-blue-900 whitespace-pre-wrap">{report.admin_reply}</p>
                    {report.admin_reply_at && (
                      <p className="mt-2 text-[11px] text-blue-700">
                        Sent {new Date(report.admin_reply_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
