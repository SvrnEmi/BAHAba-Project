import type { CSSProperties } from "react";
import { Link } from "react-router";
import { ChevronRight, Megaphone } from "lucide-react";
import { PAGASA, pagasaText, type AlertRow } from "../../../lib/alerts";
import { STRINGS } from "../../../lib/strings";

const T = STRINGS.alerts;

/** Newest current alert above the hazard map. Shows nothing when there are none. */
export function MapAlertBanner({ alerts }: { alerts: AlertRow[] }) {
  const alert = alerts[0];
  if (!alert) return null;
  return (
    <Link
      to="/alerts"
      className="flat-alert mx-[18px] mb-3 flex min-h-12 items-center gap-2 p-3"
      style={{ "--alert-color": alert.is_all_clear ? "var(--risk-low)" : PAGASA[alert.level].accent } as CSSProperties}
    >
      <Megaphone size={18} className="shrink-0" style={{ color: "var(--text-primary)" }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          {alert.is_all_clear ? T.allClear : `${T.current} · ${pagasaText(alert.level)}`}
          {alerts.length > 1 ? ` · ${T.moreCount(alerts.length - 1)}` : ""}
        </span>
        <span className="block break-words text-sm font-bold" style={{ color: "var(--text-primary)" }}>{alert.title}</span>
      </span>
      <ChevronRight size={18} className="shrink-0" style={{ color: "var(--text-secondary)" }} aria-hidden="true" />
    </Link>
  );
}
