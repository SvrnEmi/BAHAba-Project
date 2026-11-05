import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Info, MapPin } from "lucide-react";
import {
  PAGASA,
  SOURCE_LABELS,
  STATUS_LABELS,
  channelsText,
  pagasaText,
  previewLine,
  type AlertLevel,
  type AlertRow,
  type AlertSource,
  type AlertStatus,
} from "../../../lib/alerts";
import { formatManilaDateTime, relativeTime, toTime } from "../../../lib/barangayAdmin";

/*
 * Collapsible alert and report cards (disclosure pattern: a real button with
 * aria-expanded / aria-controls; Enter and Space toggle it). Collapsed cards
 * show one summary row so long alert lists stay small; lists scroll inside a
 * bounded area (.alert-scroll, about 40% of the viewport).
 */

/** PAGASA color badge with its text label, e.g. "Orange - Be Prepared". */
export function PagasaBadge({ level, compact = true }: { level: AlertLevel; compact?: boolean }) {
  const Icon = level === "advisory" ? Info : AlertTriangle;
  return (
    <span className={`risk-badge ${PAGASA[level].badge} ${compact ? "is-compact" : ""}`}>
      <Icon size={compact ? 12 : 16} aria-hidden="true" />
      {pagasaText(level)}
    </span>
  );
}

export function SourceBadge({ source }: { source: AlertSource }) {
  return (
    <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold" style={{ color: "var(--text-primary)", border: "1px solid var(--border)" }}>
      {SOURCE_LABELS[source]}
    </span>
  );
}

const STATUS_CLASS: Record<AlertStatus, string> = {
  pending: "risk-badge-medium",
  approved: "risk-badge-low",
  rejected: "risk-badge-high",
  withdrawn: "risk-badge-neutral",
};

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  return <span className={`risk-badge is-compact ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>;
}

/** Generic disclosure card: summary always visible, body rendered only while open. */
export function DisclosureCard({
  id,
  summary,
  children,
  accent,
  defaultOpen = false,
  className = "",
  label,
}: {
  id?: string;
  summary: ReactNode;
  children: ReactNode;
  /** Left border color (flat alert style); omit for a clay surface. */
  accent?: string;
  defaultOpen?: boolean;
  className?: string;
  /** Accessible name for the toggle (defaults to the summary text). */
  label?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const surface = accent ? "flat-alert" : "clay";
  return (
    <article id={id} className={`${surface} p-0 ${className}`} style={accent ? ({ "--alert-color": accent } as CSSProperties) : undefined}>
      <button
        type="button"
        className="flex w-full min-h-12 items-start gap-2 p-3 text-left sm:p-4"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`mt-1 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--text-secondary)" }}
        />
      </button>
      <div id={bodyId} hidden={!open} className="px-3 pb-3 sm:px-4 sm:pb-4">
        {open && children}
      </div>
    </article>
  );
}

/** Collapsed: badge, title, barangay, relative time, one-line preview. Expanded: full message, source, channels, actions. */
export function CollapsibleAlertCard({
  alert,
  now = Date.now(),
  actions,
  showStatus = false,
  id,
  extra,
}: {
  alert: AlertRow;
  now?: number;
  actions?: ReactNode;
  showStatus?: boolean;
  id?: string;
  /** Extra detail lines inside the expanded body. */
  extra?: ReactNode;
}) {
  const t = toTime(alert.sent_at);
  const summary = (
    <span className="block space-y-1">
      <span className="flex flex-wrap items-center gap-1.5">
        <PagasaBadge level={alert.level} />
        {alert.source === "barangay" && <SourceBadge source="barangay" />}
        {showStatus && <AlertStatusBadge status={alert.status} />}
      </span>
      <span className="block text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{alert.title || "Alert"}</span>
      <span className="flex min-w-0 items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        <MapPin size={12} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{alert.target_barangay}</span>
        {t > 0 && <span className="shrink-0">· {relativeTime(t, now)}</span>}
      </span>
      <span className="block truncate text-xs font-normal" style={{ color: "var(--text-secondary)" }}>{previewLine(alert.message)}</span>
    </span>
  );
  return (
    <DisclosureCard id={id} accent={PAGASA[alert.level].accent} summary={summary} label={`${pagasaText(alert.level)}: ${alert.title || "Alert"}, ${alert.target_barangay}. Show details`}>
      <div className="space-y-2 border-t pt-3">
        <p className="whitespace-pre-wrap break-words text-sm font-normal" style={{ color: "var(--text-primary)" }}>{alert.message}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          <dt className="font-semibold">Source</dt>
          <dd>{SOURCE_LABELS[alert.source]}{alert.created_by && alert.source !== "auto" ? ` (${alert.created_by})` : ""}</dd>
          <dt className="font-semibold">Channels</dt>
          <dd>{channelsText(alert.channels)}</dd>
          <dt className="font-semibold">Sent</dt>
          <dd>{formatManilaDateTime(alert.sent_at)}</dd>
          {showStatus && (
            <>
              <dt className="font-semibold">Status</dt>
              <dd>{STATUS_LABELS[alert.status]}</dd>
            </>
          )}
          {alert.status === "withdrawn" && (
            <>
              <dt className="font-semibold">Withdrawn</dt>
              <dd>{alert.withdrawn_reason?.trim() || "No reason given"}{alert.withdrawn_at ? ` · ${formatManilaDateTime(alert.withdrawn_at)}` : ""}</dd>
            </>
          )}
          {alert.status === "rejected" && (
            <>
              <dt className="font-semibold">Reason</dt>
              <dd>{alert.rejection_reason?.trim() || "No reason given"}</dd>
            </>
          )}
        </dl>
        {extra}
        {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
      </div>
    </DisclosureCard>
  );
}

/** Bounded, scrollable list (about 40% of the viewport). */
export function AlertScrollList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="alert-scroll -mx-1 px-1 py-1" role="region" aria-label={label} tabIndex={0}>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}
