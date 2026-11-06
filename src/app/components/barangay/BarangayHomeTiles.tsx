import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, Eye, History, MapPin, Radio, Settings, type LucideIcon } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { subscribeToTable } from "../../../lib/realtime";
import { ALL_BARANGAYS } from "../../../lib/alerts";
import { toTime } from "../../../lib/barangayAdmin";
import { countActiveAlerts, shortAgo, useRefreshOnFocus, type ActiveAlert } from "../../../lib/barangayTiles";
import { ClayCard } from "../clay/Clay";

/*
 * Shortcut tiles at the top of the barangay dashboard. They add to the menu
 * and never replace it, so a number that is loading or failed only changes
 * its own line: every tile can always be opened.
 */

export type TileTarget = "alerts" | "reports" | "field-observations" | "my-alerts" | "overview" | "settings";

/** undefined while loading, null when it failed. */
export type TileValue<T> = T | null | undefined;

const CHANGE_DELAY_MS = 300;

/** Reads the two numbers the dashboard does not hold, and keeps them current. */
function useTileReads(barangay: string) {
  const [active, setActive] = useState<TileValue<ActiveAlert[]>>(undefined);
  // The time of the latest observation; 0 when there are none.
  const [latest, setLatest] = useState<TileValue<number>>(undefined);
  const activeRead = useRef(0);
  const latestRead = useRef(0);

  const loadActive = useCallback(async () => {
    const read = ++activeRead.current;
    const { data, error } = await supabase
      .from("active_alerts")
      .select("expires_at, is_all_clear")
      .in("target_barangay", [barangay, ALL_BARANGAYS]);
    if (read === activeRead.current) setActive(error ? null : ((data ?? []) as ActiveAlert[]));
  }, [barangay]);

  const loadLatest = useCallback(async () => {
    const read = ++latestRead.current;
    const { data, error } = await supabase
      .from("field_observations")
      .select("observed_at")
      .eq("barangay", barangay)
      .order("observed_at", { ascending: false })
      .limit(1);
    if (read === latestRead.current) setLatest(error ? null : toTime((data as Array<{ observed_at: string }> | null)?.[0]?.observed_at));
  }, [barangay]);

  useEffect(() => {
    void loadActive();
    void loadLatest();
    let activeTimer: number | undefined;
    let latestTimer: number | undefined;
    // What is active depends on other rows, and a DELETE carries only the id, so re-read.
    const unsubscribers = [
      subscribeToTable("alerts", () => {
        window.clearTimeout(activeTimer);
        activeTimer = window.setTimeout(() => void loadActive(), CHANGE_DELAY_MS);
      }),
      subscribeToTable("field_observations", () => {
        window.clearTimeout(latestTimer);
        latestTimer = window.setTimeout(() => void loadLatest(), CHANGE_DELAY_MS);
      }),
    ];
    return () => {
      window.clearTimeout(activeTimer);
      window.clearTimeout(latestTimer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadActive, loadLatest]);

  useRefreshOnFocus(() => {
    void loadActive();
    void loadLatest();
  });

  return { active, latest };
}

function Skeleton() {
  return <span aria-hidden="true" className="inline-block h-3 w-20 animate-pulse rounded-full bg-gray-200 align-middle motion-reduce:animate-none" />;
}

function Dash() {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">Not available</span>
    </>
  );
}

/** Skeleton, dash, or the value. */
function live<T>(value: TileValue<T>, show: (value: T) => ReactNode) {
  if (value === undefined) return <Skeleton />;
  if (value === null) return <Dash />;
  return show(value);
}

function Tile({ icon: Icon, label, badge, onClick, children }: { icon: LucideIcon; label: string; badge?: number; onClick: () => void; children: ReactNode }) {
  return (
    <ClayCard onClick={onClick} radius={22} className="relative flex h-full w-full flex-col gap-2 p-4">
      <Icon size={24} aria-hidden="true" style={{ color: "var(--primary-brand)" }} />
      <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{label}</span>
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{children}</span>
      {/* The line below the label already says this to screen readers. */}
      {badge ? (
        <span aria-hidden="true" className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: "var(--risk-high)" }}>
          {badge}
        </span>
      ) : null}
    </ClayCard>
  );
}

const RISK_DOT: Record<string, string> = { low: "var(--risk-low)", medium: "var(--risk-medium)", high: "var(--risk-high)" };
const RISK_LABEL: Record<string, string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };

export function BarangayHomeTiles({
  barangay,
  now,
  pendingReports,
  publishedToday,
  risk,
  onOpen,
}: {
  barangay: string;
  now: number;
  pendingReports: TileValue<number>;
  publishedToday: TileValue<number>;
  /** "" when the barangay has no level yet. */
  risk: TileValue<string>;
  onOpen: (target: TileTarget) => void;
}) {
  const { active, latest } = useTileReads(barangay);

  return (
    <nav aria-label="Shortcuts" className="grid auto-rows-fr grid-cols-2 gap-3 lg:grid-cols-3">
      <Tile icon={Radio} label="Create Alert" onClick={() => onOpen("alerts")}>
        Publish an alert for {barangay} · {live(active, (rows) => `${countActiveAlerts(rows, now)} active now`)}
      </Tile>
      <Tile icon={MapPin} label="Reports" badge={pendingReports ?? 0} onClick={() => onOpen("reports")}>
        {live(pendingReports, (n) => `${n} waiting for the MDRRMO`)}
      </Tile>
      <Tile icon={Eye} label="Field Observations" onClick={() => onOpen("field-observations")}>
        {live(latest, (t) => (t ? `Last update ${shortAgo(t, now)}` : "None yet"))}
      </Tile>
      <Tile icon={History} label="My Alerts" onClick={() => onOpen("my-alerts")}>
        {live(publishedToday, (n) => `${n} published today`)}
      </Tile>
      <Tile icon={Activity} label="Overview" onClick={() => onOpen("overview")}>
        {live(risk, (level) => (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RISK_DOT[level] ?? "var(--text-secondary)" }} />
            {RISK_LABEL[level] ?? "Not set"}
          </span>
        ))}
      </Tile>
      <Tile icon={Settings} label="Settings" onClick={() => onOpen("settings")}>
        Account and notifications
      </Tile>
    </nav>
  );
}
