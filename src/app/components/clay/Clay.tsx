import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Info, type LucideIcon } from "lucide-react";

/*
 * Clay building blocks. Styles live in src/styles/clay.css.
 * Clay is for containers, buttons and decorative chips only; alerts and
 * risk/status badges stay flat and high contrast.
 */

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

type ClayCardProps = {
  children: ReactNode;
  className?: string;
  radius?: number;
  /** Solid fill override (e.g. a pastel); default is the clay gradient. */
  color?: string;
  onClick?: () => void;
  ariaLabel?: string;
  style?: CSSProperties;
};

/** Raised clay surface. With onClick it renders a button that squishes on press. */
export function ClayCard({ children, className, radius = 24, color, onClick, ariaLabel, style }: ClayCardProps) {
  const surface: CSSProperties = { borderRadius: radius, ...(color ? { background: color } : {}), ...style };
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cx("clay clay-press text-left min-h-12 min-w-12", className)}
        style={surface}
      >
        {children}
      </button>
    );
  }
  return (
    <div className={cx("clay", className)} style={surface}>
      {children}
    </div>
  );
}

type ClayButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  icon?: LucideIcon;
};

/** Pill clay button: primary (blue gradient) or secondary (clay surface, primary icon). */
export function ClayButton({ variant = "primary", icon: Icon, className, children, type = "button", ...rest }: ClayButtonProps) {
  return (
    <button type={type} className={cx("clay-btn", `clay-btn-${variant}`, className)} {...rest}>
      {Icon && <Icon size={20} aria-hidden="true" />}
      {children}
    </button>
  );
}

const pastelIcon: Record<string, string> = {
  peach: "var(--peach-icon)",
  mint: "var(--mint-icon)",
  lavender: "var(--lavender-icon)",
};

type Pastel = "peach" | "mint" | "lavender";

/** 54px pastel clay circle with a dark icon and an optional 12px label. */
export function ClayIconChip({
  icon: Icon,
  pastel = "lavender",
  label,
  onClick,
  size = 54,
}: {
  icon: LucideIcon;
  pastel?: Pastel;
  label?: string;
  onClick?: () => void;
  size?: number;
}) {
  const circle = (
    <span
      className={cx("clay flex items-center justify-center", onClick && "clay-press")}
      style={{ width: size, height: size, borderRadius: "9999px", background: `var(--${pastel})` }}
    >
      <Icon size={Math.round(size * 0.44)} style={{ color: pastelIcon[pastel] }} aria-hidden="true" />
    </span>
  );
  const content = (
    <>
      {circle}
      {label && (
        <span className="mt-2 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={label} className="flex flex-col items-center min-w-12">
        {content}
      </button>
    );
  }
  return <span className="flex flex-col items-center">{content}</span>;
}

export type RiskLevel = "low" | "medium" | "high";

const riskLabels: Record<RiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

/** Solid flood-risk badge: icon + text label, never clay. */
export function RiskBadge({ risk, compact = false }: { risk: RiskLevel | null | undefined; compact?: boolean }) {
  const Icon = risk === "low" ? CheckCircle2 : risk ? AlertTriangle : HelpCircle;
  return (
    <span className={cx("risk-badge", risk ? `risk-badge-${risk}` : "risk-badge-neutral", compact && "is-compact")}>
      <Icon size={compact ? 12 : 16} aria-hidden="true" />
      {risk ? riskLabels[risk] : "Risk unavailable"}
    </span>
  );
}

export type AlertLevel = "advisory" | "warning" | "critical";

const alertStyle: Record<AlertLevel, { color: string; badge: string; label: string }> = {
  advisory: { color: "var(--primary-shade)", badge: "risk-badge-info", label: "Advisory" },
  warning: { color: "var(--risk-medium)", badge: "risk-badge-medium", label: "Warning" },
  critical: { color: "var(--risk-high)", badge: "risk-badge-high", label: "Critical" },
};

/** Solid alert-level badge, never clay. */
export function AlertLevelBadge({ level, compact = true }: { level: AlertLevel; compact?: boolean }) {
  const s = alertStyle[level] ?? alertStyle.advisory;
  const Icon = level === "advisory" ? Info : AlertTriangle;
  return (
    <span className={cx("risk-badge", s.badge, compact && "is-compact")}>
      <Icon size={compact ? 12 : 16} aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** Flat alert card: white, 4px left border in the level color, square corners. */
export function AlertCard({
  level,
  title,
  message,
  meta,
}: {
  level: AlertLevel;
  title: string;
  message: string;
  /** Optional footer text, e.g. barangay and time. */
  meta?: ReactNode;
}) {
  const s = alertStyle[level] ?? alertStyle.advisory;
  return (
    <div className="flat-alert" style={{ "--alert-color": s.color } as CSSProperties}>
      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {message}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs" style={{ color: "var(--text-secondary)" }}>
          {meta}
        </span>
        <AlertLevelBadge level={level} />
      </div>
    </div>
  );
}

/** BAHAba logo on a clay disc with a flat primary-gradient core. */
export function ClayLogoBadge({ size = 104, icon: Icon }: { size?: number; icon: LucideIcon }) {
  return (
    <span
      className="clay flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: "9999px", padding: size * 0.14 }}
    >
      <span
        className="flex h-full w-full items-center justify-center rounded-full"
        style={{ background: "linear-gradient(to bottom right, var(--btn-from), var(--btn-to))" }}
      >
        <Icon size={size * 0.44} color="#fff" strokeWidth={2.5} aria-hidden="true" />
      </span>
    </span>
  );
}

/** Screen title row used by resident tabs. */
export function ScreenHeader({ title, subtitle, icon, pastel }: { title: string; subtitle: string; icon: LucideIcon; pastel: Pastel }) {
  return (
    <div className="flex items-center gap-3.5 px-[18px] pt-5 pb-3">
      <ClayIconChip icon={icon} pastel={pastel} size={48} />
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}
