import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import { LogOut, Settings } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { subscribeToTable } from "../../lib/realtime";
import { displayReporterName, waterLevelLabel } from "../../lib/reports";
import { waterLevelInfo } from "../../lib/quickReport";
import { errorMessage, legacyCreatedBy, notifyBrowser, toTime } from "../../lib/barangayAdmin";
import { BrandLogo } from "./BrandLogo";
import {
  BarangayStatusPanel,
  HOUR_MS,
  MY_BARANGAY_COLUMNS,
  sourceText,
  toForecastHour,
  toMyBarangay,
  type ForecastHour,
  type MyBarangayRow,
} from "./barangay/BarangayStatusPanel";
import { BarangayUpdatesBar, BarangayUpdatesColumn, FEED_LIMIT, useFeedState, type BarangayUpdate } from "./barangay/BarangayUpdatesPanel";
import {
  CommunityReportsSection,
  QuickReportsSection,
  QUICK_REPORT_COLUMNS,
  REPORT_COLUMNS,
  isApprovedStatus,
  type BarangayQuickReport,
  type BarangayReport,
  type ReportFilter,
} from "./barangay/BarangayReports";
import { ALERT_COLUMNS, BarangayAlertsSection, toAlert, type BarangayAlertRow } from "./barangay/BarangayAlerts";

/*
 * Barangay admin dashboard. Everything is scoped to the signed-in admin's own
 * barangay (profiles.barangay). One shared realtime channel per table
 * (barangays, community_reports, alerts, quick_reports) feeds the status
 * panel, the lists and the Recent updates column; no polling.
 */

type Tab = "reports" | "alerts";
type ReportsView = "community" | "quick";
type Profile = { name: string | null; barangay: string | null };
type LevelEvent = { key: string; time: number; level: string; source: string };

const LEVEL_LABEL: Record<string, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };

function levelEventFrom(row: MyBarangayRow, time: number): LevelEvent | null {
  if (!time || !row.flood_risk) return null;
  return { key: `level-${time}-${row.flood_risk}-${row.risk_source ?? ""}`, time, level: row.flood_risk, source: sourceText(row) };
}

