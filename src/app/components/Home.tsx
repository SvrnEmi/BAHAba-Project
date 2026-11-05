import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Bell,
  Camera,
  CloudRain,
  Map as MapIcon,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { subscribeToTable } from "../../lib/realtime";
import { ClayButton, ClayCard, RiskBadge } from "./clay/Clay";
import { CollapsibleAlertCard } from "./alerts/AlertDisclosure";
import { RainfallInfoShort } from "./RainfallInfo";
import { useResidentAlerts } from "../../lib/residentAlerts";
import { asRiskLevel, riskSourceLabel } from "../../lib/floodRisk";
import { useUnreadAlertCount } from "../../lib/alertsSeen";
import { ProfileButton } from "./ProfileButton";
import { BahaCountdownCard } from "./BahaCountdownCard";
import { GroundReportsCard } from "./GroundReportsCard";
import { PostedReports } from "./PostedReports";

type FloodRisk = "low" | "medium" | "high";

/** Forecast columns on barangays, filled by the update-flood-risk job. */
type RainOutlook = {
  risk_source: string | null;
  rain_next_24h: number | null;
  forecast_6h: string | null;
  forecast_12h: string | null;
  forecast_24h: string | null;
  auto_updated_at: string | null;
  rain_next_3h: number | null;
  peak_rain_mm_h: number | null;
  peak_rain_at: string | null;
};

const BARANGAY_STATUS_COLUMNS =
  "flood_risk, last_update, risk_source, rain_next_24h, forecast_6h, forecast_12h, forecast_24h, auto_updated_at, rain_next_3h, peak_rain_mm_h, peak_rain_at";

const pickOutlook = (row: Partial<RainOutlook>): RainOutlook => ({
  risk_source: row.risk_source ?? null,
  rain_next_24h: row.rain_next_24h ?? null,
  forecast_6h: row.forecast_6h ?? null,
  forecast_12h: row.forecast_12h ?? null,
  forecast_24h: row.forecast_24h ?? null,
  auto_updated_at: row.auto_updated_at ?? null,
  rain_next_3h: row.rain_next_3h ?? null,
  peak_rain_mm_h: row.peak_rain_mm_h ?? null,
  peak_rain_at: row.peak_rain_at ?? null,
});

export function Home() {
  const navigate = useNavigate();
  const [residentBarangay, setResidentBarangay] = useState<string | null>(null);
  const [floodRisk, setFloodRisk] = useState<FloodRisk | null>(null);
  const [floodRiskLastUpdate, setFloodRiskLastUpdate] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileBarangay, setProfileBarangay] = useState<string | null>(null);
  const unreadAlerts = useUnreadAlertCount(userId, profileBarangay);
  const [outlook, setOutlook] = useState<RainOutlook | null>(null);

  // Newest current Orange/Red alert or all clear for this barangay.
  const { alerts: myAlerts } = useResidentAlerts(profileBarangay);
  const latestAlert = myAlerts.find((a) => a.is_all_clear || a.level !== "advisory") ?? null;

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

      {/* Plain-language countdown to heavy rain, then the 6/12/24h outlook */}
      {outlook && <BahaCountdownCard row={{ ...outlook, flood_risk: floodRisk }} />}
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

      <GroundReportsCard barangay={profileBarangay} ownBarangay className="mb-6" />

      {/* Latest Orange / Red alert for this barangay (flat, never clay; collapsed by default) */}
      {latestAlert && (
        <section className="mb-6">
          <h2 className="text-base font-bold mb-2.5" style={{ color: "var(--text-primary)" }}>
            Latest alert
          </h2>
          <CollapsibleAlertCard alert={latestAlert} />
        </section>
      )}

      {/* Approved reports from the resident's barangay */}
      <PostedReports barangay={profileBarangay} />

      {/* Short "How rainfall risk works" with a link to the full page */}
      <RainfallInfoShort />
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
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold leading-none text-white"
            style={{ background: "#C0392B", boxShadow: "0 0 0 2px var(--clay-bg)" }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
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
