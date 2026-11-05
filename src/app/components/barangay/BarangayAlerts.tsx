import { useState } from "react";
import { Link } from "react-router";
import { CheckCircle, ChevronRight, Loader, Send, Undo2, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { ALERT_TEMPLATES, errorMessage, fillTemplate, formatManilaDateTime } from "../../../lib/barangayAdmin";
import {
  ALERT_COLUMNS,
  ALERT_END_OPTIONS,
  ALERT_REJECT_REASONS,
  PAGASA_LEVEL_OPTIONS,
  alertEndIso,
  alertEndProblem,
  alertLifecycle,
  allClearMessage,
  allClearTitle,
  isLimitError,
  pagasaText,
  toAlertRow,
  useActiveAlertIds,
  withdrawAlert,
  type AlertEnd,
  type AlertLevel,
  type AlertRow,
} from "../../../lib/alerts";
import { AlertScrollList, CollapsibleAlertCard } from "../alerts/AlertDisclosure";
import { ReasonDialog } from "../ReasonDialog";

/*
 * Alerts for the admin's own barangay. Publishing is immediate: the server
 * sets target_barangay, source, status, created_by, recipients and sent_at,
 * so the insert only sends level, title, message, channels, expires_at and
 * is_all_clear. An all clear ends every older alert for the barangay, from any
 * source, in the active_alerts view. The server limits each
 * barangay to 5 alerts per hour (error text starts with "Limit reached").
 * A published alert can be withdrawn with a reason (min 3 characters).
 */

export type BarangayAlertRow = AlertRow;
export { ALERT_COLUMNS };
export const toAlert = toAlertRow;

type Draft = { level: AlertLevel; title: string; message: string; end: AlertEnd; customEnd: string; isAllClear: boolean };

export function BarangayAlertsSection({
  barangay,
  published,
  otherAlerts,
  loading,
  error,
  now,
  onChanged,
}: {
  barangay: string;
  /** Alerts published by this barangay (source barangay). */
  published: AlertRow[];
  /** MDRRMO and automatic alerts for the barangay, read-only. */
  otherAlerts: AlertRow[];
  loading: boolean;
  error: string | null;
  now: number;
  onChanged: (alert: AlertRow) => void;
}) {
  const [level, setLevel] = useState<AlertLevel>("advisory");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [template, setTemplate] = useState("");
  const [end, setEnd] = useState<AlertEnd>("none");
  const [customEnd, setCustomEnd] = useState("");
  const [isAllClear, setIsAllClear] = useState(false);
  const activeIds = useActiveAlertIds(barangay, [...published, ...otherAlerts]);
  const [confirming, setConfirming] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [withdrawing, setWithdrawing] = useState<AlertRow | null>(null);

  const applyTemplate = (id: string) => {
    setTemplate(id);
    const t = ALERT_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    // A template is a warning, so it must not go out flagged as an all clear.
    setIsAllClear(false);
    setLevel(t.level);
    setMessage(fillTemplate(t.text, barangay));
    setResult(null);
  };

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setTemplate("");
    setLevel("advisory");
    setEnd("none");
    setCustomEnd("");
    setIsAllClear(false);
  };

  const startAllClear = () => {
    setIsAllClear(true);
    setTemplate("");
    setLevel("advisory");
    setTitle(allClearTitle(barangay));
    setMessage(allClearMessage(barangay));
    setEnd("12");
    setCustomEnd("");
    setResult(null);
  };

  const review = () => {
    if (!title.trim() || !message.trim()) {
      setResult({ kind: "error", text: "Please enter a title and a message." });
      return;
    }
    const problem = alertEndProblem(end, customEnd);
    if (problem) {
      setResult({ kind: "error", text: problem });
      return;
    }
    setResult(null);
    setConfirming({ level, title: title.trim(), message: message.trim(), end, customEnd, isAllClear });
  };

  const publish = async () => {
    if (!confirming || saving) return;
    setSaving(true);
    setResult(null);
    try {
      const { data, error: insertError } = await supabase
        .from("alerts")
        .insert({
          level: confirming.level,
          title: confirming.title,
          message: confirming.message,
          channels: "push",
          // Counted from now, so time spent on the confirm dialog is not lost.
          expires_at: alertEndIso(confirming.end, confirming.customEnd),
          is_all_clear: confirming.isAllClear,
        })
        .select(ALERT_COLUMNS)
        .single();
      if (insertError) throw insertError;
      if (data) onChanged(toAlertRow(data as Record<string, unknown>));
      resetForm();
      setResult({ kind: "ok", text: `Published. Residents of ${barangay} are being notified.` });
    } catch (err) {
      const text = errorMessage(err, "Unable to publish the alert.");
      // The 5-per-hour limit message is shown exactly as the server words it.
      setResult({ kind: "error", text: isLimitError(text) ? text : `Unable to publish: ${text}` });
    } finally {
      setSaving(false);
      setConfirming(null);
    }
  };

  return (
    <div className="space-y-6">
      <form
        className="clay space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          review();
        }}
        aria-labelledby="new-alert-title"
      >
        <div>
          <h3 id="new-alert-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Create Alert</h3>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Alerts go straight to residents of {barangay} as a push notification. Up to 5 alerts per hour.
          </p>
        </div>
        {isAllClear ? (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 text-sm" style={{ color: "var(--text-primary)", borderLeft: "4px solid var(--risk-low)" }}>
            <span>This is an all clear. Earlier alerts for {barangay} will show as Cleared.</span>
            <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={resetForm} disabled={saving}>
              <X size={16} aria-hidden="true" /> Cancel all clear
            </button>
          </div>
        ) : (
          <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={startAllClear} disabled={saving}>
            <CheckCircle size={16} aria-hidden="true" /> All clear
          </button>
        )}
        <label className="block">
          <span className="clay-label">For</span>
          <input className="clay-input opacity-70" value={barangay} readOnly aria-readonly="true" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="clay-label">PAGASA level</span>
            <select className="clay-input" value={level} onChange={(e) => setLevel(e.target.value as AlertLevel)} disabled={saving || isAllClear}>
              {PAGASA_LEVEL_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="clay-label">Use template</span>
            <select className="clay-input" value={template} onChange={(e) => applyTemplate(e.target.value)} disabled={saving}>
              <option value="">Choose a template...</option>
              {ALERT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="clay-label">Title</span>
          <input className="clay-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Flood warning - Riverside area" disabled={saving} />
        </label>
        <label className="block">
          <span className="clay-label">Message</span>
          <textarea className="clay-input min-h-28" value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} placeholder="Message for residents..." disabled={saving} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="clay-label">Alert ends</span>
            <select className="clay-input" value={end} onChange={(e) => setEnd(e.target.value as AlertEnd)} disabled={saving}>
              {ALERT_END_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          {end === "custom" && (
            <label className="block">
              <span className="clay-label">End date and time</span>
              <input className="clay-input" type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} disabled={saving} />
            </label>
          )}
        </div>
        {result && (
          <p
            role={result.kind === "error" ? "alert" : "status"}
            className="bg-white px-3 py-2 text-sm"
            style={{ color: "var(--text-primary)", borderLeft: `4px solid ${result.kind === "error" ? "var(--risk-high)" : "var(--risk-low)"}` }}
          >
            {result.text}
          </p>
        )}
        <button type="submit" className="clay-btn clay-btn-primary w-full sm:w-auto" disabled={saving}>
          {saving ? <Loader size={18} className="animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
          {saving ? "Publishing..." : "Publish alert"}
        </button>
      </form>

      <section aria-labelledby="my-published-title" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 id="my-published-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            My published alerts ({published.length})
          </h3>
          <Link to="/admin/barangay/alerts" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold" style={{ color: "var(--primary-shade)" }}>
            View all <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
        {error ? (
          <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
            Could not load your alerts: {error}
          </p>
        ) : loading ? (
          <div className="clay h-24 animate-pulse" aria-busy="true" />
        ) : published.length === 0 ? (
          <div className="clay p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No alerts published for {barangay} yet</div>
        ) : (
          <AlertScrollList label="My published alerts">
            {published.map((a) => (
              <li key={a.id}>
                <CollapsibleAlertCard
                  id={`alert-${a.id}`}
                  alert={a}
                  now={now}
                  showStatus
                  lifecycle={alertLifecycle(a, activeIds, now)}
                  actions={
                    a.status === "approved" ? (
                      <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={() => setWithdrawing(a)}>
                        <Undo2 size={16} aria-hidden="true" /> Withdraw
                      </button>
                    ) : null
                  }
                />
              </li>
            ))}
          </AlertScrollList>
        )}
      </section>

      {otherAlerts.length > 0 && (
        <section aria-labelledby="other-alerts-title" className="space-y-3">
          <h3 id="other-alerts-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>From MDRRMO and automatic warnings</h3>
          <AlertScrollList label="MDRRMO and automatic alerts">
            {otherAlerts.map((a) => (
              <li key={a.id}>
                <CollapsibleAlertCard id={`alert-${a.id}`} alert={a} now={now} showStatus lifecycle={alertLifecycle(a, activeIds, now)} />
              </li>
            ))}
          </AlertScrollList>
        </section>
      )}

      {confirming && (
        <ConfirmPublish
          barangay={barangay}
          draft={confirming}
          saving={saving}
          onCancel={() => !saving && setConfirming(null)}
          onConfirm={() => void publish()}
        />
      )}

      {withdrawing && (
        <ReasonDialog
          title="Withdraw alert"
          subtitle={`${pagasaText(withdrawing.level)} · ${withdrawing.title}. Residents will no longer see it.`}
          presets={ALERT_REJECT_REASONS}
          confirmLabel="Withdraw alert"
          danger
          minLength={3}
          fieldLabel="Reason"
          onClose={() => setWithdrawing(null)}
          onConfirm={async (reason) => {
            onChanged(await withdrawAlert(withdrawing.id, reason));
            setWithdrawing(null);
          }}
        />
      )}
    </div>
  );
}