export function BarangayAdminDashboard() {
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? null;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const barangay = profile?.barangay ?? null;

  const [row, setRow] = useState<MyBarangayRow | null>(null);
  const [hours, setHours] = useState<ForecastHour[]>([]);
  const [overrideHours, setOverrideHours] = useState<number | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [levelEvents, setLevelEvents] = useState<LevelEvent[]>([]);

  const [reports, setReports] = useState<BarangayReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [quick, setQuick] = useState<BarangayQuickReport[]>([]);
  const [quickLoading, setQuickLoading] = useState(true);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<BarangayAlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  // When this session saw a draft get reviewed (the table has no review time).
  const [reviewedAt, setReviewedAt] = useState<Record<string, number>>({});

  const [tab, setTab] = useState<Tab>("reports");
  const [reportsView, setReportsView] = useState<ReportsView>("community");
  const [reportFilter, setReportFilter] = useState<ReportFilter>("pending");
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loggingOut, setLoggingOut] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // 1. Profile (name + barangay), once per user.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("name, barangay")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setProfileError(error.message);
        else
          setProfile({
            name: typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null,
            barangay: typeof data?.barangay === "string" && data.barangay.trim() ? data.barangay.trim() : null,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const myName = profile?.name ?? email ?? (barangay ? legacyCreatedBy(barangay) : "Barangay Admin");

  // Clock for relative times and the current-hour bar (no data requests).
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
  }, [barangay]);

  // 2. Loaders (all scoped to my barangay).
  const loadForecast = useCallback(async (barangayId: number) => {
    const start = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    const { data, error } = await supabase
      .from("rainfall_forecast")
      .select("hour, precip_mm, precip_prob, is_simulated")
      .eq("barangay_id", barangayId)
      .gte("hour", new Date(start).toISOString())
      .lt("hour", new Date(start + 24 * HOUR_MS).toISOString())
      .order("hour", { ascending: true });
    if (error) throw error;
    setHours(((data ?? []) as Record<string, unknown>[]).map(toForecastHour).filter((h) => h.t > 0));
  }, []);

  const loadStatus = useCallback(async () => {
    if (!barangay) return;
    setStatusError(null);
    try {
      const [barangayRes, settingsRes] = await Promise.all([
        supabase.from("barangays").select(MY_BARANGAY_COLUMNS).eq("name", barangay).maybeSingle(),
        supabase.from("risk_settings").select("override_hours").eq("id", 1).maybeSingle(),
      ]);
      if (barangayRes.error) throw barangayRes.error;
      const next = barangayRes.data ? toMyBarangay(barangayRes.data as Record<string, unknown>) : null;
      setRow(next);
      const hoursValue = Number((settingsRes.data as { override_hours?: unknown } | null)?.override_hours);
      setOverrideHours(Number.isFinite(hoursValue) && hoursValue > 0 ? hoursValue : null);
      if (next) {
        const event = levelEventFrom(next, toTime(next.last_update));
        if (event) setLevelEvents((current) => (current.some((e) => e.key === event.key) ? current : [event, ...current]));
        await loadForecast(next.id);
      }
    } catch (err) {
      setStatusError(errorMessage(err, "Unable to load the status."));
    } finally {
      setStatusLoading(false);
    }
  }, [barangay, loadForecast]);

  const loadReports = useCallback(async () => {
    if (!barangay) return;
    setReportsError(null);
    const { data, error } = await supabase
      .from("community_reports")
      .select(REPORT_COLUMNS)
      .eq("barangay", barangay)
      .order("timestamp", { ascending: false })
      .limit(200);
    if (error) setReportsError(error.message);
    else setReports((data ?? []) as unknown as BarangayReport[]);
    setReportsLoading(false);
  }, [barangay]);

  const knownQuickIds = useRef<Set<string> | null>(null);
  const loadQuick = useCallback(async () => {
    if (!barangay) return;
    setQuickError(null);
    const { data, error } = await supabase
      .from("quick_reports")
      .select(QUICK_REPORT_COLUMNS)
      .eq("barangay", barangay)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      setQuickError(error.message);
    } else {
      const rows = (data ?? []) as unknown as BarangayQuickReport[];
      // Notify about Quick Reports that became visible after the first load.
      if (knownQuickIds.current) {
        for (const r of rows) {
          if (!knownQuickIds.current.has(String(r.id))) {
            notifyBrowser(`New Quick Report - ${barangay}`, `${waterLevelInfo(r.water_level)?.label ?? "Water level"}${r.landmark ? ` near ${r.landmark}` : ""}`);
          }
        }
      }
      knownQuickIds.current = new Set(rows.map((r) => String(r.id)));
      setQuick(rows);
    }
    setQuickLoading(false);
  }, [barangay]);

  const loadAlerts = useCallback(async () => {
    if (!barangay) return;
    setAlertsError(null);
    const { data, error } = await supabase
      .from("alerts")
      .select(ALERT_COLUMNS)
      .eq("target_barangay", barangay)
      .order("sent_at", { ascending: false })
      .limit(100);
    if (error) setAlertsError(error.message);
    else setAlerts(((data ?? []) as Record<string, unknown>[]).map(toAlert));
    setAlertsLoading(false);
  }, [barangay]);

  // 3. Initial load + one shared realtime channel per table.
  const rowRef = useRef<MyBarangayRow | null>(null);
  rowRef.current = row;
  const alertsRef = useRef<BarangayAlertRow[]>([]);
  alertsRef.current = alerts;

  useEffect(() => {
    if (!barangay) return;
    let cancelled = false;
    let quickTimer: number | undefined;

    void loadStatus();
    void loadReports();
    void loadQuick();
    void loadAlerts();

    const unsubscribers = [
      subscribeToTable("community_reports", (payload) => {
        if (cancelled) return;
        if (payload.eventType === "DELETE") {
          const id = Number((payload.old as { id?: unknown }).id);
          setReports((current) => current.filter((r) => r.id !== id));
          return;
        }
        const report = payload.new as unknown as BarangayReport;
        if (report.barangay !== barangay) {
          // Moved out of my barangay (or never in it).
          setReports((current) => current.filter((r) => r.id !== report.id));
          return;
        }
        setReports((current) => [report, ...current.filter((r) => r.id !== report.id)].sort((a, b) => toTime(b.timestamp) - toTime(a.timestamp)));
        if (payload.eventType === "INSERT") {
          notifyBrowser(`New flood report - ${barangay}`, `${waterLevelLabel(report.water_level)} at ${report.location?.trim() || "unknown location"}`);
        }
      }),
      subscribeToTable("alerts", (payload) => {
        if (cancelled) return;
        if (payload.eventType === "DELETE") {
          const id = Number((payload.old as { id?: unknown }).id);
          setAlerts((current) => current.filter((a) => a.id !== id));
          return;
        }
        const alert = toAlert(payload.new as Record<string, unknown>);
        if (alert.target_barangay !== barangay) return;
        const before = alertsRef.current.find((a) => a.id === alert.id);
        if (before && before.status !== alert.status && (alert.status === "approved" || alert.status === "rejected")) {
          setReviewedAt((current) => ({ ...current, [`${alert.id}-${alert.status}`]: Date.now() }));
        }
        setAlerts((current) => [alert, ...current.filter((a) => a.id !== alert.id)].sort((a, b) => toTime(b.sent_at) - toTime(a.sent_at)));
      }),
      // Quick Reports: RLS shows only approved rows of my barangay; re-read once per burst.
      subscribeToTable("quick_reports", () => {
        window.clearTimeout(quickTimer);
        quickTimer = window.setTimeout(() => {
          if (!cancelled) void loadQuick();
        }, 400);
      }),
    ];

    return () => {
      cancelled = true;
      window.clearTimeout(quickTimer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [barangay, loadStatus, loadReports, loadQuick, loadAlerts]);

  // My barangay row only: UPDATEs on a channel filtered to its id (other
  // barangays' updates never reach this dashboard).
  const myBarangayId = row?.id ?? null;
  useEffect(() => {
    if (myBarangayId == null) return;
    let cancelled = false;
    let forecastTimer: number | undefined;

    const channel = supabase
      .channel(`my-barangay-${myBarangayId}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "barangays", filter: `id=eq.${myBarangayId}` },
        (payload) => {
          if (cancelled) return;
          const next = toMyBarangay(payload.new as Record<string, unknown>);
          const previous = rowRef.current;
          setRow(next);
          if (previous && (previous.flood_risk !== next.flood_risk || previous.risk_source !== next.risk_source)) {
            const event = levelEventFrom(next, toTime(next.last_update) > toTime(previous.last_update) ? toTime(next.last_update) : Date.now());
            if (event) setLevelEvents((current) => (current.some((e) => e.key === event.key) ? current : [event, ...current].slice(0, FEED_LIMIT)));
          }
          // A new automated run (or a simulation) also rewrote rainfall_forecast.
          if (!previous || previous.auto_updated_at !== next.auto_updated_at || next.risk_source === "simulation") {
            window.clearTimeout(forecastTimer);
            forecastTimer = window.setTimeout(() => {
              if (!cancelled) void loadForecast(next.id).catch((err) => console.error("Unable to reload the forecast:", err));
            }, 1500);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.clearTimeout(forecastTimer);
      void supabase.removeChannel(channel);
    };
  }, [myBarangayId, loadForecast]);

  // 4. Derived lists.
  const isMine = useCallback(
    (a: BarangayAlertRow) =>
      a.source !== "auto" &&
      !!a.created_by &&
      [profile?.name, email, barangay ? legacyCreatedBy(barangay) : null].filter(Boolean).includes(a.created_by),
    [profile?.name, email, barangay],
  );
  const drafts = useMemo(() => alerts.filter(isMine), [alerts, isMine]);
  const autoAlerts = useMemo(() => alerts.filter((a) => a.source === "auto"), [alerts]);

  const feed = useMemo<BarangayUpdate[]>(() => {
    const list: BarangayUpdate[] = [];
    for (const r of reports) {
      list.push({
        key: `report-${r.id}`,
        kind: "report",
        title: `New report: ${r.location?.trim() || "Unknown location"}`,
        detail: `${waterLevelLabel(r.water_level)} · by ${displayReporterName(r.user_name)}`,
        time: toTime(r.timestamp),
        target: { tab: "reports", elementId: `report-${r.id}` },
      });
    }
    for (const q of quick) {
      list.push({
        key: `quick-${q.id}`,
        kind: "quick",
        title: `Quick Report: ${q.landmark?.trim() || "No landmark"}`,
        detail: `Water: ${waterLevelInfo(q.water_level)?.label ?? "not given"} · approved by MDRRMO`,
        time: toTime(q.created_at),
        target: { tab: "reports", elementId: `quick-report-${q.id}` },
      });
    }
    for (const a of alerts) {
      if (a.source === "auto") {
        list.push({
          key: `auto-${a.id}`,
          kind: "auto",
          title: a.title || "Automated warning",
          detail: a.status === "approved" ? "Automated warning sent" : `Automated warning · ${a.status}`,
          time: toTime(a.sent_at),
          target: { tab: "alerts", elementId: `alert-${a.id}` },
        });
      } else if (isMine(a) && (a.status === "approved" || a.status === "rejected")) {
        const approved = a.status === "approved";
        list.push({
          key: `draft-${a.id}-${a.status}`,
          kind: approved ? "approved" : "rejected",
          title: `${approved ? "Alert approved" : "Alert rejected"}: ${a.title || "Alert"}`,
          detail: approved ? "Sent to residents by MDRRMO" : `Reason: ${a.rejection_reason?.trim() || "No reason given"}`,
          time: reviewedAt[`${a.id}-${a.status}`] ?? toTime(a.sent_at),
          target: { tab: "alerts", elementId: `alert-${a.id}` },
        });
      }
    }
    for (const e of levelEvents) {
      list.push({
        key: e.key,
        kind: "level",
        title: `Level set to ${LEVEL_LABEL[e.level] ?? e.level}`,
        detail: e.source,
        time: e.time,
        target: { tab: "reports", elementId: "barangay-status" },
      });
    }
    return list.filter((i) => i.time > 0).sort((x, y) => y.time - x.time).slice(0, FEED_LIMIT);
  }, [reports, quick, alerts, levelEvents, reviewedAt, isMine]);

  const feedLoading = statusLoading || reportsLoading || quickLoading || alertsLoading;
  const feedState = useFeedState(feed, feedLoading, userId);

  // 5. Open an update: switch tab, scroll to it and flash it.
  useEffect(() => {
    if (!focusTarget) return;
    const frame = window.requestAnimationFrame(() => {
      const el = document.getElementById(focusTarget);
      setFocusTarget(null);
      if (!el) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: el.id === "barangay-status" ? "start" : "center" });
      el.classList.remove("update-target-flash");
      void el.offsetWidth; // restart the flash if the same item is opened twice
      el.classList.add("update-target-flash");
      window.setTimeout(() => el.classList.remove("update-target-flash"), 1500);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusTarget, tab, reportsView, reportFilter]);

  const openUpdate = (item: BarangayUpdate) => {
    if (item.kind === "report") {
      const report = reports.find((r) => `report-${r.id}` === item.target.elementId);
      setTab("reports");
      setReportsView("community");
      if (report) setReportFilter(isApprovedStatus(report.status) ? "approved" : report.status === "rejected" ? "rejected" : "pending");
    } else if (item.kind === "quick") {
      setTab("reports");
      setReportsView("quick");
    } else if (item.kind !== "level") {
      setTab("alerts");
    }
    setFocusTarget(item.target.elementId);
  };

  const logout = async () => {
    if (!window.confirm("Log out of BAHAba?")) return;
    setLoggingOut(true);
    await signOut();
    navigate("/login", { replace: true });
  };

  const header = (
    <div ref={headerRef} className="bg-background px-6 pt-6 pb-2 lg:sticky lg:top-0 lg:z-30">
      <div className="mx-auto max-w-7xl lg:max-w-[1660px]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo size={44} />
            <div>
              <h1 className="mb-1 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                Barangay Admin{barangay ? ` - ${barangay}` : ""}
              </h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Barangay Management Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate("/admin/barangay/settings")} className="clay-btn clay-btn-secondary">
              <Settings size={18} aria-hidden="true" />
              <span className="text-sm">Settings</span>
            </button>
            <button type="button" onClick={() => void logout()} disabled={loggingOut} className="clay-btn clay-btn-secondary">
              <LogOut size={18} aria-hidden="true" />
              <span className="text-sm">{loggingOut ? "Logging out..." : "Log out"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // No barangay (or the profile could not be read): explain instead of querying.
  if (!profile || !barangay) {
    return (
      <div className="min-h-screen bg-background">
        {header}
        <div className="mx-auto max-w-2xl px-6 py-10">
          {profileError ? (
            <div role="alert" className="flat-alert" style={{ "--alert-color": "var(--risk-high)" } as CSSProperties}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Could not load your profile.</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>{profileError}</p>
            </div>
          ) : !profile ? (
            <div className="clay h-32 animate-pulse" aria-busy="true" aria-label="Loading your profile" />
          ) : (
            <div role="alert" className="flat-alert" style={{ "--alert-color": "var(--risk-medium)" } as CSSProperties}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Your account has no assigned barangay.</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Ask MDRRMO to set your barangay in Users and roles, then reload this page.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const pendingCount = reports.filter((r) => !isApprovedStatus(r.status) && r.status !== "rejected").length;
  const pendingDrafts = drafts.filter((a) => a.status === "pending").length;

  return (
    <div className="min-h-screen bg-background">
      {header}

      {/* Under 1024px: Recent updates collapses into a bar right under the header. */}
      <div className="px-6 pt-2 lg:hidden">
        <div className="mx-auto max-w-7xl">
          <BarangayUpdatesBar items={feed} state={feedState} loading={feedLoading} onOpen={openUpdate} />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6 lg:grid lg:max-w-[1660px] lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-6">
          <BarangayStatusPanel
            barangayName={barangay}
            row={row}
            hours={hours}
            overrideHours={overrideHours}
            loading={statusLoading}
            error={statusError}
            now={now}
            onRetry={() => {
              setStatusLoading(true);
              void loadStatus();
            }}
            onChanged={loadStatus}
          />

          <div className="clay p-5">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Dashboard sections">
              <button type="button" role="tab" aria-selected={tab === "reports"} className="clay-tab" onClick={() => setTab("reports")}>
                Reports{pendingCount ? ` (${pendingCount} pending)` : ""}
              </button>
              <button type="button" role="tab" aria-selected={tab === "alerts"} className="clay-tab" onClick={() => setTab("alerts")}>
                Alert drafts{pendingDrafts ? ` (${pendingDrafts} pending)` : ""}
              </button>
            </div>

            <div className="mt-5">
              {tab === "reports" ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2" role="tablist" aria-label="Report type">
                    <button type="button" role="tab" aria-selected={reportsView === "community"} className="clay-tab" onClick={() => setReportsView("community")}>
                      Community reports
                    </button>
                    <button type="button" role="tab" aria-selected={reportsView === "quick"} className="clay-tab" onClick={() => setReportsView("quick")}>
                      Quick Reports ({quick.length})
                    </button>
                  </div>
                  {reportsView === "community" ? (
                    <CommunityReportsSection
                      barangay={barangay}
                      userId={userId}
                      reports={reports}
                      loading={reportsLoading}
                      error={reportsError}
                      filter={reportFilter}
                      onFilter={setReportFilter}
                      onRetry={() => {
                        setReportsLoading(true);
                        void loadReports();
                      }}
                      onUpdated={(updated) => setReports((current) => current.map((r) => (r.id === updated.id ? updated : r)))}
                    />
                  ) : (
                    <QuickReportsSection
                      barangay={barangay}
                      rows={quick}
                      loading={quickLoading}
                      error={quickError}
                      onRetry={() => {
                        setQuickLoading(true);
                        void loadQuick();
                      }}
                    />
                  )}
                </div>
              ) : (
                <BarangayAlertsSection
                  barangay={barangay}
                  createdBy={myName}
                  drafts={drafts}
                  autoAlerts={autoAlerts}
                  loading={alertsLoading}
                  error={alertsError}
                  onCreated={(alert) => setAlerts((current) => [alert, ...current.filter((a) => a.id !== alert.id)])}
                />
              )}
            </div>
          </div>
        </div>

        {/* 1024px+: live Recent updates column, sticky under the header, scrolls inside itself. */}
        <aside className="hidden lg:block lg:sticky" style={{ top: headerHeight + 16, height: `calc(100vh - ${headerHeight}px - 32px)` }}>
          <BarangayUpdatesColumn items={feed} state={feedState} loading={feedLoading} onOpen={openUpdate} />
        </aside>
      </div>
    </div>
  );
}
