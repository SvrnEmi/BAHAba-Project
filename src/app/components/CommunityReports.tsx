import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Camera, CheckCircle2, MapPin, Send, Image, MessageSquare, Navigation, Loader, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { subscribeToTable } from "../../lib/realtime";
import { ClayButton, ClayCard, RiskBadge, ScreenHeader, type RiskLevel } from "./clay/Clay";

type ReportRow = {
  id: number;
  user_name: string;
  location: string;
  lat: number | null;
  lng: number | null;
  water_level: string;
  description: string;
  photo_path: string | null;
  status: string;
  timestamp: string;
  rejection_reason: string | null;
  admin_reply: string | null;
  admin_reply_at: string | null;
};

const normalizeWaterLevel = (value: string) => {
  switch (value) {
    case "ankle":
      return "ankle";
    case "knee":
      return "knee";
    case "waist":
      return "waist";
    case "chest":
      return "chest";
    case "overhead":
      return "overhead";
    default:
      return "ankle";
  }
};

const isApprovedReportStatus = (status: string | null | undefined) =>
  status === "approved";

const getSupabaseErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object") {
    const details = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const context = [details.code, details.details, details.hint].filter(Boolean).join(" ");
    return [details.message, context].filter(Boolean).join(" ") || fallback;
  }

  return fallback;
};

const formatTimeAgo = (timestamp: string) => {
  const delta = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.floor(delta / 60000));

  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

