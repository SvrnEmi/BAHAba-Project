import { useState } from "react";
import { CheckCircle, Clock, Loader, Send, XCircle } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { ALERT_TEMPLATES, errorMessage, fillTemplate, formatManilaDateTime, type AlertLevel } from "../../../lib/barangayAdmin";
import { AlertLevelBadge } from "../clay/Clay";

/*
 * Alert drafts for the admin's own barangay. Inserts are always pending;
 * MDRRMO approves or rejects them.
 */

export type BarangayAlertRow = {
  id: number;
  level: AlertLevel;
  title: string;
  message: string;
  target_barangay: string;
  created_by: string | null;
  status: string;
  rejection_reason: string | null;
  source: string | null;
  sent_at: string | null;
};

export const ALERT_COLUMNS = "id, level, title, message, target_barangay, created_by, status, rejection_reason, source, sent_at";

export const toAlert = (row: Record<string, unknown>): BarangayAlertRow => ({
  id: Number(row.id),
  level: row.level === "warning" || row.level === "critical" ? row.level : "advisory",
  title: String(row.title ?? ""),
  message: String(row.message ?? ""),
  target_barangay: String(row.target_barangay ?? ""),
  created_by: typeof row.created_by === "string" ? row.created_by : null,
  status: String(row.status ?? "pending"),
  rejection_reason: typeof row.rejection_reason === "string" ? row.rejection_reason : null,
  source: typeof row.source === "string" ? row.source : null,
  sent_at: typeof row.sent_at === "string" ? row.sent_at : null,
});

const LEVELS: Array<{ id: AlertLevel; label: string }> = [
  { id: "advisory", label: "Advisory - information" },
  { id: "warning", label: "Warning - prepare to act" },
  { id: "critical", label: "Critical - act now" },
];

function DraftStatus({ status }: { status: string }) {
  if (status === "approved") return <span className="risk-badge risk-badge-low is-compact"><CheckCircle size={12} aria-hidden="true" /> Approved</span>;
  if (status === "rejected") return <span className="risk-badge risk-badge-high is-compact"><XCircle size={12} aria-hidden="true" /> Rejected</span>;
  return <span className="risk-badge risk-badge-medium is-compact"><Clock size={12} aria-hidden="true" /> Pending</span>;
}

export function BarangayAlertsSection({
  barangay,
  createdBy,
  drafts,
  autoAlerts,
  loading,
  error,
  onCreated,
}: {
  barangay: string;
  createdBy: string;
  drafts: BarangayAlertRow[];
  /** Automated warnings (source auto) for the barangay, read-only. */
  autoAlerts: BarangayAlertRow[];
  loading: boolean;
  error: string | null;
  onCreated: (alert: BarangayAlertRow) => void;
}) {
  const [level, setLevel] = useState<AlertLevel>("advisory");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [template, setTemplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const applyTemplate = (id: string) => {
    setTemplate(id);
    const t = ALERT_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setLevel(t.level);
    setMessage(fillTemplate(t.text, barangay));
    setResult(null);
  };

  const submit = async () => {
    if (saving) return;
    if (!title.trim() || !message.trim()) {
      setResult({ kind: "error", text: "Please enter a title and a message." });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const { data, error: insertError } = await supabase
        .from("alerts")
        .insert({ level, title: title.trim(), message: message.trim(), target_barangay: barangay, created_by: createdBy, status: "pending" })
        .select(ALERT_COLUMNS)
        .single();
      if (insertError) throw insertError;
      if (data) onCreated(toAlert(data as Record<string, unknown>));
      setTitle("");
      setMessage("");
      setTemplate("");
      setLevel("advisory");
      setResult({ kind: "ok", text: "Sent to MDRRMO for approval." });
    } catch (err) {
      setResult({ kind: "error", text: errorMessage(err, "Unable to send the alert.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        className="clay space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        aria-labelledby="new-alert-title"
      >
        <div>
          <h3 id="new-alert-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>New alert</h3>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>MDRRMO reviews every alert before residents receive it.</p>
        </div>
        <label className="block">
          <span className="clay-label">For</span>
          <input className="clay-input opacity-70" value={barangay} readOnly aria-readonly="true" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="clay-label">Level</span>
            <select className="clay-input" value={level} onChange={(e) => setLevel(e.target.value as AlertLevel)} disabled={saving}>
              {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
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
          {saving ? "Sending..." : "Send to MDRRMO"}
        </button>
      </form>

      <section aria-labelledby="my-drafts-title" className="space-y-3">
        <h3 id="my-drafts-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>My drafts</h3>
        {error ? (
          <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
            Could not load your alerts: {error}
          </p>
        ) : loading ? (
          <div className="clay h-24 animate-pulse" aria-busy="true" />
        ) : drafts.length === 0 ? (
          <div className="clay p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No alert drafts for {barangay} yet</div>
        ) : (
          <ul className="space-y-3">
            {drafts.map((a) => (
              <li key={a.id} id={`alert-${a.id}`} className="clay space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertLevelBadge level={a.level} />
                  <DraftStatus status={a.status} />
                  <span className="ml-auto text-xs" style={{ color: "var(--text-secondary)" }}>{formatManilaDateTime(a.sent_at)}</span>
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{a.title}</p>
                <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--text-secondary)" }}>{a.message}</p>
                {a.status === "rejected" && (
                  <p className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
                    <span className="font-semibold">Reason:</span> {a.rejection_reason?.trim() || "No reason given"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {autoAlerts.length > 0 && (
        <section aria-labelledby="auto-alerts-title" className="space-y-3">
          <h3 id="auto-alerts-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Automated warnings</h3>
          <ul className="space-y-3">
            {autoAlerts.map((a) => (
              <li key={a.id} id={`alert-${a.id}`} className="clay space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertLevelBadge level={a.level} />
                  <DraftStatus status={a.status} />
                  <span className="ml-auto text-xs" style={{ color: "var(--text-secondary)" }}>{formatManilaDateTime(a.sent_at)}</span>
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{a.title}</p>
                <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--text-secondary)" }}>{a.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
