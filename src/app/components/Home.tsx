import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Bell,
  Camera,
  CloudRain,
  Map as MapIcon,
  ChevronRight,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { subscribeToTable } from "../../lib/realtime";
import { AlertCard, ClayButton, ClayCard, RiskBadge, type AlertLevel } from "./clay/Clay";
import { asRiskLevel, riskSourceLabel } from "../../lib/floodRisk";
import { useUnreadAlertCount } from "../../lib/alertsSeen";
import { ProfileButton } from "./ProfileButton";
import {
  displayReporterName,
  reportBelongsToBarangay,
  waterLevelLabel,
  type BarangayPoint,
} from "../../lib/reports";

type FloodRisk = "low" | "medium" | "high";

/** Forecast columns on barangays, filled by the update-flood-risk job. */
type RainOutlook = {
  risk_source: string | null;
  rain_next_24h: number | null;
  forecast_6h: string | null;
  forecast_12h: string | null;
  forecast_24h: string | null;
  auto_updated_at: string | null;
};

const BARANGAY_STATUS_COLUMNS =
  "flood_risk, last_update, risk_source, rain_next_24h, forecast_6h, forecast_12h, forecast_24h, auto_updated_at";

const pickOutlook = (row: Partial<RainOutlook>): RainOutlook => ({
  risk_source: row.risk_source ?? null,
  rain_next_24h: row.rain_next_24h ?? null,
  forecast_6h: row.forecast_6h ?? null,
  forecast_12h: row.forecast_12h ?? null,
  forecast_24h: row.forecast_24h ?? null,
  auto_updated_at: row.auto_updated_at ?? null,
});

type LatestAlert = {
  title: string;
  message: string;
  level: AlertLevel;
  target_barangay: string;
  sent_at: string;
};

