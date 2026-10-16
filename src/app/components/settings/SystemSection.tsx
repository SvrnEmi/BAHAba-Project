import { useMemo, useState } from "react";
import { CloudRain, Loader, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { RAIN_SIMULATION, runFloodRiskUpdate } from "../../../lib/floodRisk";
import { describeChanges, writeAuditLog } from "../../../lib/audit";
import { ClayButton } from "../clay/Clay";
import { errorText } from "../Profile";
import { relativeTime } from "../RecentUpdatesPanel";
import { EmptyNote, LoadGate, NumberField, SwitchRow, num, parseNumber, useSectionLoad } from "./common";

function SubHeading({ children }: { children: string }) {
  return (
    <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
      {children}
    </h3>
  );
}

export function SystemSection({ adminEmail }: { adminEmail: string }) {
  return (
    <div className="space-y-6">
      <ForecastStatus />
      <DemoTools adminEmail={adminEmail} />
      <AuditLogViewer />
    </div>
  );
}

function ForecastStatus() {
  const [refreshing, setRefreshing] = useState(false);
  const { state, retry } = useSectionLoad(async () => {
    const { data, error } = await supabase
      .from("barangays")
      .select("auto_updated_at")
      .not("auto_updated_at", "is", null)
      .order("auto_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const value = (data as { auto_updated_at?: unknown } | null)?.auto_updated_at;
    const time = typeof value === "string" ? new Date(value).getTime() : NaN;
    return Number.isFinite(time) ? time : null;
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      await runFloodRiskUpdate();
      toast.success("Forecast refreshed. Flood levels recalculated.");
      retry();
    } catch (err) {
      console.error("Forecast refresh failed:", err);
      toast.error(`Refresh failed: ${errorText(err, "unknown error")}`);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section>
      <SubHeading>Forecast status</SubHeading>
      <LoadGate state={state} retry={retry} loadingText="Checking last update...">
        {(lastUpdated) => (
          <div className="space-y-1 text-sm" style={{ color: "var(--text-primary)" }}>
            <p>Last updated {lastUpdated ? relativeTime(lastUpdated, Date.now()) : "never"}</p>
            <p style={{ color: "var(--text-secondary)" }}>Next update about every 30 minutes</p>
          </div>
        )}
      </LoadGate>
      <ClayButton variant="secondary" className="mt-3 w-full" onClick={() => void refresh()} disabled={refreshing}>
        {refreshing ? <Loader size={18} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}
        {refreshing ? "Refreshing..." : "Refresh now"}
      </ClayButton>
    </section>
  );
}

type Simulation = { active: boolean; mmPerHour: number; durationHours: number };

/** Demo control for rain_simulation (row id = 1), then recalculates flood levels. */
function DemoTools({ adminEmail }: { adminEmail: string }) {
  const { state, retry, update } = useSectionLoad(async () => {
    const { data, error } = await supabase
      .from(RAIN_SIMULATION.table)
      .select(`${RAIN_SIMULATION.active}, ${RAIN_SIMULATION.mmPerHour}, ${RAIN_SIMULATION.durationHours}`)
      .eq("id", RAIN_SIMULATION.rowId)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      active: row[RAIN_SIMULATION.active] === true,
      mmPerHour: num(row[RAIN_SIMULATION.mmPerHour], 20),
      durationHours: num(row[RAIN_SIMULATION.durationHours], 3),
    } satisfies Simulation;
  });

  return (
    <section>
      <SubHeading>Demo tools (presentation only)</SubHeading>
      <LoadGate state={state} retry={retry} loadingText="Loading simulation...">
        {(saved) => <SimulationForm saved={saved} adminEmail={adminEmail} onSaved={(next) => update(() => next)} />}
      </LoadGate>
    </section>
  );
}

function SimulationForm({
  saved,
  adminEmail,
  onSaved,
}: {
  saved: Simulation;
  adminEmail: string;
  onSaved: (next: Simulation) => void;
}) {
  const [active, setActive] = useState(saved.active);
  const [mm, setMm] = useState(String(saved.mmPerHour));
  const [hours, setHours] = useState(String(saved.durationHours));
  const [busy, setBusy] = useState(false);

  const mmValue = parseNumber(mm);
  const hoursValue = parseNumber(hours);
  const mmError = mmValue === null || mmValue <= 0 ? "Enter more than 0." : mmValue > 200 ? "At most 200 mm/h." : null;
  const hoursError =
    hoursValue === null || hoursValue < 1 || !Number.isInteger(hoursValue) ? "Whole hours, at least 1." : hoursValue > 48 ? "At most 48 h." : null;

  const write = async (next: Simulation) => {
    setBusy(true);
    try {
      const now = new Date();
      const row: Record<string, unknown> = {
        id: RAIN_SIMULATION.rowId,
        [RAIN_SIMULATION.active]: next.active,
        [RAIN_SIMULATION.mmPerHour]: next.mmPerHour,
        [RAIN_SIMULATION.durationHours]: next.durationHours,
        [RAIN_SIMULATION.updatedAt]: now.toISOString(),
      };
      if (next.active) {
        row[RAIN_SIMULATION.expiresAt] = new Date(now.getTime() + next.durationHours * 3_600_000).toISOString();
      }
      const { data, error } = await supabase.from(RAIN_SIMULATION.table).upsert(row, { onConflict: "id" }).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("The database did not save the simulation (no permission).");
      onSaved(next);
      setActive(next.active);

      const details = `rain_simulation: ${describeChanges(
        { active: saved.active, mm_per_hour: saved.mmPerHour, duration_hours: saved.durationHours },
        { active: next.active, mm_per_hour: next.mmPerHour, duration_hours: next.durationHours },
      )}`;
      const logError = await writeAuditLog("SIMULATION_TOGGLED", adminEmail, details);
      if (logError) toast.warning(`Saved, but the audit log entry failed: ${logError}`);

      await runFloodRiskUpdate();
      toast.success(
        next.active
          ? "Simulation applied. Flood risk updated on the map."
          : "Simulation turned off. Flood risk is back to automated estimates.",
      );
    } catch (err) {
      console.error("Simulation update failed:", err);
      toast.error(errorText(err, "Unable to update the simulation."));
      setActive(saved.active);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (next: boolean) => {
    setActive(next);
    // Turning on only reveals the inputs; "Apply simulation" writes them.
    if (!next && saved.active) void write({ ...saved, active: false });
  };

  return (
    <div className="space-y-3">
      <SwitchRow
        label="Simulate rainfall"
        hint="Overrides the forecast with your rainfall and recalculates flood risk right away."
        checked={active}
        disabled={busy}
        onChange={toggle}
      />
      {active ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberField label="Rainfall" unit="mm/h" value={mm} min={0} max={200} disabled={busy} error={mmError} onChange={setMm} />
            <NumberField label="Duration" unit="h" value={hours} min={1} max={48} disabled={busy} error={hoursError} onChange={setHours} />
          </div>
          <ClayButton
            className="w-full"
            disabled={busy || !!mmError || !!hoursError}
            onClick={() => void write({ active: true, mmPerHour: mmValue!, durationHours: hoursValue! })}
          >
            {busy ? <Loader size={18} className="animate-spin" aria-hidden="true" /> : <CloudRain size={18} aria-hidden="true" />}
            {busy ? "Updating flood risk..." : "Apply simulation"}
          </ClayButton>
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {busy ? "Turning off..." : "Simulation is off. Flood risk follows the automated rainfall forecast."}
        </p>
      )}
    </div>
  );
}

type AuditRow = { id: string; action: string; userName: string; timestamp: string; details: string };

function formatTimestamp(value: string) {
  const time = new Date(value.includes("T") || value.includes("Z") ? value : value.replace(" ", "T")).getTime();
  return Number.isFinite(time)
    ? new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : value;
}

function AuditLogViewer() {
  const [filter, setFilter] = useState("");
  const { state, retry } = useSectionLoad(async () => {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, user_name, timestamp, details")
      .order("timestamp", { ascending: false })
      .limit(50);
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map(
      (row, i): AuditRow => ({
        id: String(row.id ?? i),
        action: String(row.action ?? ""),
        userName: String(row.user_name ?? ""),
        timestamp: String(row.timestamp ?? ""),
        details: String(row.details ?? ""),
      }),
    );
  });

  const rows = state.status === "ready" ? state.data : [];
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => `${r.action} ${r.userName} ${r.details} ${r.timestamp}`.toLowerCase().includes(needle));
  }, [rows, filter]);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <SubHeading>Audit log (latest 50)</SubHeading>
        <button
          type="button"
          onClick={retry}
          className="flex min-h-11 items-center gap-1 px-2 text-sm font-semibold"
          style={{ color: "var(--primary-shade)" }}
        >
          <RefreshCw size={14} aria-hidden="true" /> Reload
        </button>
      </div>
      <label className="relative mb-3 block">
        <span className="sr-only">Filter audit log</span>
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
        <input
          type="search"
          className="clay-input has-icon-left"
          placeholder="Filter by action, user or details"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </label>
      <LoadGate state={state} retry={retry} loadingText="Loading audit log...">
        {() =>
          visible.length === 0 ? (
            <EmptyNote>{rows.length ? "No entries match the filter." : "No audit entries yet."}</EmptyNote>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {visible.map((row) => (
                <li key={row.id} className="rounded-xl border bg-white px-3 py-2" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-xs font-bold tracking-wide" style={{ color: "var(--text-primary)" }}>{row.action || "(no action)"}</span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{row.timestamp ? formatTimestamp(row.timestamp) : ""}</span>
                  </div>
                  {row.details && <p className="mt-1 break-words text-sm" style={{ color: "var(--text-primary)" }}>{row.details}</p>}
                  {row.userName && <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>by {row.userName}</p>}
                </li>
              ))}
            </ul>
          )
        }
      </LoadGate>
    </section>
  );
}