export function CommunityReports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [location, setLocation] = useState("");
  const [waterLevel, setWaterLevel] = useState("ankle");
  const [description, setDescription] = useState("");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  const resetForm = () => {
    setShowForm(false);
    setGpsLocation(null);
    setPhotoPreview(null);
    setSelectedFile(null);
    setLocation("");
    setDescription("");
    setWaterLevel("ankle");
  };

  useEffect(() => {
    if (searchParams.get("openForm") === "true") {
      setShowForm(true);
      searchParams.delete("openForm");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    const loadReports = async () => {
      const { data, error } = await supabase
        .from("community_reports")
        .select("*")
        .eq("status", "approved")
        .order("timestamp", { ascending: false });

      if (cancelled) return;
      if (!error) {
        setReports((data as ReportRow[]) ?? []);
      }

      setLoading(false);
    };

    void loadReports();

    // Public feed only ever shows APPROVED reports. A freshly submitted
    // report starts as 'pending' and must not appear here — so INSERT
    // events are ignored unless already approved (rare, but possible if
    // seeded directly). UPDATE events add/remove a report as its status
    // changes, and DELETE events remove it immediately if MDRRMO deletes it.
    const unsubscribe = subscribeToTable<ReportRow>("community_reports", (change) => {
      if (change.eventType === "INSERT") {
        const row = change.new as ReportRow;
        if (!isApprovedReportStatus(row.status)) return;
        setReports((current) => [row, ...current.filter((report) => report.id !== row.id)]);
      } else if (change.eventType === "UPDATE") {
          const row = change.new as ReportRow;
          setReports((current) => {
            const withoutRow = current.filter((report) => report.id !== row.id);
            if (!isApprovedReportStatus(row.status)) return withoutRow;
            return [row, ...withoutRow].sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
          });
      } else if (change.eventType === "DELETE") {
        const row = change.old as Partial<ReportRow>;
        setReports((current) => current.filter((report) => report.id !== row.id));
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const captureGPSLocation = () => {
    if ("geolocation" in navigator) {
      setGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setGpsLoading(false);
        },
        (error) => {
          console.error("GPS error:", error);
          alert("Unable to get your location. Please check location permissions.");
          setGpsLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      alert("Geolocation is not supported by your browser");
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Photo size must be less than 5MB");
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!gpsLocation) {
      alert("Please capture GPS location before submitting.");
      return;
    }

    if (!location.trim() || !description.trim()) {
      alert("Please complete the location and description fields.");
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("You must be signed in to submit a report.");
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(`Unable to load your profile: ${getSupabaseErrorMessage(profileError, "database request failed")}`);
      }

      const submittedBy = profileData?.name ?? user.email ?? "Resident";
      const { data: existingPendingReport, error: pendingCheckError } = await supabase
        .from("community_reports")
        .select("id, status")
        .eq("user_name", submittedBy)
        .eq("status", "pending")
        .order("timestamp", { ascending: false })
        .limit(1);

      if (pendingCheckError) {
        throw new Error(`Unable to check your report status: ${getSupabaseErrorMessage(pendingCheckError, "database request failed")}`);
      }

      if ((existingPendingReport ?? []).length > 0) {
        resetForm();
        alert("Your report is already submitted. Please wait for the MDRRMO approval.");
        return;
      }

      let photoUrl: string | null = null;
      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop() ?? "jpg";
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("report-photos")
          .upload(fileName, selectedFile, { upsert: true });

        if (uploadError) {
          throw new Error(`Unable to upload the photo: ${getSupabaseErrorMessage(uploadError, "storage request failed")}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from("report-photos")
          .getPublicUrl(fileName);

        photoUrl = publicUrlData.publicUrl || null;
      }

      const { error: insertError } = await supabase.from("community_reports").insert({
        user_name: submittedBy,
        location: location.trim(),
        lat: gpsLocation.lat,
        lng: gpsLocation.lng,
        water_level: normalizeWaterLevel(waterLevel),
        description: description.trim(),
        photo_path: photoUrl,
        status: "pending",
        timestamp: new Date().toISOString(),
        rejection_reason: null,
      });

      if (insertError) {
        throw new Error(`Unable to save the report: ${getSupabaseErrorMessage(insertError, "database request failed")}`);
      }

      resetForm();
      setShowSuccessDialog(true);
    } catch (err) {
      console.error("Report submission failed:", err);
      alert(getSupabaseErrorMessage(err, "Unable to submit report."));
    } finally {
      setSubmitting(false);
    }
  };

  const getLevelRisk = (level: string): RiskLevel =>
    level === "ankle" ? "low" : level === "knee" ? "medium" : "high";

  return (
    <div className="min-h-full bg-background">
      <ScreenHeader title="Community Reports" subtitle="Crowdsourced flood observations" icon={Users} pastel="mint" />

      <div className="px-[18px] pt-2 pb-6">
        <ClayButton icon={Camera} onClick={() => setShowForm(!showForm)} className="w-full mb-6">
          Submit Flood Report
        </ClayButton>

        {showForm && (
          <ClayCard radius={28} className="p-5 mb-6">
            <h3 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>New Report</h3>
            <div className="space-y-4">
              <div>
                <label className="clay-label">Location</label>
                <div className="relative">
                  <MapPin size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Your current location"
                    className="clay-input has-icon-left text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="clay-label">GPS Coordinates</label>
                {gpsLocation ? (
                  <div className="rounded-2xl border border-green-200 bg-white px-3 py-2">
                    <p className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>
                      {gpsLocation.lat.toFixed(6)}, {gpsLocation.lng.toFixed(6)}
                    </p>
                    <p className="text-xs text-green-600 mt-1">Location captured</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={captureGPSLocation}
                    disabled={gpsLoading}
                    className="clay-btn clay-btn-secondary w-full"
                  >
                    {gpsLoading ? (
                      <>
                        <Loader size={18} className="animate-spin" />
                        Getting location...
                      </>
                    ) : (
                      <>
                        <Navigation size={18} />
                        Capture My GPS Location
                      </>
                    )}
                  </button>
                )}
              </div>

              <div>
                <label className="clay-label">Water Level</label>
                <select
                  value={waterLevel}
                  onChange={(event) => setWaterLevel(event.target.value)}
                  className="clay-input text-sm"
                >
                  <option value="ankle">Low (ankle-deep)</option>
                  <option value="knee">Medium (knee-deep)</option>
                  <option value="waist">High (waist-deep or higher)</option>
                  <option value="chest">Severe (chest-deep)</option>
                  <option value="overhead">Critical (overhead)</option>
                </select>
              </div>

              <div>
                <label className="clay-label">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe what you're observing..."
                  className="clay-input text-sm"
                  rows={3}
                ></textarea>
              </div>

              <div>
                <label className="clay-label">Photo (Optional)</label>
                {photoPreview ? (
                  <div className="relative">
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoPreview(null);
                        setSelectedFile(null);
                      }}
                      className="absolute top-2 right-2 min-h-12 rounded-full bg-red-600 px-3 text-white"
                    >
                      <span className="text-xs px-2">Remove</span>
                    </button>
                  </div>
                ) : (
                  <label className="w-full min-h-12 border-2 border-dashed border-gray-300 rounded-[20px] py-4 flex items-center justify-center gap-2 text-gray-600 hover:border-blue-500 cursor-pointer">
                    <Image size={20} />
                    <span className="text-sm">Add Photo (Max 5MB)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="clay-btn clay-btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="clay-btn clay-btn-primary flex-1"
                >
                  <Send size={18} />
                  {submitting ? "Submitting..." : "Submit"}
                </button>
              </div>
            </div>
          </ClayCard>
        )}

        <h2 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>Recent Reports</h2>
        <div className="space-y-4 pb-6">
          {loading ? (
            <p className="text-sm text-gray-500">Loading reports...</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-gray-500">No reports yet. Be the first to submit one.</p>
          ) : (
            reports.map((report) => (
              <ClayCard key={report.id} radius={22} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold" style={{ background: "var(--lavender)", color: "var(--lavender-icon)" }}>
                      {report.user_name?.charAt(0)?.toUpperCase() ?? "R"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{report.user_name}</p>
                      <p className="text-xs text-gray-500">{formatTimeAgo(report.timestamp)}</p>
                    </div>
                  </div>
                  {report.status === "approved" && (
                    <span className="risk-badge risk-badge-low is-compact">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      Verified
                    </span>
                  )}
                </div>

                {report.photo_path && (
                  <img
                    src={report.photo_path}
                    alt="Flood report"
                    className="w-full h-40 object-cover rounded-lg mb-3"
                  />
                )}

                <div className="flex items-start gap-2 mb-2">
                  <MapPin size={16} className="text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-600">{report.location}</p>
                    <p className="text-xs text-gray-500 font-mono">
                      GPS: {report.lat?.toFixed(6) ?? "-"}, {report.lng?.toFixed(6) ?? "-"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <RiskBadge risk={getLevelRisk(report.water_level)} compact />
                  <p className="text-sm capitalize" style={{ color: "var(--text-primary)" }}>{report.water_level} water level</p>
                </div>

                <p className="text-sm text-gray-700 mb-3">{report.description}</p>

                {report.admin_reply && (
                  <div className="mb-3 rounded-2xl border bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--primary-shade)" }}>Reply from MDRRMO:</p>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{report.admin_reply}</p>
                    {report.admin_reply_at && (
                      <p className="mt-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        Sent {new Date(report.admin_reply_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
                  <button className="flex min-h-12 items-center gap-1 text-sm text-gray-600 hover:text-blue-600">
                    <MessageSquare size={16} />
                    <span>Comment</span>
                  </button>
                  <button className="flex min-h-12 items-center gap-1 text-sm text-gray-600 hover:text-blue-600">
                    <Send size={16} />
                    <span>Share</span>
                  </button>
                </div>
              </ClayCard>
            ))
          )}
        </div>
      </div>

      {showSuccessDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="clay max-w-sm w-full p-6 text-center" style={{ borderRadius: 28 }}>
            <div className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "var(--mint)" }}>
              <Send size={24} style={{ color: "var(--mint-icon)" }} />
            </div>
            <h3 className="text-lg font-semibold mb-2">Report Submitted</h3>
            <p className="text-sm text-gray-600 mb-6">
              Your report has been submitted. Please wait for the MDRRMO&apos;s approval before it
              appears in the community feed.
            </p>
            <button
              type="button"
              onClick={() => setShowSuccessDialog(false)}
              className="clay-btn clay-btn-primary w-full"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}