export function Home() {
  const navigate = useNavigate();
  const [residentBarangay, setResidentBarangay] = useState<string | null>(null);
  const [floodRisk, setFloodRisk] = useState<FloodRisk | null>(null);
  const [floodRiskLastUpdate, setFloodRiskLastUpdate] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [latestAlert, setLatestAlert] = useState<LatestAlert | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileBarangay, setProfileBarangay] = useState<string | null>(null);
  const unreadAlerts = useUnreadAlertCount(userId, profileBarangay);
  const [outlook, setOutlook] = useState<RainOutlook | null>(null);

  // Display only: newest approved critical/warning alert for the home card.
  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("alerts")
      .select("title, message, level, target_barangay, sent_at")
      .eq("status", "approved")
      .in("level", ["critical", "warning"])
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled && !error && data) setLatestAlert(data as LatestAlert);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const loadFloodStatus = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) return;
      if (!cancelled) setUserId(user.id);

      const fullName = String(user.user_metadata?.name ?? "").trim();
      if (!cancelled && fullName) {
        setFullName(fullName);
        setFirstName(fullName.split(/\s+/)[0]);
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("barangay, name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile?.barangay) return;

      // Greeting follows the editable profile name (metadata as fallback).
      const profileName = String(profile.name ?? "").trim();
      if (!cancelled && profileName) {
        setFullName(profileName);
        setFirstName(profileName.split(/\s+/)[0]);
      }

      const myBarangayName = profile.barangay;
      if (!cancelled) setProfileBarangay(myBarangayName);

      const { data: barangay, error: barangayError } = await supabase
        .from("barangays")
        .select(BARANGAY_STATUS_COLUMNS)
        .eq("name", myBarangayName)
        .maybeSingle();

      if (barangayError || !barangay) return;
      if (cancelled) return;

      setResidentBarangay(myBarangayName);
      setFloodRisk(barangay.flood_risk as FloodRisk);
      setFloodRiskLastUpdate(barangay.last_update);
      setOutlook(pickOutlook(barangay as Partial<RainOutlook>));

      // Guard against creating a channel for a component that has already
      // unmounted — an orphaned subscription here would never be released,
      // since no cleanup function would ever run to close it.
      if (cancelled) return;

      // Shared barangays channel; only this resident's barangay is applied.
      unsubscribe = subscribeToTable("barangays", (payload) => {
        if (payload.eventType !== "UPDATE") return;
        const updatedBarangay = payload.new as { name: string; flood_risk: FloodRisk; last_update: string } & Partial<RainOutlook>;
        if (updatedBarangay.name !== myBarangayName) return;
        setFloodRisk(updatedBarangay.flood_risk);
        setFloodRiskLastUpdate(updatedBarangay.last_update);
        setOutlook(pickOutlook(updatedBarangay));
      });
    };

    void loadFloodStatus();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return (
    <div className="min-h-full max-w-md mx-auto bg-background px-[18px] pt-5 pb-6">
      {/* Header: greeting | profile avatar (centered) | bell. Logout lives in Profile. */}
      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0">
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {greeting()}
          </p>
          <h1 className="truncate text-lg font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
            Kumusta, {firstName ?? "there"}
          </h1>
        </div>
        <ProfileButton name={fullName} />
        <div className="flex justify-end">
          <HeaderCircle
            icon={Bell}
            label={unreadAlerts > 0 ? `Alerts, ${unreadAlerts} unread` : "Alerts"}
            badge={unreadAlerts}
            onClick={() => navigate("/alerts")}
          />
        </div>
      </div>

      {/* Current flood status */}
      <ClayCard className="p-4 mb-5">
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Your barangay
        </p>
        <h2 className="text-xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
          {residentBarangay ?? "Status unavailable"}
        </h2>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <RiskBadge risk={floodRisk} />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {floodRiskLastUpdate
              ? `Updated ${formatRelative(floodRiskLastUpdate)}`
              : "Flood status is unavailable for your Barangay."}
          </span>
        </div>
        {riskSourceLabel(outlook?.risk_source) && (
          <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            Source: {riskSourceLabel(outlook?.risk_source)}
          </p>
        )}
      </ClayCard>

      {/* Rainfall outlook for the resident's own barangay */}
      {outlook && <RainfallOutlookCard outlook={outlook} />}

      {/* Primary actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <ClayButton icon={Camera} onClick={() => navigate("/reports?openForm=true")}>
          Submit report
        </ClayButton>
        <ClayButton variant="secondary" icon={MapIcon} onClick={() => navigate("/map")}>
          View map
        </ClayButton>
      </div>

      {/* Latest report from the resident's barangay */}
      <LatestReportCard barangay={profileBarangay} onOpen={() => navigate("/reports")} />

      {/* Latest critical / warning alert (flat, never clay) */}
      {latestAlert && (
        <section>
          <h2 className="text-base font-bold mb-2.5" style={{ color: "var(--text-primary)" }}>
            Latest alert
          </h2>
          <AlertCard
            level={latestAlert.level}
            title={latestAlert.title}
            message={latestAlert.message}
            meta={`${latestAlert.target_barangay} · ${formatRelative(latestAlert.sent_at)}`}
          />
        </section>
      )}
    </div>
  );
}

