import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ClayButton } from "../clay/Clay";
import { errorText } from "../Profile";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

/**
 * Runs `load` once on mount (sections mount the first time they are opened,
 * so this is the lazy load) and again on retry(). One-shot reads, no realtime.
 */
export function useSectionLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadRef.current().then(
      (data) => !cancelled && setState({ status: "ready", data }),
      (err) => {
        console.error("Settings load failed:", err);
        if (!cancelled) setState({ status: "error", message: errorText(err, "Unable to load.") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const update = useCallback(
    (fn: (data: T) => T) => setState((s) => (s.status === "ready" ? { status: "ready", data: fn(s.data) } : s)),
    [],
  );
  return { state, retry, update };
}

/** Loading text, an error with Retry, or the children. */
export function LoadGate<T>({
  state,
  retry,
  loadingText = "Loading...",
  children,
}: {
  state: LoadState<T>;
  retry: () => void;
  loadingText?: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === "loading") {
    return (
      <p role="status" className="py-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        {loadingText}
      </p>
    );
  }
  if (state.status === "error") return <ErrorRetry message={state.message} retry={retry} />;
  return <>{children(state.data)}</>;
}

export function ErrorRetry({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="space-y-3">
      <p
        role="alert"
        className="bg-white px-3 py-2 text-sm"
        style={{ color: "var(--text-primary)", borderLeft: "4px solid var(--risk-high)" }}
      >
        {message}
      </p>
      <ClayButton variant="secondary" className="w-full" onClick={retry}>
        Retry
      </ClayButton>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="py-2 text-sm" style={{ color: "var(--text-secondary)" }}>
      {children}
    </p>
  );
}

/** Same switch markup as the Profile notification settings. */
export function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 py-1">
      <span className="min-w-0">
        <span className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
        {hint && (
          <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0"
      />
    </label>
  );
}

export function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  disabled,
  error,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  error?: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="clay-label">{label}</span>
      <span className="relative block">
        <input
          type="number"
          inputMode="decimal"
          className="clay-input pr-14"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
        />
        <span
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {unit}
        </span>
      </span>
      {error && (
        <span role="alert" className="mt-1 block text-xs" style={{ color: "var(--risk-high)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

/** Number from an input string, or null when blank / not a number. */
export function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Number from a possibly-null database column. */
export function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return value != null && Number.isFinite(n) ? n : fallback;
}
