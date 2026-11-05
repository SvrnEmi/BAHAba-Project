import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  Bell,
  MapPin,
  Settings,
  CheckCircle,
  Send,
  Smartphone,
  XCircle,
  Trash2,
  LogOut,
  Waves,
  ChevronRight,
  Droplets,
  Download,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { FloodEventsPanel } from "./FloodEventsPanel";
import { supabase } from "../../lib/supabase";
import { BrandLogo } from "./BrandLogo";
import { RainfallForecastPanel } from "./RainfallForecastPanel";
import { subscribeToTable } from "../../lib/realtime";
import { useAuth } from "../../lib/auth";
import { playNotificationSound, readAdminPopupPrefs } from "../../lib/adminPrefs";
import { QuickReportsPanel, useQuickReportPendingCount } from "./QuickReportsPanel";
import { RecentUpdatesBar, RecentUpdatesColumn, useRecentUpdates, type FeedAlert, type UpdateFilter, type UpdateItem } from "./RecentUpdatesPanel";
import { NewDot, ReportMessages } from "./ReportMessages";
import { getThreadLastSeen, hasNewMessage, useLatestMessages } from "../../lib/reportMessages";
import { ADMIN_TABS, MDRRMO_DEFAULT_TAB, MDRRMO_OTHER_TABS, type AdminTabId, type MdrrmoTabId } from "../../lib/adminNav";
import { writeAuditLog } from "../../lib/audit";
import { displayReporterName, waterLevelLabel } from "../../lib/reports";
import { errorMessage, formatManilaDateTime } from "../../lib/barangayAdmin";
import { useBarangayNames } from "../../lib/barangays";
import {
  ALERT_COLUMNS,
  ALERT_END_OPTIONS,
  ALL_BARANGAYS,
  EVERY_TARGET,
  PAGASA,
  PAGASA_LEVEL_OPTIONS,
  alertEndIso,
  alertEndProblem,
  alertLifecycle,
  alertPreviewText,
  allClearMessage,
  allClearTitle,
  pagasaText,
  toAlertRow,
  useActiveAlertIds,
  type AlertEnd,
  type AlertLevel,
  type AlertRow,
} from "../../lib/alerts";
import { AlertScrollList, CollapsibleAlertCard, DisclosureCard } from "./alerts/AlertDisclosure";
import { BarangayBroadcastBox, useMdrrmoAlertActions } from "./alerts/MdrrmoAlertActions";
import { InfoTip } from "./InfoTip";
import { MdrrmoAnalytics } from "./MdrrmoAnalytics";
import { MdrrmoContacts } from "./MdrrmoContacts";
import { MdrrmoObservations } from "./MdrrmoObservations";
import { ReportPager, ReportSearchControls } from "./ReportSearchControls";
import {
  REPORT_PAGE_SIZE,
  SERVER_REPORT_COLUMNS,
  cleanReportSearch,
  useReportPage,
  type ReportStatusFilter,
  type ServerReportSort,
} from "../../lib/reportServerQuery";
import { ReportReviewDialog, ReportThumb, ReviewReasons } from "./barangay/BarangayReports";

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
  rejection_reason: string | null;
  approval_reason: string | null;
  user_id: string | null;
  barangay: string | null;
}

const REPORT_COLUMNS = SERVER_REPORT_COLUMNS;

interface ReviewToast {
  id: number;
  kind: "report" | "alert";
  title: string;
  description: string;
  tab: AdminTabId;
}

