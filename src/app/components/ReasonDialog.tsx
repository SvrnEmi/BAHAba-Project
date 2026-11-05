import { useEffect, useId, useRef, useState } from "react";
import { Loader } from "lucide-react";
import { OTHER_REASON } from "../../lib/alerts";

/*
 * Review dialog with a dropdown of ready messages plus "Other" (free text).
 * Used for report approve / reject and alert withdraw. The saved reason is the chosen message, or the typed text for
 * "Other"; an optional note can be added to a ready message.
 */
export function ReasonDialog({
  title,
  subtitle,
  presets,
  confirmLabel,
  danger = false,
  minLength = 3,
  maxLength = 500,
  fieldLabel = "Reason (shown to the resident)",
  optional = false,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle?: string;
  presets: string[];
  confirmLabel: string;
  danger?: boolean;
  minLength?: number;
  maxLength?: number;
  fieldLabel?: string;
  /** The message may be left empty; onConfirm then gets "". */
  optional?: boolean;
  /** Throw to show the error in the dialog; resolve to close it. */
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const id = useId();
  const [choice, setChoice] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const isOther = choice === OTHER_REASON;

  const reason = (isOther ? text : [choice, text.trim()].filter(Boolean).join(" - ")).trim();
  const valid = optional ? reason.length <= maxLength : !!choice && reason.length >= minLength && reason.length <= maxLength;

  useEffect(() => {
    selectRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : "Unable to save.");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="clay max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto p-6">
        <div>
          <h3 id={`${id}-title`} className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{title}</h3>
          {subtitle && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>}
        </div>
        <label className="block">
          <span className="clay-label">Ready message</span>
          <select
            ref={selectRef}
            className="clay-input"
            value={choice}
            disabled={busy}
            onChange={(e) => {
              setChoice(e.target.value);
              setError(null);
            }}
          >
            <option value="">Choose a message...</option>
            {presets.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value={OTHER_REASON}>Other (type your own)</option>
          </select>
        </label>
        <label className="block">
          <span className="clay-label">{isOther && !optional ? `${fieldLabel} (required)` : `Add a note (optional)`}</span>
          <textarea
            className="clay-input min-h-24"
            value={text}
            maxLength={maxLength}
            disabled={busy || (!choice && !optional)}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={`${id}-hint`}
          />
          <span id={`${id}-hint`} className="mt-1 block text-xs" style={{ color: "var(--text-secondary)" }}>
            {isOther && !optional ? `At least ${minLength} characters. ` : ""}
            {reason.length}/{maxLength}
          </span>
        </label>
        {error && (
          <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="clay-btn clay-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={`clay-btn ${danger ? "clay-btn-danger" : "clay-btn-primary"}`} disabled={busy || !valid} onClick={() => void save()}>
            {busy && <Loader size={16} className="animate-spin" aria-hidden="true" />}
            {busy ? "Saving..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