function RainfallOutlookCard({ outlook }: { outlook: RainOutlook }) {
  const rain = outlook.rain_next_24h;
  const windows: Array<[string, string | null]> = [
    ["Next 6h", outlook.forecast_6h],
    ["Next 12h", outlook.forecast_12h],
    ["Next 24h", outlook.forecast_24h],
  ];
  return (
    <ClayCard className="p-4 mb-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--lavender)" }}>
          <CloudRain size={20} style={{ color: "var(--lavender-icon)" }} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
            Rainfall outlook
          </h2>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {rain == null ? "Rainfall forecast unavailable" : `${Number(rain).toFixed(1)} mm expected in the next 24 hours`}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {windows.map(([label, value]) => (
          <div key={label} className="flex flex-col items-start gap-1">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {label}
            </span>
            <RiskBadge risk={asRiskLevel(value)} compact />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        {outlook.auto_updated_at ? `Updated ${formatRelative(outlook.auto_updated_at)}` : "Not yet updated automatically"}
      </p>
    </ClayCard>
  );
}

function HeaderCircle({
  icon: Icon,
  label,
  badge = 0,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-12 w-12 shrink-0 items-center justify-center"
    >
      <span className="clay clay-press relative flex h-11 w-11 items-center justify-center rounded-full">
        <Icon size={22} style={{ color: "var(--primary-brand)" }} aria-hidden="true" />
        {badge > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none text-white"
            style={{ background: "#C0392B", boxShadow: "0 0 0 2px var(--clay-bg)" }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
    </button>
  );
}

type LatestReportRow = {
  id: number;
  user_name: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  water_level: string | null;
  timestamp: string;
};

type LatestReportState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "report"; report: LatestReportRow };

/**
 * Compact teal card with the newest approved report from the resident's
 * barangay. Live via the shared community_reports channel; hidden on error.
 */
function LatestReportCard({ barangay, onOpen }: { barangay: string | null; onOpen: () => void }) {
  const [state, setState] = useState<LatestReportState>({ kind: "loading" });

  useEffect(() => {
    if (!barangay) return;
    let cancelled = false;
    let barangayPoints: BarangayPoint[] = [];
    let run = 0;

    // Re-runs the selection; only the newest run may update state.
    const select = async () => {
      const current = ++run;
      const { data, error } = await supabase
        .from("community_reports")
        .select("id, user_name, location, lat, lng, water_level, timestamp")
        .eq("status", "approved")
        .order("timestamp", { ascending: false })
        .limit(30);
      if (cancelled || current !== run) return;
      if (error) {
        setState({ kind: "error" });
        return;
      }
      const match = ((data as LatestReportRow[]) ?? []).find((report) =>
        reportBelongsToBarangay(report, barangay, barangayPoints),
      );
      setState(match ? { kind: "report", report: match } : { kind: "empty" });
    };

    const start = async () => {
      // Coordinates for nearest-barangay matching. If this fails, matching
      // falls back to the location text.
      const { data } = await supabase.from("barangays").select("name, lat, lng");
      if (cancelled) return;
      barangayPoints = ((data as Array<{ name: string; lat: number | null; lng: number | null }>) ?? [])
        .filter((b) => b.lat != null && b.lng != null)
        .map((b) => ({ name: b.name, lat: Number(b.lat), lng: Number(b.lng) }));
      await select();
    };

    void start();
    const unsubscribe = subscribeToTable("community_reports", () => {
      void select();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [barangay]);

  if (!barangay || state.kind === "error") return null;

  const cardStyle = { background: "var(--report-teal)", borderRadius: 20, color: "#fff" } as const;

  if (state.kind === "loading") {
    return (
      <div
        aria-hidden="true"
        className="clay mb-6 h-[88px] animate-pulse motion-reduce:animate-none"
        style={{ ...cardStyle, opacity: 0.55 }}
      />
    );
  }

  const tag = (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold leading-4"
      style={{ color: "var(--report-teal)" }}
    >
      <FileText size={12} aria-hidden="true" />
      Reports
    </span>
  );

  if (state.kind === "empty") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="clay clay-press mb-6 flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left"
        style={cardStyle}
      >
        {tag}
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold">No reports in {barangay} yet</span>
          <span className="opacity-90"> · Be the first to report</span>
        </span>
        <ChevronRight size={18} className="shrink-0" aria-hidden="true" />
      </button>
    );
  }

  const { report } = state;
  const detail = [waterLevelLabel(report.water_level), report.location?.trim()].filter(Boolean).join(" - ");
  const reporter = displayReporterName(report.user_name);
  const when = formatRelative(report.timestamp);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Latest report in ${barangay}: ${detail}, by ${reporter}, ${when}. Open community reports.`}
      className="clay clay-press mb-6 flex w-full items-center gap-2 px-3 py-2.5 text-left"
      style={cardStyle}
    >
      <span className="min-w-0 flex-1">
        {tag}
        <span className="mt-1 block truncate text-sm font-semibold leading-5">Latest report - {barangay}</span>
        <span className="block truncate text-xs leading-4 opacity-95">{detail}</span>
        <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] leading-4 opacity-90">
          <span className="min-w-0 truncate">{reporter}</span>
          <span className="shrink-0">{when}</span>
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0" aria-hidden="true" />
    </button>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return date.toLocaleDateString();
}
