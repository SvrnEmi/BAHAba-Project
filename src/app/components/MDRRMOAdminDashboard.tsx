import { useEffect, useRef, useState } from "react";
import {
  Users,
  Bell,
  MapPin,
  Activity,
  Settings,
  AlertTriangle,
  CheckCircle,
  Send,
  Eye,
  Download,
  TrendingUp,
  BarChart3,
  Radio,
  Smartphone,
  Clock,
  XCircle,
  Trash2,
  LogOut,
  Waves
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from "../../lib/supabase";
import { BrandLogo } from "./BrandLogo";
import { RainfallForecastPanel } from "./RainfallForecastPanel";
import { subscribeToTable } from "../../lib/realtime";
import { useNavigate } from "react-router";
import { useAuth } from "../../lib/auth";
import { playNotificationSound, readAdminPopupPrefs } from "../../lib/adminPrefs";
import { QuickReportsPanel, useQuickReportPendingCount } from "./QuickReportsPanel";
import { RecentUpdatesBar, RecentUpdatesColumn, useRecentUpdates, type UpdateFilter, type UpdateItem } from "./RecentUpdatesPanel";
import { NewDot, ReportMessages } from "./ReportMessages";
import { getThreadLastSeen, hasNewMessage, useLatestMessages } from "../../lib/reportMessages";

// Alert Level Types (ISO Standard)
type AlertLevel = "advisory" | "warning" | "critical";

interface Alert {
  id: number;
  level: AlertLevel;
  title: string;
  message: string;
  targetBarangay: string;
  channels: "push"[];
  sentAt: string;
  recipients: number;
  deliveryStatus: {
    push: number;
  };
  createdBy: string;
  status: string;
}

interface AuditLog {
  id: number;
  action: string;
  user: string;
  timestamp: string;
  details: string;
}

interface Report {
  id: number;
  user_name: string;
  location: string;
  lat: number | null;
  lng: number | null;
  water_level: string;
  description: string;
  status: "pending" | "approved" | "verified" | "rejected";
  timestamp: string;
  photo_path: string | null;
  admin_reply: string | null;
  admin_reply_at: string | null;
}

interface ReviewToast {
  id: number;
  kind: "report" | "alert";
  title: string;
  description: string;
  tab: "reports" | "verify-alerts";
}

const STAT_PASTELS = ["lavender", "peach", "mint"] as const;

export function MDRRMOAdminDashboard() {
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(96);
  // Element to scroll to (and flash) after a Recent updates item switches tabs.
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showNotification, setShowNotification] = useState(false);
  const [pendingReviewSummary, setPendingReviewSummary] = useState<{ pendingReportsCount: number; pendingAlertsCount: number } | null>(null);
  const [reviewToasts, setReviewToasts] = useState<ReviewToast[]>([]);
  const [selectedAlertLevel, setSelectedAlertLevel] = useState<AlertLevel>("warning");
  const [reports, setReports] = useState<Report[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const summaryShownRef = useRef(false);
  const toastIdRef = useRef(0);

  // Pending Quick Reports for the tab badge (shares the quick_reports channel with the panel).
  const quickReportsPending = useQuickReportPendingCount();
  // Recent updates: derived from the reports/alerts state below (no extra queries or channels).
  const recentUpdates = useRecentUpdates(reports, alerts, loadingData, session?.user.id ?? null);
  // Latest message per report, for the "New" dots on the Reports tab.
  const { latest: latestMessages, update: updateLatestMessage } = useLatestMessages(reports.map((report) => report.id));
  const reportsHaveNewMessages = reports.some((report) =>
    hasNewMessage(latestMessages[report.id], "mdrrmo", session?.user.id ? getThreadLastSeen(session.user.id, report.id) : 0),
  );

  // Header height drives the sticky Recent updates column's offset.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!focusTarget) return;
    const frame = window.requestAnimationFrame(() => {
      const el = document.getElementById(focusTarget);
      setFocusTarget(null);
      if (!el) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: el.id === "mdrrmo-tabs" ? "start" : "center" });
      el.classList.remove("update-target-flash");
      void el.offsetWidth; // restart the flash if the same item is opened twice
      el.classList.add("update-target-flash");
      window.setTimeout(() => el.classList.remove("update-target-flash"), 1500);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusTarget, activeTab]);

  const openUpdate = (item: UpdateItem) => {
    if (item.source === "report") {
      setActiveTab("reports");
      setFocusTarget(`report-${item.sourceId}`);
    } else if (item.sourceStatus === "pending") {
      setActiveTab("verify-alerts");
      setFocusTarget(`verify-alert-${item.sourceId}`);
    } else {
      setActiveTab("alerts");
      setFocusTarget(`alert-history-${item.sourceId}`);
    }
  };

  const viewAllUpdates = (filter: UpdateFilter) => {
    setActiveTab(filter === "reports" ? "reports" : filter === "alerts" ? "alerts" : "audit");
    setFocusTarget("mdrrmo-tabs");
  };

  const handleLogout = async () => {
    if (!window.confirm("Log out of BAHAba?")) return;
    setLoggingOut(true);
    await signOut();
    navigate("/login", { replace: true });
  };

  const dismissReviewToast = (toastId: number) => {
    setReviewToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

  const queueReviewToast = (kind: "report" | "alert", title: string, description: string, tab: "reports" | "verify-alerts") => {
    // Read on every new item so changes made in Settings apply immediately.
    const prefs = readAdminPopupPrefs();
    if (kind === "report" ? !prefs.pendingReports : !prefs.barangayAlerts) return;
    if (prefs.sound) playNotificationSound();
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;

    setReviewToasts((current) => [...current, { id, kind, title, description, tab }]);
    window.setTimeout(() => {
      dismissReviewToast(id);
    }, 8000);
  };

  useEffect(() => {
    let cancelled = false;

    const loadDashboardData = async () => {
      const [{ data: reportData, error: reportError }, { data: alertData }, { count }, { data: auditData }] = await Promise.all([
        supabase.from("community_reports").select("*").order("timestamp", { ascending: false }),
        supabase.from("alerts").select("*", { count: "exact" }).order("sent_at", { ascending: false }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("audit_logs").select("*").order("timestamp", { ascending: false }),
      ]);

      if (cancelled) return;

      if (reportError) {
        alert(`Unable to load community reports: ${reportError.message}`);
      }
      const mappedAlerts = (((alertData as Array<Record<string, unknown>>) ?? []).map((alert) => ({
        id: Number(alert.id),
        level: (alert.level as AlertLevel) ?? "advisory",
        title: String(alert.title ?? ""),
        message: String(alert.message ?? ""),
        targetBarangay: String(alert.target_barangay ?? "All Barangays"),
        channels: ["push"] as ["push"],
        sentAt: String(alert.sent_at ?? ""),
        recipients: Number(alert.recipients ?? 0),
        deliveryStatus: { push: 0 },
        createdBy: String(alert.created_by ?? "System"),
        status: String(alert.status ?? "pending"),
      })) as Alert[]);

      setReports((reportData as Report[]) ?? []);
      setAlerts(mappedAlerts);
      setUserCount(count ?? 0);
      setAuditLogs(((auditData as Array<Record<string, unknown>>) ?? []).map((log) => ({
        id: Number(log.id),
        action: String(log.action ?? ""),
        user: String(log.user_name ?? ""),
        timestamp: String(log.timestamp ?? ""),
        details: String(log.details ?? ""),
      })));
      setLoadingData(false);

      if (!summaryShownRef.current) {
        const pendingReportsCount = ((reportData as Report[] | null) ?? []).filter((report) => report.status === "pending").length;
        const pendingAlertsCount = mappedAlerts.filter((alert) => alert.status === "pending").length;

        if (pendingReportsCount > 0 || pendingAlertsCount > 0) {
          setPendingReviewSummary({ pendingReportsCount, pendingAlertsCount });
        }
        summaryShownRef.current = true;
      }
    };

    void loadDashboardData();

    const unsubscribeReports = subscribeToTable("community_reports", (payload) => {
        if (payload.eventType === "INSERT") {
          const report = payload.new as Report;
          setReports((current) => [report, ...current.filter((item) => item.id !== report.id)]);

          if (report.status === "pending") {
            queueReviewToast(
              "report",
              `New flood report submitted by ${report.user_name || "a resident"} — awaiting review.`,
              "Review report",
              "reports"
            );
          }
        } else if (payload.eventType === "UPDATE") {
          const report = payload.new as Report;
          setReports((current) => current.map((item) => item.id === report.id ? report : item));
        } else if (payload.eventType === "DELETE") {
          const deletedReport = payload.old as Partial<Report>;
          setReports((current) => current.filter((item) => item.id !== deletedReport.id));
        }
    });

    const unsubscribeAlerts = subscribeToTable("alerts", (payload) => {
        if (payload.eventType === "INSERT") {
          const incomingAlert = payload.new as Record<string, unknown>;
          const mappedAlert: Alert = {
            id: Number(incomingAlert.id ?? 0),
            level: (incomingAlert.level as AlertLevel) ?? "advisory",
            title: String(incomingAlert.title ?? ""),
            message: String(incomingAlert.message ?? ""),
            targetBarangay: String(incomingAlert.target_barangay ?? "All Barangays"),
            channels: ["push"],
            sentAt: String(incomingAlert.sent_at ?? ""),
            recipients: Number(incomingAlert.recipients ?? 0),
            deliveryStatus: { push: 0 },
            createdBy: String(incomingAlert.created_by ?? "System"),
            status: String(incomingAlert.status ?? "pending"),
          };

          setAlerts((current) => [mappedAlert, ...current.filter((item) => item.id !== mappedAlert.id)]);

          if (mappedAlert.status === "pending") {
            queueReviewToast(
              "alert",
              `New alert submitted by Barangay ${mappedAlert.targetBarangay} — awaiting review.`,
              "Review alert",
              "verify-alerts"
            );
          }
        } else if (payload.eventType === "UPDATE") {
          const incomingAlert = payload.new as Record<string, unknown>;
          const mappedAlert: Alert = {
            id: Number(incomingAlert.id ?? 0),
            level: (incomingAlert.level as AlertLevel) ?? "advisory",
            title: String(incomingAlert.title ?? ""),
            message: String(incomingAlert.message ?? ""),
            targetBarangay: String(incomingAlert.target_barangay ?? "All Barangays"),
            channels: ["push"],
            sentAt: String(incomingAlert.sent_at ?? ""),
            recipients: Number(incomingAlert.recipients ?? 0),
            deliveryStatus: { push: 0 },
            createdBy: String(incomingAlert.created_by ?? "System"),
            status: String(incomingAlert.status ?? "pending"),
          };

          setAlerts((current) => current.map((item) => item.id === mappedAlert.id ? mappedAlert : item));
        }
    });

    return () => {
      cancelled = true;
      unsubscribeReports();
      unsubscribeAlerts();
    };
  }, []);

  const isApprovedReportStatus = (status: string) => status === "approved" || status === "verified";

  // Analytics Data
  const reportTrendsData = Array.from({ length: 5 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (4 - index));
    const dayReports = reports.filter((report) => new Date(report.timestamp).toDateString() === date.toDateString());
    return { date: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), reports: dayReports.length, verified: dayReports.filter((report) => isApprovedReportStatus(report.status)).length, rejected: dayReports.filter((report) => report.status === "rejected").length };
  });

  const reportLocations = reports.reduce<Record<string, number>>((counts, report) => {
    const name = report.location.trim() || "Unknown";
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
  const barangayReportsData = Object.entries(reportLocations).map(([name, reportCount]) => ({ name, reports: reportCount }));
  const alertDistributionData = (["advisory", "warning", "critical"] as AlertLevel[]).map((level) => ({
    name: level[0].toUpperCase() + level.slice(1),
    value: alerts.filter((alert) => alert.level === level).length,
    color: level === "advisory" ? "#3b82f6" : level === "warning" ? "#eab308" : "#ef4444",
  }));
  const userParticipationData = [{ month: new Date().toLocaleDateString(undefined, { month: "short" }), activeUsers: userCount, reports: reports.length }];

  // System Stats
  const stats = [
    {
      label: "Active Users",
      value: userCount.toLocaleString(),
      change: "+12.5%",
      icon: Users,
      color: "bg-blue-500",
      trend: "up"
    },
    {
      label: "Alerts Sent (24h)",
      value: alerts.filter((alert) => Date.now() - new Date(alert.sentAt).getTime() < 86400000).length.toString(),
      change: "+15",
      icon: Bell,
      color: "bg-yellow-500",
      trend: "up"
    },
    {
      label: "Pending Reports",
      value: reports.filter((report) => report.status === "pending").length.toString(),
      change: "-8",
      icon: MapPin,
      color: "bg-orange-500",
      trend: "down"
    },
    {
      label: "System Uptime",
      value: "99.9%",
      change: "Excellent",
      icon: Activity,
      color: "bg-green-500",
      trend: "stable"
    },
  ];

  const [newAlert, setNewAlert] = useState({
    level: "warning" as AlertLevel,
    message: "",
    channels: {
      push: true,
    }
  });
  const [selectedBarangays, setSelectedBarangays] = useState<string[]>([]);
  const [allBarangays, setAllBarangays] = useState(true);
  const [targetBarangayError, setTargetBarangayError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const barangays = ["Tuburan", "Poctoy", "Gabawan", "Batiano", "Panique", "Libertad", "Canjalon", "Liwayway", "Pit-os"];
  const messageTemplates = [
    {
      id: "advisory",
      label: "Advisory — Monitor Water Levels",
      message: "Water levels are rising in your area. Please monitor local conditions and stay updated on official announcements. No immediate action is required at this time.",
      level: "advisory" as AlertLevel,
    },
    {
      id: "warning",
      label: "Warning — Prepare to Evacuate",
      message: "Flood water levels have reached knee-to-waist height in low-lying areas. Prepare emergency supplies and be ready to evacuate to higher ground if conditions worsen.",
      level: "warning" as AlertLevel,
    },
    {
      id: "critical",
      label: "Critical — Evacuate Now",
      message: "IMMEDIATE DANGER. Flood water has reached critical levels. Evacuate to the nearest designated evacuation center now. Do not attempt to cross flooded roads or bridges.",
      level: "critical" as AlertLevel,
    },
    {
      id: "all-clear",
      label: "All Clear",
      message: "Flood water levels have returned to normal in your area. It is now safe to return to your homes. Continue to monitor for updates from MDRRMO.",
      level: null,
    },
  ];

  const getAlertLevelConfig = (level: AlertLevel) => {
    switch (level) {
      case "advisory":
        return {
          label: "ADVISORY",
          color: "bg-blue-500",
          bgColor: "bg-blue-50",
          borderColor: "border-blue-500",
          textColor: "text-blue-700",
          description: "Information and awareness"
        };
      case "warning":
        return {
          label: "WARNING",
          color: "bg-yellow-500",
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-500",
          textColor: "text-yellow-700",
          description: "Potential danger, prepare to act"
        };
      case "critical":
        return {
          label: "CRITICAL",
          color: "bg-red-500",
          bgColor: "bg-red-50",
          borderColor: "border-red-500",
          textColor: "text-red-700",
          description: "Immediate danger, act now"
        };
    }
  };

  const handleSendAlert = async () => {
    if (!newAlert.message.trim()) {
      alert("Please enter an alert message");
      return;
    }

    if (!allBarangays && selectedBarangays.length === 0) {
      setTargetBarangayError("Select at least one barangay or choose All Barangays.");
      return;
    }
    setTargetBarangayError("");

    const alertConfig = getAlertLevelConfig(newAlert.level);
    const targets = allBarangays ? ["All Barangays"] : selectedBarangays;
    const title = `${alertConfig.label} Alert`;

    const { data: { user } } = await supabase.auth.getUser();
    const insertResults = await Promise.allSettled(targets.map(async (targetBarangay) => {
      const { data: insertedAlert, error } = await supabase.from("alerts").insert({
        level: newAlert.level,
        title,
        message: newAlert.message.trim(),
        target_barangay: targetBarangay,
        channels: "push",
        sent_at: new Date().toISOString(),
        recipients: userCount,
        created_by: user?.email ?? "MDRRMO Admin",
        status: "approved",
      }).select().single();

      if (error || !insertedAlert) {
        throw new Error(error?.message ?? "Unable to save alert.");
      }
      return insertedAlert;
    }));

    const successfulAlerts = insertResults
      .filter((result): result is PromiseFulfilledResult<Record<string, any>> => result.status === "fulfilled")
      .map((result) => result.value);
    const failedBarangays = insertResults
      .map((result, index) => result.status === "rejected" ? targets[index] : null)
      .filter((target): target is string => target !== null);

    if (failedBarangays.length > 0) {
      if (successfulAlerts.length > 0) {
        setAlerts((current) => [
          ...successfulAlerts.map((insertedAlert) => ({
            id: insertedAlert.id,
            level: insertedAlert.level as AlertLevel,
            title: insertedAlert.title,
            message: insertedAlert.message,
            targetBarangay: insertedAlert.target_barangay,
            channels: ["push"] as ["push"],
            sentAt: insertedAlert.sent_at,
            recipients: insertedAlert.recipients,
            deliveryStatus: { push: 0 },
            createdBy: insertedAlert.created_by,
            status: insertedAlert.status,
          })),
          ...current,
        ]);
      }
      alert(`Alert creation failed for: ${failedBarangays.join(", ")}. Other alerts were saved successfully.`);
      return;
    }

    const createdAlerts: Alert[] = successfulAlerts.map((insertedAlert) => ({
      id: insertedAlert.id,
      level: insertedAlert.level as AlertLevel,
      title: insertedAlert.title,
      message: insertedAlert.message,
      targetBarangay: insertedAlert.target_barangay,
      channels: ["push"],
      sentAt: insertedAlert.sent_at,
      recipients: insertedAlert.recipients,
      deliveryStatus: { push: 0 },
      createdBy: insertedAlert.created_by,
      status: insertedAlert.status,
    }));

    setAlerts((current) => [...createdAlerts, ...current]);

    // Add to audit log
    const auditEntry: AuditLog = {
      id: auditLogs.length + 1,
      action: "ALERT_CREATED",
      user: "Admin: Current User",
      timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
      details: `Created ${alertConfig.label} alert for ${targets.join(", ")} via push`
    };
    setAuditLogs([auditEntry, ...auditLogs]);

    // Show success notification
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 5000);

    // Reset form
    setNewAlert({
      level: "warning",
      message: "",
      channels: {
        push: true,
      }
    });
    setSelectedBarangays([]);
    setAllBarangays(true);
    setSelectedTemplate(null);
  };

  const updateReportStatus = async (reportId: number, status: "approved" | "rejected") => {
    const { error } = await supabase.from("community_reports").update({ status }).eq("id", reportId);
    if (error) {
      alert(`Unable to update report: ${error.message}`);
      return;
    }
    setReports((current) => current.map((report) => report.id === reportId ? { ...report, status } : report));
  };

  const handleDeleteReport = async (reportId: number) => {
    const confirmed = window.confirm("Delete this community report? This action cannot be undone.");
    if (!confirmed) {
      return;
    }

    const { error } = await supabase.from("community_reports").delete().eq("id", reportId);
    if (error) {
      alert(`Unable to delete report: ${error.message}`);
      return;
    }

    setReports((current) => current.filter((report) => report.id !== reportId));
    setAuditLogs((current) => [{
      id: Date.now(),
      action: "REPORT_DELETED",
      user: "MDRRMO Admin",
      timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
      details: `Deleted community report #${reportId}`,
    }, ...current]);
  };

  return (
    <div className="min-h-screen bg-background">
      {pendingReviewSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-amber-100 p-2 text-amber-700">
                  <Bell size={20} />
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900">Pending review</p>
                  <p className="text-sm text-slate-500">Items need your attention</p>
                </div>
              </div>
              <button
                onClick={() => setPendingReviewSummary(null)}
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Dismiss summary"
              >
                <XCircle size={18} />
              </button>
            </div>

            <p className="text-base text-slate-700">
              You have <span className="font-semibold text-slate-900">{pendingReviewSummary.pendingReportsCount}</span> pending report(s) and <span className="font-semibold text-slate-900">{pendingReviewSummary.pendingAlertsCount}</span> pending alert(s) awaiting review.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {pendingReviewSummary.pendingReportsCount > 0 && (
                <button
                  onClick={() => {
                    setActiveTab("reports");
                    setPendingReviewSummary(null);
                  }}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Review Reports
                </button>
              )}
              {pendingReviewSummary.pendingAlertsCount > 0 && (
                <button
                  onClick={() => {
                    setActiveTab("verify-alerts");
                    setPendingReviewSummary(null);
                  }}
                  className="flex-1 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600"
                >
                  Review Alerts
                </button>
              )}
              <button
                onClick={() => setPendingReviewSummary(null)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
        {reviewToasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-full p-2 ${toast.kind === "alert" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                  {toast.kind === "alert" ? <Bell size={16} /> : <MapPin size={16} />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{toast.description}</p>
                </div>
              </div>
              <button
                onClick={() => dismissReviewToast(toast.id)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Dismiss notification"
              >
                <XCircle size={16} />
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setActiveTab(toast.tab);
                  dismissReviewToast(toast.id);
                }}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                Review
              </button>
              <button
                onClick={() => dismissReviewToast(toast.id)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Header (sticky from 1024px so the Recent updates column can sit under it) */}
      <div ref={headerRef} className="bg-background px-6 pt-6 pb-2 lg:sticky lg:top-0 lg:z-30">
        <div className="max-w-7xl lg:max-w-[1660px] mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <BrandLogo size={44} />
              <div>
                <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>MDRRMO Admin Dashboard</h1>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Municipal Disaster Risk Reduction & Management Office
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => navigate("/admin/mdrrmo/settings")} className="clay-btn clay-btn-secondary">
                <Settings size={18} aria-hidden="true" />
                <span className="text-sm">Settings</span>
              </button>
              <button type="button" onClick={() => void handleLogout()} disabled={loggingOut} className="clay-btn clay-btn-secondary">
                <LogOut size={18} aria-hidden="true" />
                <span className="text-sm">{loggingOut ? "Logging out..." : "Log out"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Under 1024px: Recent updates collapses into a bar right under the header. */}
      <div className="px-6 pt-2 lg:hidden">
        <div className="max-w-7xl mx-auto">
          <RecentUpdatesBar state={recentUpdates} loading={loadingData} onOpen={openUpdate} onViewAll={viewAllUpdates} />
        </div>
      </div>

      <div className="max-w-7xl lg:max-w-[1660px] mx-auto px-6 py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
      <div className="min-w-0">
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
                  <div className="flex items-center gap-1">
                    <TrendingUp size={16} className={stat.trend === 'up' ? 'text-green-600' : stat.trend === 'down' ? 'text-red-600' : 'text-gray-600'} />
                    <span className={`text-sm font-medium ${stat.trend === 'up' ? 'text-green-600' : stat.trend === 'down' ? 'text-red-600' : 'text-gray-600'}`}>
                      {stat.change}
                    </span>
                  </div>
                </div>
                <p className="text-2xl font-bold mb-1">{stat.value}</p>
                <p className="text-sm text-gray-600">{stat.label}</p>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div id="mdrrmo-tabs" className="bg-white border border-border rounded-xl mb-6" style={{ scrollMarginTop: headerHeight + 16 }}>
          <div className="border-b border-gray-200 px-4 py-3">
            <div className="flex gap-2 overflow-x-auto" role="tablist">
              {[
                { id: "overview", label: "Overview", icon: Activity },
                { id: "verify-alerts", label: "Verify Barangay Alerts", icon: CheckCircle },
                { id: "analytics", label: "Analytics & Metrics", icon: BarChart3 },
                { id: "alerts", label: "Create System Alert", icon: Radio },
                { id: "reports", label: "Verify Reports", icon: MapPin },
                { id: "quick-reports", label: "Quick Reports", icon: Waves, badge: quickReportsPending },
                { id: "audit", label: "Audit Trail", icon: Clock },
              ].map((tab) => {
                const TabIcon = tab.icon;
                const badge = "badge" in tab ? tab.badge : null;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    className="clay-tab flex items-center gap-2"
                  >
                    <TabIcon size={18} />
                    {tab.label}
                    {tab.id === "reports" && reportsHaveNewMessages && activeTab !== "reports" && <NewDot />}
                    {badge ? (
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: "var(--risk-high)" }}>
                        {badge}<span className="sr-only"> pending</span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-6">
            {activeTab === "quick-reports" && <QuickReportsPanel />}

            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold mb-4">System Overview</h2>

                <RainfallForecastPanel />

                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Bell className="text-yellow-600 mt-0.5" size={20} />
                    <div>
                      <p className="text-sm text-yellow-800 mb-1">
                        <strong>{alerts.filter((alert) => alert.status === "pending").length} Pending Barangay Alerts</strong> awaiting your verification
                      </p>
                      <button
                        onClick={() => setActiveTab("verify-alerts")}
                        className="text-sm text-yellow-700 hover:underline"
                      >
                        Review now →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Recent activity now lives in the Recent updates column / bar. */}
                <div className="grid grid-cols-1 gap-6">
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
                    <div className="space-y-3">
                      <button
                        onClick={() => setActiveTab("verify-alerts")}
                        className="w-full bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 text-yellow-800 py-3 px-4 rounded-lg text-left transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <CheckCircle size={20} />
                          <div>
                            <p className="text-sm font-medium">Verify Barangay Alerts</p>
                            <p className="text-xs">{alerts.filter((alert) => alert.status === "pending").length} pending verifications</p>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => setActiveTab("reports")}
                        className="w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 py-3 px-4 rounded-lg text-left transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin size={20} />
                          <div>
                            <p className="text-sm font-medium">Verify Community Reports</p>
                            <p className="text-xs">{reports.filter((report) => report.status === "pending").length} pending reports</p>
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => setActiveTab("alerts")}
                        className="w-full bg-green-50 hover:bg-green-100 border border-green-200 text-green-800 py-3 px-4 rounded-lg text-left transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Send size={20} />
                          <div>
                            <p className="text-sm font-medium">Create System Alert</p>
                            <p className="text-xs">Send alert to all barangays</p>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Verify Barangay Alerts Tab */}
            {activeTab === "verify-alerts" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">Verify Barangay Alerts</h2>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm text-blue-800">
                    <strong>MDRRMO Responsibility:</strong> Review and verify alerts created by Barangay Officials before broadcasting to residents.
                  </p>
                </div>

                <div className="space-y-4">
                  {alerts.filter((alert) => alert.status === "pending").map((alert) => {
                    const config = getAlertLevelConfig(alert.level);
                    return (
                      <div key={alert.id} id={`verify-alert-${alert.id}`} className="bg-white border-l-4 border-risk-medium p-5 shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-xs px-3 py-1 rounded-full ${config.bgColor} ${config.textColor} font-semibold`}>
                                {config.label}
                              </span>
                              <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                                {alert.targetBarangay}
                              </span>
                            </div>
                            <h3 className="text-lg font-semibold mb-2">{alert.title}</h3>
                            <p className="text-sm text-gray-700 mb-3">{alert.message}</p>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span>Created by: {alert.createdBy}</span>
                              <span>•</span>
                              <span>{new Date(alert.sentAt).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3 pt-4 border-t border-gray-200">
                          <button
                            onClick={() => void supabase.from("alerts").update({ status: "approved" }).eq("id", alert.id).then(({ error }) => {
                              if (error) window.alert(error.message);
                              else setAlerts((current) => current.map((item) => item.id === alert.id ? { ...item, status: "approved" } : item));
                            })}
                            className="flex-1 bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                          >
                            <CheckCircle size={18} />
                            Approve & Broadcast
                          </button>
                          <button
                            onClick={() => void supabase.from("alerts").update({ status: "rejected" }).eq("id", alert.id).then(({ error }) => {
                              if (error) window.alert(error.message);
                              else setAlerts((current) => current.map((item) => item.id === alert.id ? { ...item, status: "rejected" } : item));
                            })}
                            className="flex-1 border-2 border-red-600 text-red-600 py-2.5 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                          >
                            <XCircle size={18} />
                            Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Analytics Tab */}
            {activeTab === "analytics" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-bold mb-6">System Analytics & Performance Metrics</h2>

                  {/* Report Trends */}
                  <div className="bg-gray-50 rounded-xl p-6 mb-6">
                    <h3 className="text-lg font-semibold mb-4">Report Submission Trends (Last 5 Days)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={reportTrendsData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="reports" stroke="#3b82f6" strokeWidth={2} name="Total Reports" />
                        <Line type="monotone" dataKey="verified" stroke="#22c55e" strokeWidth={2} name="Verified" />
                        <Line type="monotone" dataKey="rejected" stroke="#ef4444" strokeWidth={2} name="Rejected" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Grid Layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Reports by Barangay */}
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h3 className="text-lg font-semibold mb-4">Reports by Barangay</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={barangayReportsData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="reports" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Alert Distribution */}
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h3 className="text-lg font-semibold mb-4">Alert Level Distribution</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={alertDistributionData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {alertDistributionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* User Participation Growth */}
                  <div className="bg-gray-50 rounded-xl p-6 mt-6">
                    <h3 className="text-lg font-semibold mb-4">User Participation Growth</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={userParticipationData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="activeUsers" stroke="#8b5cf6" strokeWidth={2} name="Active Users" />
                        <Line yAxisId="right" type="monotone" dataKey="reports" stroke="#f97316" strokeWidth={2} name="Reports Submitted" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Key Metrics Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">Avg Response Time</p>
                      <p className="text-2xl font-bold text-blue-600">8.5 min</p>
                      <p className="text-xs text-gray-500 mt-1">Report verification time</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">Communication Reach</p>
                      <p className="text-2xl font-bold text-green-600">4,567</p>
                      <p className="text-xs text-gray-500 mt-1">Total people reached today</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">Report Accuracy</p>
                      <p className="text-2xl font-bold text-purple-600">92%</p>
                      <p className="text-xs text-gray-500 mt-1">Verified vs total reports</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Multi-Channel Alerts Tab */}
            {activeTab === "alerts" && (
              <div className="space-y-6">
                {/* Success Notification */}
                {showNotification && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle className="text-green-600 mt-0.5 flex-shrink-0" size={20} />
                    <div>
                      <p className="text-sm font-semibold text-green-800">Alert Sent Successfully!</p>
                      <p className="text-xs text-green-700 mt-1">
                        Your alert has been broadcast to all selected channels and recipients will receive notifications shortly.
                      </p>
                    </div>
                  </div>
                )}

                {/* Alert Creation Form */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <h2 className="text-lg font-bold mb-6">Create Standardized Alert</h2>

                  <div className="space-y-5">
                    {/* Alert Level Selection */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        Alert Level (ISO Standard) *
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {(["advisory", "warning", "critical"] as AlertLevel[]).map((level) => {
                          const config = getAlertLevelConfig(level);
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setNewAlert({ ...newAlert, level })}
                              className={`${config.bgColor} ${config.borderColor} border-2 rounded-xl p-4 text-left transition-all ${
                                newAlert.level === level ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`${config.color} w-3 h-3 rounded-full mt-1 flex-shrink-0`}></div>
                                <div className="flex-1">
                                  <p className={`text-sm font-bold ${config.textColor} mb-1`}>{config.label}</p>
                                  <p className="text-xs text-gray-600">{config.description}</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Target Barangay */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Target Barangay *
                      </label>
                      <label className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allBarangays}
                          onChange={(e) => {
                            setAllBarangays(e.target.checked);
                            if (e.target.checked) setSelectedBarangays([]);
                            setTargetBarangayError("");
                          }}
                          className="w-5 h-5"
                        />
                        <span className="text-sm font-medium">All Barangays</span>
                      </label>
                      <select
                        multiple
                        value={selectedBarangays}
                        disabled={allBarangays}
                        onChange={(e) => {
                          setSelectedBarangays(Array.from(e.target.selectedOptions, (option) => option.value));
                          setTargetBarangayError("");
                        }}
                        className={`mt-3 w-full min-h-36 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${allBarangays ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "border-gray-300 bg-white"}`}
                        aria-label="Select individual barangays"
                      >
                        {barangays.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Hold Ctrl (Windows) or Command (Mac) to select multiple barangays.</p>
                      {targetBarangayError && <p className="text-sm text-red-600 mt-2">{targetBarangayError}</p>}
                    </div>

                    {/* Multi-Channel Selection */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        Communication Channel
                      </label>
                      <div className="grid grid-cols-1 gap-3">
                        <label className="flex items-center gap-3 bg-white border-2 border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked
                            readOnly
                            className="w-5 h-5"
                          />
                          <Smartphone size={20} className="text-blue-600" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Push Notification</p>
                            <p className="text-xs text-gray-500">In-app alert</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Message */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        Quick Templates
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                        {messageTemplates.map((template) => (
                          <label key={template.id} className={`flex items-start gap-3 bg-white border-2 rounded-lg p-3 cursor-pointer transition-colors ${selectedTemplate === template.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                            <input
                              type="checkbox"
                              checked={selectedTemplate === template.id}
                              onChange={() => {
                                setSelectedTemplate(template.id);
                                setNewAlert({ ...newAlert, message: template.message });
                              }}
                              className="w-5 h-5 mt-0.5"
                            />
                            <span className="text-sm font-medium">{template.label}</span>
                          </label>
                        ))}
                      </div>
                      {selectedTemplate && messageTemplates.find((template) => template.id === selectedTemplate)?.level && messageTemplates.find((template) => template.id === selectedTemplate)?.level !== newAlert.level && (
                        <p className="text-xs text-amber-700 mb-2">This template is written for a different alert level. Consider updating Alert Level above.</p>
                      )}
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Alert Message *
                      </label>
                      <textarea
                        value={newAlert.message}
                        onChange={(e) => setNewAlert({ ...newAlert, message: e.target.value })}
                        placeholder="Enter detailed alert message for residents..."
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={4}
                      ></textarea>
                      <p className="text-xs text-gray-500 mt-1">
                        Clear and actionable instructions. Avoid jargon.
                      </p>
                    </div>

                    {/* Send Button */}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleSendAlert}
                        className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2"
                      >
                        <Send size={20} />
                        Broadcast Alert Now
                      </button>
                      <button className="px-6 border-2 border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition-colors font-semibold">
                        Schedule
                      </button>
                    </div>
                  </div>
                </div>

                {/* Alert History with Channel Tracking */}
                <div>
                  <h3 className="text-lg font-bold mb-4">Alert History & Delivery Status</h3>
                  <div className="space-y-3">
                    {alerts.map((alert) => {
                      const config = getAlertLevelConfig(alert.level);
                      return (
                        <div key={alert.id} id={`alert-history-${alert.id}`} className="bg-white border border-gray-200 rounded-xl p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`${config.color} px-3 py-1 rounded-full text-xs font-bold text-white`}>
                                  {config.label}
                                </span>
                                <span className="text-xs text-gray-500">• {alert.targetBarangay}</span>
                              </div>
                              <h4 className="text-sm font-semibold mb-1">{alert.title}</h4>
                              <p className="text-sm text-gray-700 mb-2">{alert.message}</p>
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>{alert.sentAt}</span>
                                <span>•</span>
                                <span>By: {alert.createdBy}</span>
                              </div>
                            </div>
                          </div>

                          {/* Delivery Status */}
                          <div className="bg-gray-50 rounded-lg p-4 mt-4">
                            <p className="text-xs font-semibold text-gray-700 mb-3">Delivery Status:</p>
                            <div className="grid grid-cols-1 gap-3">
                              <div className="flex items-center gap-2">
                                <Smartphone size={16} className="text-blue-600" />
                                <div>
                                  <p className="text-xs text-gray-600">Push</p>
                                  <p className="text-sm font-semibold">{alert.deliveryStatus.push}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Audit Trail Tab */}
            {activeTab === "audit" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold">System Audit Trail & Message Traceability</h2>
                  <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    <Download size={18} />
                    Export Logs
                  </button>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-700">
                    <strong>Purpose:</strong> Complete audit trail of all system actions for accountability, traceability, and compliance.
                    All administrative actions are logged with timestamp, user, and details.
                  </p>
                </div>

                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          {log.action.includes("ALERT") && <Bell size={20} className="text-yellow-600" />}
                          {log.action.includes("REPORT") && <MapPin size={20} className="text-blue-600" />}
                          {log.action.includes("LOGIN") && <Users size={20} className="text-green-600" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="px-2 py-1 bg-gray-100 rounded text-xs font-mono font-semibold">
                              {log.action}
                            </span>
                            <span className="text-xs text-gray-500">{log.timestamp}</span>
                          </div>
                          <p className="text-sm text-gray-700 mb-1">{log.details}</p>
                          <p className="text-xs text-gray-500">User: {log.user}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "reports" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">Community Reports Management</h2>
                  <span className="text-sm text-gray-500">{reports.length} total reports</span>
                </div>
                {loadingData ? (
                  <p className="text-sm text-gray-500">Loading reports...</p>
                ) : reports.length === 0 ? (
                  <p className="text-sm text-gray-500">No community reports have been submitted.</p>
                ) : reports.map((report) => {
                  const statusLabel = report.status === "approved" || report.status === "verified" ? "verified" : report.status;
                  const statusClasses = report.status === "pending"
                    ? "bg-yellow-100 text-yellow-700"
                    : isApprovedReportStatus(report.status)
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700";

                  return (
                    <div key={report.id} id={`report-${report.id}`} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold">{report.user_name}</p>
                          <p className="text-sm text-gray-600">{report.location} {report.lat !== null && report.lng !== null ? `(${report.lat.toFixed(6)}, ${report.lng.toFixed(6)})` : ""}</p>
                          <p className="text-sm mt-2">{report.description}</p>
                          <p className="text-xs text-gray-500 mt-2">Water level: {report.water_level} | {new Date(report.timestamp).toLocaleString()}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${statusClasses}`}>
                          {statusLabel}
                        </span>
                      </div>
                      {report.photo_path && <img src={report.photo_path} alt="Community report" className="mt-3 w-full max-h-56 object-cover rounded-lg" />}

                      {/* Thread with the resident and Barangay; the old single reply shows first. */}
                      <ReportMessages
                        reportId={report.id}
                        viewerRole="mdrrmo"
                        userId={session?.user.id ?? null}
                        latest={latestMessages[report.id]}
                        onLatest={updateLatestMessage}
                        legacyReply={{ body: report.admin_reply, at: report.admin_reply_at }}
                        canDelete
                      />

                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Admin actions</p>
                        <div className="flex flex-wrap gap-3">
                          {report.status === "pending" && (
                            <>
                              <button onClick={() => void updateReportStatus(report.id, "approved")} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm">Verify</button>
                              <button onClick={() => void updateReportStatus(report.id, "rejected")} className="border border-red-600 text-red-600 px-4 py-2 rounded-lg text-sm">Reject</button>
                            </>
                          )}
                          <button
                            onClick={() => void handleDeleteReport(report.id)}
                            title="Delete report"
                            className="inline-flex items-center gap-2 border border-red-600 text-red-600 px-4 py-2 rounded-lg text-sm hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                            Delete report
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 1024px+: live Recent updates column, sticky under the header, scrolls inside itself. */}
      <aside
        className="hidden lg:block lg:sticky"
        style={{ top: headerHeight + 16, height: `calc(100vh - ${headerHeight}px - 32px)` }}
      >
        <RecentUpdatesColumn state={recentUpdates} loading={loadingData} onOpen={openUpdate} onViewAll={viewAllUpdates} />
      </aside>
      </div>
    </div>
  );
}