const STAT_PASTELS = ["lavender", "peach", "mint"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export function MDRRMOAdminDashboard() {
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const adminEmail = session?.user.email ?? "MDRRMO Admin";
  const [loggingOut, setLoggingOut] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(96);
  // Element to scroll to (and flash) after a Recent updates item switches tabs.
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MdrrmoTabId>(MDRRMO_DEFAULT_TAB);
  const [showNotification, setShowNotification] = useState(false);
  const [pendingReviewSummary, setPendingReviewSummary] = useState<{ pendingReportsCount: number } | null>(null);
  const [reviewToasts, setReviewToasts] = useState<ReviewToast[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const activeIds = useActiveAlertIds(EVERY_TARGET, alerts);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [reviewingReport, setReviewingReport] = useState<{ report: Report; decision: "approved" | "rejected" } | null>(null);
  const summaryShownRef = useRef(false);
  const toastIdRef = useRef(0);

  // Pending Quick Reports for the tab badge (shares the quick_reports channel with the panel).
  const quickReportsPending = useQuickReportPendingCount();
  // Recent updates: derived from the reports/alerts state below (no extra queries or channels).
  const feedAlerts = useMemo<FeedAlert[]>(
    () =>
      alerts.map((a) => ({
        id: a.id,
        title: `[${pagasaText(a.level)}] ${a.title}`,
        targetBarangay: a.target_barangay,
        sentAt: a.sent_at ?? "",
        createdBy: a.created_by ?? "System",
        status: a.status,
      })),
    [alerts],
  );
  const recentUpdates = useRecentUpdates(reports, feedAlerts, loadingData, session?.user.id ?? null);
  // Latest message per report, for the "New" dots on the Reports tab.
  const { latest: latestMessages, update: updateLatestMessage } = useLatestMessages(reports.map((report) => report.id));
  const reportsHaveNewMessages = reports.some((report) =>
    hasNewMessage(latestMessages[report.id], "mdrrmo", session?.user.id ? getThreadLastSeen(session.user.id, report.id) : 0),
  );

  const upsertAlert = (row: AlertRow) =>
    setAlerts((current) => [row, ...current.filter((a) => a.id !== row.id)].sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? "")));
  const dropAlert = (id: number) => setAlerts((current) => current.filter((a) => a.id !== id));
  const { actions: alertActions, dialogs: alertDialogs } = useMdrrmoAlertActions(adminEmail, upsertAlert, dropAlert);

  // Clock for relative times (no data requests).
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

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

  const queueReviewToast = (kind: "report" | "alert", title: string, description: string, tab: ReviewToast["tab"]) => {
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
        supabase.from("community_reports").select(REPORT_COLUMNS).order("timestamp", { ascending: false }),
        supabase.from("alerts").select(ALERT_COLUMNS).order("sent_at", { ascending: false }).limit(500),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("audit_logs").select("id, action, user_name, timestamp, details").order("timestamp", { ascending: false }),
      ]);

      if (cancelled) return;

      if (reportError) {
        alert(`Unable to load community reports: ${reportError.message}`);
      }
      const mappedAlerts = ((alertData as Array<Record<string, unknown>>) ?? []).map(toAlertRow);

      setReports((reportData as unknown as Report[]) ?? []);
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
        const pendingReportsCount = ((reportData as unknown as Report[] | null) ?? []).filter((report) => report.status === "pending").length;

        if (pendingReportsCount > 0) {
          setPendingReviewSummary({ pendingReportsCount });
        }
        summaryShownRef.current = true;
      }
    };

    void loadDashboardData();

    // Shared channels (subscribeToTable removes them with supabase.removeChannel on cleanup).
    const unsubscribeReports = subscribeToTable("community_reports", (payload) => {
      if (cancelled) return;
      if (payload.eventType === "INSERT") {
        const report = payload.new as unknown as Report;
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
        const report = payload.new as unknown as Report;
        setReports((current) => current.map((item) => item.id === report.id ? report : item));
      } else if (payload.eventType === "DELETE") {
        const deletedReport = payload.old as Partial<Report>;
        setReports((current) => current.filter((item) => item.id !== deletedReport.id));
      }
    });

    const unsubscribeAlerts = subscribeToTable("alerts", (payload) => {
      if (cancelled) return;
      if (payload.eventType === "DELETE") {
        const id = Number((payload.old as { id?: unknown }).id);
        setAlerts((current) => current.filter((item) => item.id !== id));
        return;
      }
      const row = toAlertRow(payload.new as Record<string, unknown>);
      setAlerts((current) => [row, ...current.filter((item) => item.id !== row.id)].sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? "")));
      if (payload.eventType !== "INSERT") return;
      if (row.source === "barangay") {
        queueReviewToast("alert", `Barangay ${row.target_barangay} published ${alertPreviewText(row)}.`, "Open barangay alerts", "alerts");
      }
    });

    return () => {
      cancelled = true;
      unsubscribeReports();
      unsubscribeAlerts();
    };
  }, []);

  // Community Reports tab: server-side search, status filter, sort and pages.
  const [reportSearchInput, setReportSearchInput] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [reportSort, setReportSort] = useState<ServerReportSort>("newest");
  const [reportStatus, setReportStatus] = useState<ReportStatusFilter>("all");
  const [reportPage, setReportPage] = useState(1);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = cleanReportSearch(reportSearchInput);
      if (next !== reportSearch) {
        setReportSearch(next);
        setReportPage(1);
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [reportSearchInput, reportSearch]);
  // `reports` changes on every realtime event and local review/delete, so the page reloads in place.
  const reportList = useReportPage<Report>({ search: reportSearch, status: reportStatus, sort: reportSort, page: reportPage }, reports);
  const reportMatching = reportList.counts[reportStatus];
  const reportPages = Math.max(1, Math.ceil(reportMatching / REPORT_PAGE_SIZE));
  // A delete can empty the last page: step back to the new last page.
  useEffect(() => {
    if (!reportList.loading && reportPage > reportPages) setReportPage(reportPages);
  }, [reportList.loading, reportPage, reportPages]);
  const reportFiltered = reportSearch !== "" || reportStatus !== "all";
  const clearReportSearch = () => {
    setReportSearchInput("");
    setReportSearch("");
    setReportStatus("all");
    setReportPage(1);
  };

  const pendingReports = reports.filter((report) => report.status === "pending");

  // Overview cards: every number comes from the loaded tables.
  const stats = [
    {
      label: "Registered users",
      value: userCount.toLocaleString(),
      icon: Users,
      info: "All accounts in BAHAba (residents, barangay admins and MDRRMO), counted from the profiles table.",
    },
    {
      label: "Alerts sent (24h)",
      value: alerts.filter((alert) => alert.status === "approved" && now - new Date(alert.sent_at ?? 0).getTime() < DAY_MS).length.toString(),
      icon: Bell,
      info: "Published alerts sent in the last 24 hours from every source (barangay, MDRRMO and automatic). Withdrawn alerts are not counted.",
    },
    {
      label: "Pending reports",
      value: pendingReports.length.toString(),
      icon: MapPin,
      info: "Community reports from signed-in residents that no barangay admin or MDRRMO has approved or rejected yet.",
    },
    {
      label: "Pending Quick Reports",
      value: quickReportsPending == null ? "--" : String(quickReportsPending),
      icon: Waves,
      info: "Quick Reports (sent without an account) waiting for MDRRMO review, not counting reports flagged as false.",
    },
  ];

  const [newAlert, setNewAlert] = useState({
    level: "warning" as AlertLevel,
    message: "",
  });
  const [selectedBarangays, setSelectedBarangays] = useState<string[]>([]);
  const [allBarangays, setAllBarangays] = useState(true);
  const [targetBarangayError, setTargetBarangayError] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [alertEnd, setAlertEnd] = useState<AlertEnd>("none");
  const [customEnd, setCustomEnd] = useState("");
  const [allClear, setAllClear] = useState(false);
  const [allClearText, setAllClearText] = useState("");
  const [allClearEdited, setAllClearEdited] = useState(false);
  const [alertFormError, setAlertFormError] = useState("");

  // An all clear goes to one place, so its text can name it.
  const singleTarget = allBarangays ? ALL_BARANGAYS : selectedBarangays.length === 1 ? selectedBarangays[0] : null;

  // Follow the chosen target until the admin edits the text.
  useEffect(() => {
    if (!allClear || allClearEdited || !singleTarget) return;
    setAllClearText(allClearTitle(singleTarget));
    setNewAlert({ level: "advisory", message: allClearMessage(singleTarget) });
  }, [allClear, allClearEdited, singleTarget]);

  const resetAlertForm = () => {
    setNewAlert({ level: "warning", message: "" });
    setSelectedBarangays([]);
    setAllBarangays(true);
    setSelectedTemplate(null);
    setAlertEnd("none");
    setCustomEnd("");
    setAllClear(false);
    setAllClearText("");
    setAllClearEdited(false);
    setAlertFormError("");
  };

  const startAllClear = () => {
    const target = singleTarget ?? ALL_BARANGAYS;
    setAllClear(true);
    setAllClearEdited(false);
    setAllClearText(allClearTitle(target));
    setNewAlert({ level: "advisory", message: allClearMessage(target) });
    setAlertEnd("12");
    setCustomEnd("");
    setAlertFormError("");
  };

  const barangays = useBarangayNames();
  const messageTemplates = [
    {
      id: "advisory",
      label: "Yellow - Be Alert: Monitor water levels",
      message: "Water levels are rising in your area. Please monitor local conditions and stay updated on official announcements. No immediate action is required at this time.",
      level: "advisory" as AlertLevel,
    },
    {
      id: "warning",
      label: "Orange - Be Prepared: Prepare to evacuate",
      message: "Flood water levels have reached knee-to-waist height in low-lying areas. Prepare emergency supplies and be ready to evacuate to higher ground if conditions worsen.",
      level: "warning" as AlertLevel,
    },
    {
      id: "critical",
      label: "Red - Take Action: Evacuate now",
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

  const handleSendAlert = async () => {
    setAlertFormError("");
    if (!newAlert.message.trim()) {
      alert("Please enter an alert message");
      return;
    }

    if (!allBarangays && selectedBarangays.length === 0) {
      setTargetBarangayError("Select at least one barangay or choose All Barangays.");
      return;
    }
    setTargetBarangayError("");

    // The database only checks this for barangay officials, so it is enforced here.
    const endProblem = alertEndProblem(alertEnd, customEnd);
    if (endProblem) {
      setAlertFormError(endProblem);
      return;
    }
    if (allClear && !singleTarget) {
      setTargetBarangayError("An all clear goes to one barangay or All Barangays.");
      return;
    }
    if (allClear && !allClearText.trim()) {
      setAlertFormError("Please enter a title.");
      return;
    }
    if (allClear) {
      const scope = singleTarget === ALL_BARANGAYS ? "every barangay" : singleTarget;
      if (!window.confirm(`Send this all clear to ${singleTarget}? Every earlier alert for ${scope}, from any source, will show as Cleared.`)) return;
    }

    const targets = allBarangays ? [ALL_BARANGAYS] : selectedBarangays;
    const title = allClear ? allClearText.trim() : `${pagasaText(newAlert.level)} Alert`;
    const expiresAt = alertEndIso(alertEnd, customEnd);
    const auditDetails = `Created ${allClear ? "all clear" : `${pagasaText(newAlert.level)} alert`} for ${targets.join(", ")} via push`;

    const insertResults = await Promise.allSettled(targets.map(async (targetBarangay) => {
      const { data: insertedAlert, error } = await supabase.from("alerts").insert({
        level: newAlert.level,
        title,
        message: newAlert.message.trim(),
        target_barangay: targetBarangay,
        channels: "push",
        sent_at: new Date().toISOString(),
        recipients: userCount,
        created_by: adminEmail,
        status: "approved",
        source: "mdrrmo",
        expires_at: expiresAt,
        is_all_clear: allClear,
      }).select(ALERT_COLUMNS).single();

      if (error || !insertedAlert) {
        throw new Error(error?.message ?? "Unable to save alert.");
      }
      return toAlertRow(insertedAlert as Record<string, unknown>);
    }));

    const successfulAlerts = insertResults
      .filter((result): result is PromiseFulfilledResult<AlertRow> => result.status === "fulfilled")
      .map((result) => result.value);
    const failedBarangays = insertResults
      .map((result, index) => result.status === "rejected" ? `${targets[index]} (${errorMessage(result.reason, "unknown error")})` : null)
      .filter((target): target is string => target !== null);

    successfulAlerts.forEach(upsertAlert);

    if (failedBarangays.length > 0) {
      alert(`Alert creation failed for: ${failedBarangays.join(", ")}. Other alerts were saved successfully.`);
      return;
    }

    void writeAuditLog("ALERT_CREATED", adminEmail, auditDetails);
    setAuditLogs((current) => [{
      id: Date.now(),
      action: "ALERT_CREATED",
      user: adminEmail,
      timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
      details: auditDetails,
    }, ...current]);

    // Show success notification
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 5000);

    resetAlertForm();
  };

  /** Approve (approval_reason) or reject (rejection_reason); logged for the review-time analytics. */
  const saveReportReview = async (report: Report, decision: "approved" | "rejected", reason: string) => {
    const values =
      decision === "approved"
        ? { status: "approved", approval_reason: reason, rejection_reason: null }
        : { status: "rejected", rejection_reason: reason, approval_reason: null };
    const { data, error } = await supabase.from("community_reports").update(values).eq("id", report.id).select(REPORT_COLUMNS);
    if (error) throw error;
    if (!data?.length) throw new Error("The database did not save the change (no permission for this report).");
    const saved = data[0] as unknown as Report;
    setReports((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    const action = decision === "approved" ? "REPORT_APPROVED" : "REPORT_REJECTED";
    const details = `Report #${report.id} ${decision}: ${reason}`;
    void writeAuditLog(action, adminEmail, details);
    setAuditLogs((current) => [{ id: Date.now(), action, user: adminEmail, timestamp: new Date().toISOString().slice(0, 19).replace("T", " "), details }, ...current]);
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
    void writeAuditLog("REPORT_DELETED", adminEmail, `Deleted community report #${reportId}`);
    setAuditLogs((current) => [{
      id: Date.now(),
      action: "REPORT_DELETED",
      user: adminEmail,
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
              You have <span className="font-semibold text-slate-900">{pendingReviewSummary.pendingReportsCount}</span> pending report(s) awaiting review.
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
                {toast.kind === "alert" ? "Open" : "Review"}
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
        {/* Overview cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            const pastel = STAT_PASTELS[index % STAT_PASTELS.length];
            return (
              // Summary tile: clay. Icon on a decorative pastel chip.
              <div key={stat.label} className="clay p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 rounded-full" style={{ background: `var(--${pastel})` }}>
                    <Icon size={24} style={{ color: `var(--${pastel}-icon)` }} aria-hidden="true" />
                  </div>
                  <InfoTip label={stat.label}>{stat.info}</InfoTip>
                </div>
                <p className="text-2xl font-bold mb-1">{stat.value}</p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{stat.label}</p>
              </div>
            );
          })}
        </div>

        {/* Barangay-published alerts: collapsed by default so reports stay the main focus. */}
        <BarangayBroadcastBox alerts={alerts} activeIds={activeIds} now={now} adminEmail={adminEmail} onChanged={upsertAlert} onDeleted={dropAlert} />

        {/* Tabs */}
        <div id="mdrrmo-tabs" className="bg-white border border-border rounded-xl mb-6" style={{ scrollMarginTop: headerHeight + 16 }}>
          <div className="border-b border-gray-200 px-4 py-3">
            <div className="flex gap-2 overflow-x-auto" role="tablist">
              {[...ADMIN_TABS, ...MDRRMO_OTHER_TABS].map((tab) => {
                const TabIcon = tab.icon;
                const badge = tab.id === "reports" ? pendingReports.length : tab.id === "quick-reports" ? quickReportsPending : null;
                return (
                  <Fragment key={tab.id}>
                  {tab.id === MDRRMO_OTHER_TABS[0].id && (
                    <span role="presentation" className="flex shrink-0 items-center border-l border-gray-300 pl-3 text-xs font-bold uppercase" style={{ color: "var(--text-secondary)" }}>
                      Other
                    </span>
                  )}
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    className="clay-tab flex items-center gap-2"
                  >
                    <TabIcon size={18} aria-hidden="true" />
                    {tab.label}
                    {tab.id === "reports" && reportsHaveNewMessages && activeTab !== "reports" && <NewDot />}
                    {badge ? (
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: "var(--risk-high)" }}>
                        {badge}<span className="sr-only"> pending</span>
                      </span>
                    ) : null}
                  </button>
                  </Fragment>
                );
              })}
            </div>
          </div>

          <div className="p-4 sm:p-6">
            {activeTab === "quick-reports" && <QuickReportsPanel />}
            {activeTab === "flood-events" && <FloodEventsPanel />}
            {activeTab === "emergency-contacts" && <MdrrmoContacts />}
            {activeTab === "field-observations" && <MdrrmoObservations now={now} />}

            {/* Overview Tab: summary, then analytics, then the forecast */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <h2 className="text-xl font-bold">System Overview</h2>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("reports")}
                    className="clay clay-press flex min-h-12 items-center gap-3 p-4 text-left"
                  >
                    <MapPin size={20} aria-hidden="true" style={{ color: "var(--primary-brand)" }} />
                    <span className="flex-1">
                      <span className="block text-sm font-bold">Verify community reports</span>
                      <span className="block text-xs font-normal" style={{ color: "var(--text-secondary)" }}>{pendingReports.length} pending</span>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("alerts")}
                    className="clay clay-press flex min-h-12 items-center gap-3 p-4 text-left"
                  >
                    <Send size={20} aria-hidden="true" style={{ color: "var(--risk-low)" }} />
                    <span className="flex-1">
                      <span className="block text-sm font-bold">Create alert</span>
                      <span className="block text-xs font-normal" style={{ color: "var(--text-secondary)" }}>Send an alert to one or all barangays</span>
                    </span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </div>

                <MdrrmoAnalytics />

                <RainfallForecastPanel />
              </div>
            )}

            {/* Create Alert Tab */}
            {activeTab === "alerts" && (
              <div className="space-y-6">
                {/* Success Notification */}
                {showNotification && (
                  <div role="status" className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle className="text-green-600 mt-0.5 flex-shrink-0" size={20} aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-green-800">Alert Sent Successfully!</p>
                      <p className="text-xs text-green-700 mt-1">
                        Your alert has been broadcast and recipients will receive notifications shortly.
                      </p>
                    </div>
                  </div>
                )}

                {/* Alert Creation Form */}
                <div className="bg-gray-50 rounded-xl p-4 sm:p-6">
                  <h2 className="text-lg font-bold mb-6">Create Alert</h2>

                  <div className="space-y-5">
                    {allClear ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 text-sm" style={{ color: "var(--text-primary)", borderLeft: "4px solid var(--risk-low)" }}>
                        <span>This is an all clear. Earlier alerts for the target will show as Cleared.</span>
                        <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={resetAlertForm}>
                          <XCircle size={16} aria-hidden="true" /> Cancel all clear
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={startAllClear}>
                        <CheckCircle size={16} aria-hidden="true" /> All clear
                      </button>
                    )}
                    {/* PAGASA level */}
                    <label className="block">
                      <span className="block text-sm font-semibold text-gray-700 mb-2">PAGASA alert level *</span>
                      <select
                        className="clay-input"
                        value={newAlert.level}
                        disabled={allClear}
                        onChange={(e) => setNewAlert({ ...newAlert, level: e.target.value as AlertLevel })}
                      >
                        {PAGASA_LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <span className="mt-2 inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                        <span className={`risk-badge is-compact ${PAGASA[newAlert.level].badge}`}>{pagasaText(newAlert.level)}</span>
                        Push preview: [{pagasaText(newAlert.level)}] {allClear ? allClearText : `${pagasaText(newAlert.level)} Alert`}
                      </span>
                    </label>

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

                    {/* Channel */}
                    <div>
                      <p className="block text-sm font-semibold text-gray-700 mb-3">Communication Channel</p>
                      <div className="flex items-center gap-3 bg-white border-2 border-gray-200 rounded-lg p-3">
                        <Smartphone size={20} className="text-blue-600" aria-hidden="true" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Push Notification</p>
                          <p className="text-xs text-gray-500">In-app alert</p>
                        </div>
                      </div>
                    </div>

                    {/* Message */}
                    <div>
                      <p className="block text-sm font-semibold text-gray-700 mb-3">Quick Templates</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                        {messageTemplates.map((template) => (
                          <label key={template.id} className={`flex items-start gap-3 bg-white border-2 rounded-lg p-3 cursor-pointer transition-colors ${selectedTemplate === template.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                            <input
                              type="radio"
                              name="alert-template"
                              checked={selectedTemplate === template.id}
                              onChange={() => {
                                setSelectedTemplate(template.id);
                                if (template.id === "all-clear") {
                                  // Only the all-clear path sets is_all_clear, which is what ends earlier alerts.
                                  startAllClear();
                                  return;
                                }
                                setAllClear(false);
                                setNewAlert({ level: template.level ?? newAlert.level, message: template.message });
                              }}
                              className="w-5 h-5 mt-0.5"
                            />
                            <span className="text-sm font-medium">{template.label}</span>
                          </label>
                        ))}
                      </div>
                      {allClear && (
                        <label className="mb-4 block">
                          <span className="block text-sm font-semibold text-gray-700 mb-2">Title *</span>
                          <input
                            className="clay-input"
                            value={allClearText}
                            maxLength={120}
                            onChange={(e) => {
                              setAllClearEdited(true);
                              setAllClearText(e.target.value);
                            }}
                          />
                        </label>
                      )}
                      <label className="block">
                        <span className="block text-sm font-semibold text-gray-700 mb-2">Alert Message *</span>
                        <textarea
                          value={newAlert.message}
                          onChange={(e) => {
                            setAllClearEdited(true);
                            setNewAlert({ ...newAlert, message: e.target.value });
                          }}
                          placeholder="Enter detailed alert message for residents..."
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={4}
                        ></textarea>
                      </label>
                      <p className="text-xs text-gray-500 mt-1">
                        Clear and actionable instructions. Avoid jargon.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="block text-sm font-semibold text-gray-700 mb-2">Alert ends</span>
                        <select className="clay-input" value={alertEnd} onChange={(e) => setAlertEnd(e.target.value as AlertEnd)}>
                          {ALERT_END_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </label>
                      {alertEnd === "custom" && (
                        <label className="block">
                          <span className="block text-sm font-semibold text-gray-700 mb-2">End date and time</span>
                          <input className="clay-input" type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                        </label>
                      )}
                    </div>

                    {alertFormError && <p role="alert" className="text-sm text-red-600">{alertFormError}</p>}

                    <button
                      type="button"
                      onClick={() => void handleSendAlert()}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2"
                    >
                      <Send size={20} aria-hidden="true" />
                      Broadcast Alert Now
                    </button>
                  </div>
                </div>

                {/* Alert history: collapsed cards in a bounded list */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold">Alert history</h3>
                    <Link to="/admin/mdrrmo/alerts" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold" style={{ color: "var(--primary-shade)" }}>
                      View all <ChevronRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                  {alertDialogs}
                  {alerts.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No alerts yet.</p>
                  ) : (
                    <AlertScrollList label="Alert history">
                      {alerts.slice(0, 100).map((alert) => (
                        <li key={alert.id}>
                          <CollapsibleAlertCard id={`alert-history-${alert.id}`} alert={alert} now={now} showStatus lifecycle={alertLifecycle(alert, activeIds, now)} actions={alertActions(alert)} />
                        </li>
                      ))}
                    </AlertScrollList>
                  )}
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
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <h2 className="text-lg font-bold">Community Reports Management</h2>
                  <span className="text-sm text-gray-500" aria-live="polite">
                    {reportFiltered && `${reportMatching} matching ${reportMatching === 1 ? "report" : "reports"} · `}
                    {reports.length} total reports
                  </span>
                </div>
                <ReportSearchControls
                  searchInput={reportSearchInput}
                  onSearchInput={setReportSearchInput}
                  sort={reportSort}
                  onSort={(s) => {
                    setReportSort(s);
                    setReportPage(1);
                  }}
                  status={reportStatus}
                  onStatus={(s) => {
                    setReportStatus(s);
                    setReportPage(1);
                  }}
                  counts={reportList.counts}
                />
                {reportList.error ? (
                  <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>Unable to load reports: {reportList.error}</p>
                ) : reportList.loading && reportList.rows.length === 0 ? (
                  <p className="text-sm text-gray-500">Loading reports...</p>
                ) : reportList.rows.length === 0 && !reportFiltered ? (
                  <p className="text-sm text-gray-500">No community reports have been submitted.</p>
                ) : reportList.rows.length === 0 ? (
                  <div className="space-y-2 py-4 text-center">
                    <p className="text-sm text-gray-500">No reports match your search</p>
                    <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={clearReportSearch}>
                      Clear search
                    </button>
                  </div>
                ) : (
                  <>
                  <ul className="space-y-3" aria-busy={reportList.loading}>
                    {reportList.rows.map((report) => {
                      const approved = report.status === "approved" || report.status === "verified";
                      const statusBadge = report.status === "pending"
                        ? { cls: "risk-badge-medium", label: "Pending" }
                        : approved
                          ? { cls: "risk-badge-low", label: "Approved" }
                          : { cls: "risk-badge-high", label: "Rejected" };
                      const hasNew = hasNewMessage(latestMessages[report.id], "mdrrmo", session?.user.id ? getThreadLastSeen(session.user.id, report.id) : 0);

                      return (
                        <li key={report.id}>
                          <DisclosureCard
                            id={`report-${report.id}`}
                            label={`Report at ${report.location || "unknown location"}, ${statusBadge.label}. Show details`}
                            summary={
                              <span className="block space-y-1">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className={`risk-badge is-compact ${statusBadge.cls}`}>{statusBadge.label}</span>
                                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{report.barangay ?? "No barangay"}</span>
                                  {hasNew && <NewDot />}
                                </span>
                                <span className="block truncate text-sm font-bold" style={{ color: "var(--text-primary)" }}>{report.location || "Unknown location"}</span>
                                <span className="flex flex-wrap items-center gap-x-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                                  <span className="inline-flex items-center gap-1"><Droplets size={12} aria-hidden="true" /> {waterLevelLabel(report.water_level)}</span>
                                  <span>{formatManilaDateTime(report.timestamp)}</span>
                                </span>
                              </span>
                            }
                          >
                            <div className="space-y-3 border-t pt-3">
                              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                By {displayReporterName(report.user_name)}
                                {report.lat !== null && report.lng !== null ? ` · (${report.lat.toFixed(5)}, ${report.lng.toFixed(5)})` : ""}
                              </p>
                              {report.description && <p className="whitespace-pre-wrap break-words text-sm font-normal">{report.description}</p>}
                              {report.photo_path && <ReportThumb src={report.photo_path} />}
                              <ReviewReasons report={report} />

                              <div className="flex flex-wrap gap-2">
                                {!approved && (
                                  <button type="button" onClick={() => setReviewingReport({ report, decision: "approved" })} className="clay-btn clay-btn-primary text-sm">
                                    <CheckCircle size={16} aria-hidden="true" /> Approve
                                  </button>
                                )}
                                {report.status !== "rejected" && (
                                  <button type="button" onClick={() => setReviewingReport({ report, decision: "rejected" })} className="clay-btn clay-btn-secondary text-sm">
                                    <XCircle size={16} aria-hidden="true" /> Reject
                                  </button>
                                )}
                                <button type="button" onClick={() => void handleDeleteReport(report.id)} className="clay-btn clay-btn-secondary text-sm">
                                  <Trash2 size={16} aria-hidden="true" /> Delete report
                                </button>
                              </div>

                              {/* Thread with the resident and Barangay (any status); the old single reply shows first. */}
                              <ReportMessages
                                reportId={report.id}
                                viewerRole="mdrrmo"
                                userId={session?.user.id ?? null}
                                latest={latestMessages[report.id]}
                                onLatest={updateLatestMessage}
                                legacyReply={{ body: report.admin_reply, at: report.admin_reply_at }}
                                canDelete
                              />
                            </div>
                          </DisclosureCard>
                        </li>
                      );
                    })}
                  </ul>
                  <ReportPager page={reportPage} pages={reportPages} loading={reportList.loading} onPage={setReportPage} />
                  </>
                )}
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

      {reviewingReport && (
        <ReportReviewDialog
          report={reviewingReport.report}
          decision={reviewingReport.decision}
          onClose={() => setReviewingReport(null)}
          onSave={async (reason) => {
            await saveReportReview(reviewingReport.report, reviewingReport.decision, reason);
            setReviewingReport(null);
          }}
        />
      )}
    </div>
  );
}
