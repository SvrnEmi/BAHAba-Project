import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { runFloodRiskUpdate } from "../../../lib/floodRisk";
import { describeChanges, writeAuditLog } from "../../../lib/audit";
import { ClayButton } from "../clay/Clay";
import { errorText } from "../Profile";
import { EmptyNote, LoadGate, NumberField, SwitchRow, num, parseNumber, useSectionLoad } from "./common";

type RiskSettings = {
  auto_enabled: boolean;
  auto_publish_high: boolean;
  draft_alerts: boolean;
  medium_mm_3h: number;
  high_mm_3h: number;
  medium_mm_24h: number;
  high_mm_24h: number;
  override_hours: number;
  holddown_hours: number;
};

type NumberKey = "medium_mm_3h" | "high_mm_3h" | "medium_mm_24h" | "high_mm_24h" | "override_hours" | "holddown_hours";
type Form = Omit<RiskSettings, NumberKey> & Record<NumberKey, string>;

const COLUMNS =
  "auto_enabled, auto_publish_high, draft_alerts, medium_mm_3h, high_mm_3h, medium_mm_24h, high_mm_24h, override_hours, holddown_hours";

const DEFAULTS: Record<NumberKey, number> = {
  medium_mm_3h: 30,
  high_mm_3h: 60,
  medium_mm_24h: 50,
  high_mm_24h: 100,
  override_hours: 6,
  holddown_hours: 3,
};

const THRESHOLDS: NumberKey[] = ["medium_mm_3h", "high_mm_3h", "medium_mm_24h", "high_mm_24h"];

const LABELS: Record<keyof RiskSettings, string> = {
  auto_enabled: "Automatic flood level updates",
  auto_publish_high: "Auto-publish HIGH risk alerts",
  draft_alerts: "Draft alerts at high risk",
  medium_mm_3h: "MEDIUM rainfall in 3 h (mm)",
  high_mm_3h: "HIGH rainfall in 3 h (mm)",
  medium_mm_24h: "MEDIUM rainfall in 24 h (mm)",
  high_mm_24h: "HIGH rainfall in 24 h (mm)",
  override_hours: "Manual override (h)",
  holddown_hours: "Hold-down (h)",
};

// Null columns fall back to the defaults (switches to off), so the form never breaks.
function fromRow(row: Record<string, unknown>): RiskSettings {
  return {
    auto_enabled: row.auto_enabled === true,
    auto_publish_high: row.auto_publish_high === true,
    draft_alerts: row.draft_alerts === true,
    medium_mm_3h: num(row.medium_mm_3h, DEFAULTS.medium_mm_3h),
    high_mm_3h: num(row.high_mm_3h, DEFAULTS.high_mm_3h),
    medium_mm_24h: num(row.medium_mm_24h, DEFAULTS.medium_mm_24h),
    high_mm_24h: num(row.high_mm_24h, DEFAULTS.high_mm_24h),
    override_hours: num(row.override_hours, DEFAULTS.override_hours),
    holddown_hours: num(row.holddown_hours, DEFAULTS.holddown_hours),
  };
}

const toForm = (s: RiskSettings): Form => ({
  ...s,
  medium_mm_3h: String(s.medium_mm_3h),
  high_mm_3h: String(s.high_mm_3h),
  medium_mm_24h: String(s.medium_mm_24h),
  high_mm_24h: String(s.high_mm_24h),
  override_hours: String(s.override_hours),
  holddown_hours: String(s.holddown_hours),
});

function validate(form: Form): { errors: Partial<Record<NumberKey, string>>; values: RiskSettings | null } {
  const errors: Partial<Record<NumberKey, string>> = {};
  const n = {} as Record<NumberKey, number>;
  const check = (key: NumberKey, min: number, max: number, minInclusive: boolean, whole = false) => {
    const value = parseNumber(form[key]);
    if (value === null) errors[key] = "Enter a number.";
    else if (minInclusive ? value < min : value <= min) errors[key] = minInclusive ? `Must be at least ${min}.` : "Must be more than 0.";
    else if (value > max) errors[key] = `Must be at most ${max}.`;
    else if (whole && !Number.isInteger(value)) errors[key] = "Use whole hours.";
    else n[key] = value;
  };
  check("medium_mm_3h", 0, 300, false);
  check("high_mm_3h", 0, 300, false);
  check("medium_mm_24h", 0, 800, false);
  check("high_mm_24h", 0, 800, false);
  check("override_hours", 1, 24, true, true);
  check("holddown_hours", 0, 12, true, true);
  if (n.medium_mm_3h != null && n.high_mm_3h != null && n.medium_mm_3h >= n.high_mm_3h) {
    errors.medium_mm_3h = "MEDIUM must be lower than HIGH.";
  }
  if (n.medium_mm_24h != null && n.high_mm_24h != null && n.medium_mm_24h >= n.high_mm_24h) {
    errors.medium_mm_24h = "MEDIUM must be lower than HIGH.";
  }
  if (Object.keys(errors).length) return { errors, values: null };
  return {
    errors,
    values: { auto_enabled: form.auto_enabled, auto_publish_high: form.auto_publish_high, draft_alerts: form.draft_alerts, ...n },
  };
}

