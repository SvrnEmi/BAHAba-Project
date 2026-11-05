import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight, Loader, Megaphone, Pencil, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { writeAuditLog } from "../../../lib/audit";
import {
  ALERT_REJECT_REASONS,
  PAGASA_LEVEL_OPTIONS,
  alertLifecycle,
  editAlert,
  pagasaText,
  republishAlert,
  withdrawAlert,
  type ActiveAlertIds,
  type AlertLevel,
  type AlertRow,
} from "../../../lib/alerts";
import { errorMessage, toTime } from "../../../lib/barangayAdmin";
import { ReasonDialog } from "../ReasonDialog";
import { AlertScrollList, CollapsibleAlertCard } from "./AlertDisclosure";

/*
 * MDRRMO alert actions (edit, withdraw, republish, delete) and the
 * collapsible "Barangay alerts" box. The box remembers open / closed per
 * browser (localStorage, every access in try/catch).
 */

const BOX_KEY = "bahaba.mdrrmo.barangayAlertsOpen";
const DAY_MS = 24 * 60 * 60 * 1000;

function readOpen(): boolean {
  try {
    return localStorage.getItem(BOX_KEY) === "open";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean) {
  try {
    localStorage.setItem(BOX_KEY, open ? "open" : "closed");
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}

type Dialog = { kind: "edit" | "withdraw"; alert: AlertRow } | null;

/** Action buttons + dialogs for one alert. `onChanged` gets the saved row; `onDeleted` the id. */
export function useMdrrmoAlertActions(adminEmail: string, onChanged: (a: AlertRow) => void, onDeleted: (id: number) => void) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const republish = async (alert: AlertRow) => {
    if (!window.confirm(`Republish "${alert.title}"? Residents of ${alert.target_barangay} will see it again as a new alert.`)) return;
    setBusyId(alert.id);
    setError(null);
    try {
      onChanged(await republishAlert(alert));
      void writeAuditLog("ALERT_REPUBLISHED", adminEmail, `Alert #${alert.id} republished (${pagasaText(alert.level)}, ${alert.target_barangay})`);
    } catch (err) {
      setError(errorMessage(err, "Unable to republish the alert."));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (alert: AlertRow) => {
    if (!window.confirm(`Delete "${alert.title}"? This cannot be undone.`)) return;
    setBusyId(alert.id);
    setError(null);
    const { error: deleteError } = await supabase.from("alerts").delete().eq("id", alert.id);
    setBusyId(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onDeleted(alert.id);
    void writeAuditLog("ALERT_DELETED", adminEmail, `Alert #${alert.id} deleted (${alert.target_barangay})`);
  };

  const actions = (alert: AlertRow) => {
    const busy = busyId === alert.id;
    return (
      <>
        <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={busy} onClick={() => setDialog({ kind: "edit", alert })}>
          <Pencil size={16} aria-hidden="true" /> Edit
        </button>
        {alert.status === "approved" ? (
          <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={busy} onClick={() => setDialog({ kind: "withdraw", alert })}>
            <Undo2 size={16} aria-hidden="true" /> Withdraw
          </button>
        ) : alert.status === "withdrawn" || alert.status === "rejected" ? (
          <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={busy} onClick={() => void republish(alert)}>
            {busy ? <Loader size={16} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />} Republish
          </button>
        ) : null}
        <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={busy} onClick={() => void remove(alert)} aria-label={`Delete alert ${alert.title}`}>
          <Trash2 size={16} aria-hidden="true" /> Delete
        </button>
      </>
    );
  };

  const dialogs = (
    <>
      {error && (
        <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
          {error}
        </p>
      )}
      {dialog?.kind === "withdraw" && (
        <ReasonDialog
          title="Withdraw alert"
          subtitle={`${pagasaText(dialog.alert.level)} · ${dialog.alert.title} · ${dialog.alert.target_barangay}. Residents will no longer see it.`}
          presets={ALERT_REJECT_REASONS}
          confirmLabel="Withdraw alert"
          danger
          minLength={3}
          fieldLabel="Reason"
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            onChanged(await withdrawAlert(dialog.alert.id, reason));
            void writeAuditLog("ALERT_WITHDRAWN", adminEmail, `Alert #${dialog.alert.id} withdrawn: ${reason}`);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "edit" && (
        <EditAlertDialog
          alert={dialog.alert}
          onClose={() => setDialog(null)}
          onSave={async (values) => {
            onChanged(await editAlert(dialog.alert.id, values));
            void writeAuditLog("ALERT_EDITED", adminEmail, `Alert #${dialog.alert.id} edited (${pagasaText(values.level)})`);
            setDialog(null);
          }}
        />
      )}
    </>
  );

  return { actions, dialogs };
}

function EditAlertDialog({
  alert,
  onClose,
  onSave,
}: {
  alert: AlertRow;
  onClose: () => void;
  onSave: (values: { level: AlertLevel; title: string; message: string }) => Promise<void>;
}) {
  const [level, setLevel] = useState<AlertLevel>(alert.level);
  const [title, setTitle] = useState(alert.title);
  const [message, setMessage] = useState(alert.message);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const save = async () => {
    if (!title.trim() || !message.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ level, title, message });
    } catch (err) {
      setError(errorMessage(err, "Unable to save the alert."));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="edit-alert-title" className="clay max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto p-6">
        <h3 id="edit-alert-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Edit alert</h3>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{alert.target_barangay}</p>
        <label className="block">
          <span className="clay-label">PAGASA level</span>
          <select className="clay-input" value={level} onChange={(e) => setLevel(e.target.value as AlertLevel)} disabled={busy} autoFocus>
            {PAGASA_LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="clay-label">Title</span>
          <input className="clay-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </label>
        <label className="block">
          <span className="clay-label">Message</span>
          <textarea className="clay-input min-h-28" value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} disabled={busy} />
        </label>
        {error && (
          <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>{error}</p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="clay-btn clay-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="clay-btn clay-btn-primary" onClick={() => void save()} disabled={busy || !title.trim() || !message.trim()}>
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Collapsible box listing barangay-published alerts; collapsed by default. */
export function BarangayBroadcastBox({
  alerts,
  activeIds,
  now,
  adminEmail,
  onChanged,
  onDeleted,
}: {
  alerts: AlertRow[];
  activeIds: ActiveAlertIds | null;
  now: number;
  adminEmail: string;
  onChanged: (a: AlertRow) => void;
  onDeleted: (id: number) => void;
}) {
  const [open, setOpen] = useState(readOpen);
  const { actions, dialogs } = useMdrrmoAlertActions(adminEmail, onChanged, onDeleted);
  const barangayAlerts = alerts.filter((a) => a.source === "barangay");
  const last24h = barangayAlerts.filter((a) => now - toTime(a.sent_at) < DAY_MS).length;

  const toggle = () => {
    setOpen((o) => {
      writeOpen(!o);
      return !o;
    });
  };

  return (
    <section id="barangay-alerts-box" className="clay mb-6 p-0" aria-labelledby="barangay-alerts-box-title">
      <h2 id="barangay-alerts-box-title" className="m-0">
        <button
          type="button"
          className="flex min-h-12 w-full items-center gap-3 p-4 text-left"
          aria-expanded={open}
          aria-controls="barangay-alerts-box-body"
          onClick={toggle}
        >
          <Megaphone size={20} aria-hidden="true" style={{ color: "var(--peach-icon)" }} />
          <span className="flex-1 text-base font-bold" style={{ color: "var(--text-primary)" }}>Barangay alerts ({barangayAlerts.length})</span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-bold"
            style={{ background: last24h ? "var(--pagasa-orange)" : "var(--nav-well)", color: last24h ? "#1b1b1b" : "var(--text-secondary)" }}
          >
            {last24h} in 24 h
          </span>
          <ChevronDown size={18} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "var(--text-secondary)" }} />
        </button>
      </h2>
      <div id="barangay-alerts-box-body" hidden={!open} className="space-y-3 px-4 pb-4">
        {open && (
          <>
            <p className="text-xs font-normal" style={{ color: "var(--text-secondary)" }}>
              Barangays publish alerts to their own residents right away. You can open, edit, withdraw or republish any of them.
            </p>
            {dialogs}
            {barangayAlerts.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No barangay alerts yet.</p>
            ) : (
              <AlertScrollList label="Barangay alerts">
                {barangayAlerts.map((a) => (
                  <li key={a.id}>
                    <CollapsibleAlertCard id={`barangay-alert-${a.id}`} alert={a} now={now} showStatus lifecycle={alertLifecycle(a, activeIds, now)} actions={actions(a)} />
                  </li>
                ))}
              </AlertScrollList>
            )}
            <Link to="/admin/mdrrmo/alerts" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold" style={{ color: "var(--primary-shade)" }}>
              View all alerts <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