function endText(draft: Draft): string {
  if (draft.end === "custom") return formatManilaDateTime(new Date(draft.customEnd).toISOString());
  const option = ALERT_END_OPTIONS.find((o) => o.value === draft.end);
  return draft.end === "none" ? "Until withdrawn" : `${option?.label} after publishing`;
}

function ConfirmPublish({
  barangay,
  draft,
  saving,
  onCancel,
  onConfirm,
}: {
  barangay: string;
  draft: Draft;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={(e) => e.target === e.currentTarget && onCancel()} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-publish-title" aria-describedby="confirm-publish-text" className="clay w-full max-w-md space-y-4 p-6">
        <h3 id="confirm-publish-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Publish this alert?</h3>
        <p id="confirm-publish-text" className="text-sm" style={{ color: "var(--text-primary)" }}>
          This sends a push notification to residents of {barangay} immediately.
        </p>
        <div className="bg-white p-3 text-sm" style={{ borderLeft: "4px solid var(--primary-shade)" }}>
          <p className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>Push preview</p>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>[{pagasaText(draft.level)}] {draft.title}</p>
          <p className="line-clamp-3 font-normal" style={{ color: "var(--text-secondary)" }}>{draft.message}</p>
        </div>
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>
          <span className="font-semibold">Ends:</span> {endText(draft)}
        </p>
        {draft.isAllClear && (
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            Every earlier alert for {barangay}, including MDRRMO and automatic warnings, will show as Cleared.
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="clay-btn clay-btn-secondary" onClick={onCancel} disabled={saving} autoFocus>Cancel</button>
          <button type="button" className="clay-btn clay-btn-primary" onClick={onConfirm} disabled={saving}>
            {saving ? <Loader size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
            {saving ? "Publishing..." : "Publish alert"}
          </button>
        </div>
      </div>
    </div>
  );
}