export function AutomationSection({ adminEmail }: { adminEmail: string }) {
  const { state, retry, update } = useSectionLoad(async () => {
    const { data, error } = await supabase.from("risk_settings").select(COLUMNS).eq("id", 1).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data as Record<string, unknown>) : null;
  });

  return (
    <LoadGate state={state} retry={retry} loadingText="Loading risk settings...">
      {(saved) =>
        saved ? (
          <AutomationForm saved={saved} adminEmail={adminEmail} onSaved={(next) => update(() => next)} />
        ) : (
          <EmptyNote>No risk settings found (risk_settings row id = 1). Ask the system administrator to create it.</EmptyNote>
        )
      }
    </LoadGate>
  );
}

function AutomationForm({
  saved,
  adminEmail,
  onSaved,
}: {
  saved: RiskSettings;
  adminEmail: string;
  onSaved: (next: RiskSettings) => void;
}) {
  const [form, setForm] = useState<Form>(() => toForm(saved));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { errors, values } = useMemo(() => validate(form), [form]);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(toForm(saved)), [form, saved]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!values) return;
    const warnings: string[] = [];
    if (saved.auto_enabled && !values.auto_enabled) warnings.push("turn OFF automatic flood level updates");
    if (!saved.auto_publish_high && values.auto_publish_high) warnings.push("auto-publish HIGH risk alerts to residents without review");
    for (const key of THRESHOLDS) {
      const before = saved[key];
      if (before > 0 && Math.abs(values[key] - before) / before > 0.5) {
        warnings.push(`change ${LABELS[key]} from ${before} to ${values[key]} (more than 50%)`);
      }
    }
    if (warnings.length && !window.confirm(`This will:\n- ${warnings.join("\n- ")}\n\nSave these changes?`)) return;

    setSaving(true);
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from("risk_settings")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .select("id");
      if (updateError) throw updateError;
      // RLS hides rows it refuses to update instead of raising an error.
      if (!data?.length) throw new Error("The database did not save the change (no permission to update risk_settings).");
      onSaved(values);
      setForm(toForm(values));

      const logError = await writeAuditLog("SETTINGS_UPDATED", adminEmail, `risk_settings: ${describeChanges(saved, values)}`);
      if (logError) toast.warning(`Saved, but the audit log entry failed: ${logError}`);

      try {
        await runFloodRiskUpdate();
        toast.success("Settings saved. Flood levels recalculated with the new rules.");
      } catch (err) {
        toast.error(`Settings saved, but recalculating flood levels failed: ${errorText(err, "unknown error")}`);
      }
    } catch (err) {
      console.error("Unable to save risk settings:", err);
      setError(errorText(err, "Unable to save the settings."));
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () =>
    setForm((f) => ({
      ...f,
      medium_mm_3h: String(DEFAULTS.medium_mm_3h),
      high_mm_3h: String(DEFAULTS.high_mm_3h),
      medium_mm_24h: String(DEFAULTS.medium_mm_24h),
      high_mm_24h: String(DEFAULTS.high_mm_24h),
      override_hours: String(DEFAULTS.override_hours),
      holddown_hours: String(DEFAULTS.holddown_hours),
    }));

  return (
    <div className="space-y-4">
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        <SwitchRow
          label="Automatic flood level updates"
          hint="Recalculate each barangay's level from the rainfall forecast."
          checked={form.auto_enabled}
          disabled={saving}
          onChange={(v) => set("auto_enabled", v)}
        />
        <SwitchRow
          label="Auto-publish HIGH risk alerts to residents"
          hint="When off, alerts are drafted for MDRRMO approval."
          checked={form.auto_publish_high}
          disabled={saving}
          onChange={(v) => set("auto_publish_high", v)}
        />
        <SwitchRow
          label="Draft alerts when a barangay reaches high risk"
          checked={form.draft_alerts}
          disabled={saving}
          onChange={(v) => set("draft_alerts", v)}
        />
      </div>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="clay-label mb-2">Rainfall that raises the level, next 3 hours</legend>
        <NumberField label="MEDIUM risk" unit="mm" value={form.medium_mm_3h} min={0} max={300} disabled={saving} error={errors.medium_mm_3h} onChange={(v) => set("medium_mm_3h", v)} />
        <NumberField label="HIGH risk" unit="mm" value={form.high_mm_3h} min={0} max={300} disabled={saving} error={errors.high_mm_3h} onChange={(v) => set("high_mm_3h", v)} />
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <legend className="clay-label mb-2">Rainfall that raises the level, next 24 hours</legend>
        <NumberField label="MEDIUM risk" unit="mm" value={form.medium_mm_24h} min={0} max={800} disabled={saving} error={errors.medium_mm_24h} onChange={(v) => set("medium_mm_24h", v)} />
        <NumberField label="HIGH risk" unit="mm" value={form.high_mm_24h} min={0} max={800} disabled={saving} error={errors.high_mm_24h} onChange={(v) => set("high_mm_24h", v)} />
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumberField label="Manual override lasts (1-24)" unit="h" value={form.override_hours} min={1} max={24} disabled={saving} error={errors.override_hours} onChange={(v) => set("override_hours", v)} />
        <NumberField label="Hold-down before lowering (0-12)" unit="h" value={form.holddown_hours} min={0} max={12} disabled={saving} error={errors.holddown_hours} onChange={(v) => set("holddown_hours", v)} />
      </div>

      {error && (
        <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ color: "var(--text-primary)", borderLeft: "4px solid var(--risk-high)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <ClayButton className="w-full sm:flex-1" onClick={() => void save()} disabled={!dirty || !values || saving}>
          {saving ? "Saving..." : "Save changes"}
        </ClayButton>
        <ClayButton variant="secondary" className="w-full sm:flex-1" onClick={resetDefaults} disabled={saving}>
          Reset to defaults
        </ClayButton>
      </div>
    </div>
  );
}
