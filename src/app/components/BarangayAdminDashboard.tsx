import { useEffect, useState } from "react";
import {
  Bell,
  MapPin,
  Activity,
  Settings,
  AlertTriangle,
  Send,
  Eye,
  Users,
  Droplets,
  Clock,
  CheckCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { subscribeToTable } from "../../lib/realtime";
import { ProfileButton } from "./ProfileButton";
import { useMyDisplayName } from "../../lib/profile";

type AlertLevel = "advisory" | "warning" | "critical";
type FloodRisk = "low" | "medium" | "high";

const floodRiskConfig: Record<FloodRisk, { label: string; badge: string; button: string }> = {
  low: {
    label: "Low Risk",
    badge: "bg-green-100 text-green-700",
    button: "border-green-500 bg-green-50 text-green-700",
  },
  medium: {
    label: "Medium Risk",
    badge: "bg-amber-100 text-amber-700",
    button: "border-amber-500 bg-amber-50 text-amber-700",
  },
  high: {
    label: "High Risk",
    badge: "bg-red-100 text-red-700",
    button: "border-red-500 bg-red-50 text-red-700",
  },
};

interface BarangayAlert {
  id: number;
  level: AlertLevel;
  title: string;
  message: string;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
  verifiedBy?: string;
  rejectionReason?: string;
  targetBarangay: string;
}

interface CommunityReport {
  id: number;
  user_name: string;
  location: string;
  lat: number | null;
  lng: number | null;
  water_level: string;
  description: string;
  timestamp: string;
  status: string;
  photo_path: string | null;
}

const STAT_PASTELS = ["lavender", "peach", "mint"] as const;

export function BarangayAdminDashboard() {
  const myDisplayName = useMyDisplayName();
  const [activeTab, setActiveTab] = useState("overview");
  const [showNotification, setShowNotification] = useState(false);
  const [selectedBarangay, setSelectedBarangay] = useState<string | null>(null);
  const [floodRisk, setFloodRisk] = useState<FloodRisk | null>(null);
  const [floodRiskLastUpdate, setFloodRiskLastUpdate] = useState<string | null>(null);
  const [myAlerts, setMyAlerts] = useState<BarangayAlert[]>([]);
  const [communityReports, setCommunityReports] = useState<CommunityReport[]>([]);
  const [residentCount, setResidentCount] = useState(0);

  const [newAlert, setNewAlert] = useState({
    level: "advisory" as AlertLevel,
    title: "",
    message: "",
  });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const loadData = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        alert("Unable to identify the signed-in Barangay administrator.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("barangay")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.barangay) {
        alert(profileError?.message ?? "Your profile has no assigned Barangay.");
        return;
      }

      const myBarangayName = profile.barangay;
      if (cancelled) return;
      setSelectedBarangay(myBarangayName);

      const { data: barangay, error: barangayError } = await supabase
        .from("barangays")
        .select("flood_risk, last_update")
        .eq("name", myBarangayName)
        .maybeSingle();

      if (cancelled) return;

      if (barangayError) {
        alert(`Unable to load flood risk: ${barangayError.message}`);
      } else if (barangay) {
        setFloodRisk(barangay.flood_risk as FloodRisk);
        setFloodRiskLastUpdate(barangay.last_update);
      }

      const [{ data: alertData }, { data: reportData }, { count }] = await Promise.all([
        supabase.from("alerts").select("*").or(`target_barangay.eq.${myBarangayName},target_barangay.eq.All Barangays`).order("sent_at", { ascending: false }),
        supabase.from("community_reports").select("*").order("timestamp", { ascending: false }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("barangay", myBarangayName),
      ]);

      if (cancelled) return;

      setMyAlerts(((alertData as Array<Record<string, unknown>>) ?? []).map((alert) => ({
        id: Number(alert.id), level: alert.level as AlertLevel, title: String(alert.title), message: String(alert.message),
        timestamp: String(alert.sent_at), status: alert.status as BarangayAlert["status"],
        verifiedBy: alert.status === "approved" ? "MDRRMO Admin" : undefined, targetBarangay: String(alert.target_barangay),
      })));
      setCommunityReports((reportData as CommunityReport[]) ?? []);
      setResidentCount(count ?? 0);

      // Guard against subscribing for a component that has already
      // unmounted (e.g. fast Vite hot-reload during dev) — an orphaned
      // subscription here would never be released, since no cleanup
      // function would ever run to close it.
      if (cancelled) return;

      // Shared barangays channel; only this admin's barangay is applied.
      unsubscribe = subscribeToTable("barangays", (payload) => {
        if (payload.eventType !== "UPDATE") return;
        const updatedBarangay = payload.new as { name: string; flood_risk: FloodRisk; last_update: string };
        if (updatedBarangay.name !== myBarangayName) return;
        setFloodRisk(updatedBarangay.flood_risk);
        setFloodRiskLastUpdate(updatedBarangay.last_update);
      });
    };

    void loadData();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const updateFloodRisk = async (level: FloodRisk) => {
    if (!selectedBarangay) {
      alert("Your profile has no assigned Barangay.");
      return;
    }

    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from("barangays")
      .update({ flood_risk: level, last_update: updatedAt })
      .eq("name", selectedBarangay);
    if (error) {
      alert(`Unable to update water level: ${error.message}`);
      return;
    }

    setFloodRisk(level);
    setFloodRiskLastUpdate(updatedAt);
  };

  const stats = [
    {
      label: "Barangay Residents",
      value: residentCount.toLocaleString(),
      icon: Users,
      color: "bg-blue-500",
    },
    {
      label: "Active Alerts",
      value: myAlerts.filter((alert) => alert.status === "approved").length.toString(),
      icon: Bell,
      color: "bg-yellow-500",
    },
    {
      label: "Community Reports",
      value: communityReports.length.toString(),
      icon: MapPin,
      color: "bg-green-500",
    },
    {
      label: "Current Water Level",
      value: floodRisk ? floodRiskConfig[floodRisk].label : "No data",
      icon: Droplets,
      color: floodRisk === "high" ? "bg-red-500" : floodRisk === "medium" ? "bg-amber-500" : "bg-green-500",
    },
  ];


  const getAlertLevelConfig = (level: AlertLevel) => {
    switch (level) {
      case "advisory":
        return { label: "ADVISORY", color: "bg-blue-500", textColor: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" };
      case "warning":
        return { label: "WARNING", color: "bg-yellow-500", textColor: "text-yellow-700", bgColor: "bg-yellow-50", borderColor: "border-yellow-200" };
      case "critical":
        return { label: "CRITICAL", color: "bg-red-500", textColor: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200" };
    }
  };

  const handleSubmitAlert = async () => {
    if (!newAlert.title || !newAlert.message) {
      alert("Please fill in all fields");
      return;
    }

    const { data, error } = await supabase.from("alerts").insert({
      level: newAlert.level,
      title: newAlert.title.trim(),
      message: newAlert.message.trim(),
      target_barangay: selectedBarangay,
      channels: "push",
      sent_at: new Date().toISOString(),
      recipients: residentCount,
      created_by: `${selectedBarangay} Barangay Admin`,
      status: "pending",
    }).select().single();
    if (error || !data) {
      alert(error?.message ?? "Unable to submit alert.");
      return;
    }
    setMyAlerts((current) => [{
      id: data.id, level: data.level, title: data.title, message: data.message,
      timestamp: data.sent_at, status: data.status, targetBarangay: data.target_barangay,
    }, ...current]);
    alert("Alert submitted to MDRRMO for verification!");
    setNewAlert({ level: "advisory", title: "", message: "" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background px-6 pt-6 pb-2">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Barangay Admin - {selectedBarangay ?? "Loading..."}</h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Barangay Management Dashboard
              </p>
            </div>
            <ProfileButton name={myDisplayName} />
            <button className="clay-btn clay-btn-secondary">
              <Settings size={18} />
              <span className="text-sm">Settings</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              // Summary tile: clay. Icon on a decorative pastel chip.
              <div
                key={index}
                className="clay p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="p-3 rounded-full" style={{ background: `var(--${STAT_PASTELS[index % STAT_PASTELS.length]})` }}>
                    <Icon size={24} style={{ color: `var(--${STAT_PASTELS[index % STAT_PASTELS.length]}-icon)` }} />
                  </div>
                </div>
                <p className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{stat.value}</p>
                <p className="text-sm text-gray-600">{stat.label}</p>
              </div>
            );
          })}
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> All alerts you create will be sent to MDRRMO Admin for verification before being broadcast to residents.
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white border border-border rounded-xl mb-6">
          <div className="border-b border-gray-200 px-4 py-3 overflow-x-auto">
            <div className="flex gap-2" role="tablist">
              {[
                { id: "overview", label: "Overview" },
                { id: "create-alert", label: "Create Alert" },
                { id: "my-alerts", label: "My Alerts" },
                { id: "reports", label: "Community Reports" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className="clay-tab"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="bg-white border-l-4 border-primary p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-lg">Water Level Status</h2>
                      <p className="text-sm text-gray-500">
                        Update the current flood risk for {selectedBarangay ?? "your Barangay"}.
                      </p>
                    </div>
                    {floodRisk ? (
                      <span className={`text-sm font-medium px-3 py-1 rounded-full ${floodRiskConfig[floodRisk].badge}`}>
                        {floodRiskConfig[floodRisk].label}
                      </span>
                    ) : (
                      <span className="text-sm font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-600">
                        Status unavailable
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(["low", "medium", "high"] as FloodRisk[]).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => updateFloodRisk(level)}
                        className={`border rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                          floodRisk === level
                            ? floodRiskConfig[level].button
                            : "border-gray-300 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {floodRiskConfig[level].label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-4">
                    Last updated: {floodRiskLastUpdate ? new Date(floodRiskLastUpdate).toLocaleString() : "Unavailable"}
                  </p>
                </div>

                <div>
                  <h2 className="text-lg mb-4">Recent Activity</h2>
                  <div className="space-y-3">
                    {myAlerts.slice(0, 2).map((alert) => (
                      <div key={alert.id} className="flex items-center justify-between p-4 bg-gray-50 border-l-4 border-risk-medium">
                        <div className="flex items-center gap-4"><div className="bg-green-100 p-2 rounded-lg"><CheckCircle size={20} className="text-green-600" /></div><div><p className="text-sm mb-1">Alert: {alert.title}</p><p className="text-xs text-gray-500">{alert.status} | {new Date(alert.timestamp).toLocaleString()}</p></div></div>
                      </div>
                    ))}
                    {communityReports.slice(0, 1).map((report) => (
                      <div key={report.id} className="flex items-center justify-between p-4 bg-gray-50 border-l-4 border-primary"><div className="flex items-center gap-4"><div className="bg-blue-100 p-2 rounded-lg"><MapPin size={20} className="text-blue-600" /></div><div><p className="text-sm mb-1">New community report received</p><p className="text-xs text-gray-500">From {report.user_name} | {new Date(report.timestamp).toLocaleString()}</p></div></div><button onClick={() => setActiveTab("reports")} className="bg-primary text-white px-4 py-2 rounded-md text-sm">View</button></div>
                    ))}
                    {!myAlerts.length && !communityReports.length && <p className="text-sm text-gray-500">No recent activity.</p>}
                  </div>
                </div>

                <div>
                  <h2 className="text-lg mb-4">Barangay Status</h2>
                  <div className="bg-white border-l-4 border-risk-high p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <AlertTriangle size={32} className="text-red-600" />
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Current Status</p>
                        <p className="text-xl">{communityReports.length ? "Reported Flood Risk" : "No reported risk"}</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700">
                      {communityReports.length ? `Latest reports indicate ${communityReports[0].water_level}-level water conditions. Monitor conditions closely.` : "No community water-level reports are available yet."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Create Alert Tab */}
            {activeTab === "create-alert" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg">Create Alert for {selectedBarangay}</h2>
                </div>

                {/* Notification Popup */}
                {showNotification && (
                  <div className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-white rounded-xl shadow-2xl p-4 max-w-sm mx-4 z-50 border border-red-200 animate-in slide-in-from-top">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="text-red-600 mt-0.5" size={20} />
                      <div className="flex-1">
                        <p className="text-sm mb-1">
                          <strong>BAHAba Alert</strong>
                        </p>
                        <p className="text-sm text-gray-600">
                          This is a preview of how your alert will appear to residents.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Alert Form */}
                <div className="bg-gray-50 rounded-lg p-5">
                  <h3 className="text-sm mb-4">Alert Details</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600 mb-2 block">
                        Alert Level
                      </label>
                      <select
                        value={newAlert.level}
                        onChange={(e) => setNewAlert({ ...newAlert, level: e.target.value as AlertLevel })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <option value="advisory">Advisory (Blue) - Information</option>
                        <option value="warning">Warning (Yellow) - Prepare to Act</option>
                        <option value="critical">Critical (Red) - Act Now</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm text-gray-600 mb-2 block">
                        Alert Title
                      </label>
                      <input
                        type="text"
                        value={newAlert.title}
                        onChange={(e) => setNewAlert({ ...newAlert, title: e.target.value })}
                        placeholder="e.g., Flood Warning - Main Road"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>

                    <div>
                      <label className="text-sm text-gray-600 mb-2 block">
                        Message
                      </label>
                      <textarea
                        value={newAlert.message}
                        onChange={(e) => setNewAlert({ ...newAlert, message: e.target.value })}
                        placeholder="Enter alert message for residents..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                        rows={4}
                      ></textarea>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowNotification(true);
                          setTimeout(() => setShowNotification(false), 3000);
                        }}
                        className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Preview
                      </button>
                      <button
                        onClick={handleSubmitAlert}
                        className="clay-btn clay-btn-primary flex-1"
                      >
                        <Send size={18} />
                        Submit to MDRRMO
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* My Alerts Tab */}
            {activeTab === "my-alerts" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg">My Alert History</h2>
                </div>

                <div className="space-y-3">
                  {myAlerts.map((alert) => {
                    const config = getAlertLevelConfig(alert.level);
                    return (
                      <div
                        key={alert.id}
                        className="border border-gray-200 rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-xs px-2 py-1 rounded-full ${config.bgColor} ${config.textColor} font-medium`}>
                                {config.label}
                              </span>
                              {alert.status === "approved" && (
                                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                                  Approved
                                </span>
                              )}
                              {alert.status === "pending" && (
                                <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                                  Pending MDRRMO Verification
                                </span>
                              )}
                              {alert.status === "rejected" && (
                                <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                                  Rejected
                                </span>
                              )}
                            </div>
                            <p className="text-sm mb-1">{alert.title}</p>
                            <p className="text-xs text-gray-500 mb-2">{alert.timestamp}</p>
                            <p className="text-sm text-gray-700">{alert.message}</p>

                            {alert.status === "rejected" && alert.rejectionReason && (
                              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                                <p className="text-xs text-red-800">
                                  <strong>Rejection Reason:</strong> {alert.rejectionReason}
                                </p>
                              </div>
                            )}

                            {alert.verifiedBy && (
                              <p className="text-xs text-gray-500 mt-2">
                                Verified by: {alert.verifiedBy}
                              </p>
                            )}
                          </div>
                          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <Eye size={18} className="text-gray-600" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Community Reports Tab */}
            {activeTab === "reports" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg">Community Reports - {selectedBarangay}</h2>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> Reports are verified by MDRRMO Admin. You can view reports from your barangay only.
                  </p>
                </div>

                <div className="space-y-3">
                  {communityReports.map((report) => (
                    <div
                      key={report.id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-200 rounded-full flex items-center justify-center text-green-700">
                            {report.user_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm mb-1">{report.user_name}</p>
                            <p className="text-xs text-gray-500">
                              {report.location}
                            </p>
                            <p className="text-xs text-gray-500 font-mono">
                              GPS: {report.lat !== null && report.lng !== null ? `${report.lat.toFixed(6)}, ${report.lng.toFixed(6)}` : "Not provided"}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            report.status === "verified"
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>

                      {report.photo_path ? <img src={report.photo_path} alt="Community report" className="w-full h-32 object-cover rounded-lg mb-3" /> : <div className="bg-gray-100 rounded-lg h-16 mb-3 flex items-center justify-center"><span className="text-sm text-gray-500">No photo attached</span></div>}

                      <p className="text-sm text-gray-700 mb-2">
                        {report.description}
                      </p>

                      <div className="flex items-center gap-2 mb-2">
                        <Droplets size={16} className="text-blue-600" />
                        <p className="text-sm text-gray-600">Water Level: {report.water_level}</p>
                      </div>

                      <p className="text-xs text-gray-500">
                        <Clock size={12} className="inline mr-1" />
                        {new Date(report.timestamp).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}