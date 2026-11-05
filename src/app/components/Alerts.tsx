import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Bell, Megaphone, ChevronRight } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { markAlertsSeenForCurrentUser } from "../../lib/alertsSeen";
import { useResidentAlerts, useResidentBarangay } from "../../lib/residentAlerts";
import { STRINGS } from "../../lib/strings";
import { ClayCard, ScreenHeader } from "./clay/Clay";
import { AlertScrollList, CollapsibleAlertCard } from "./alerts/AlertDisclosure";

const T = STRINGS.alerts;

export function Alerts() {
  const { session } = useAuth();
  const barangay = useResidentBarangay(session?.user.id ?? null);
  const { alerts: floodAlerts, loading, error } = useResidentAlerts(barangay);
  const [now, setNow] = useState(() => Date.now());

  // Opening Alerts clears the Home bell badge. Marked again on leave so alerts
  // that arrived while this screen was open don't count as unread.
  useEffect(() => {
    void markAlertsSeenForCurrentUser();
    return () => {
      void markAlertsSeenForCurrentUser();
    };
  }, []);

  // Relative times ("5 minutes ago") stay current.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="min-h-full bg-background">
      <ScreenHeader title={T.screenTitle} subtitle={T.screenSubtitle} icon={Bell} pastel="peach" />

      <div className="px-[18px] pt-2 pb-6">
        {/* Flood alerts: flat cards, never clay. Collapsed by default, list bounded to ~40% of the screen. */}
        <section aria-labelledby="flood-alerts-title">
          <div className="flex items-center gap-3 mb-3">
            <Megaphone size={22} style={{ color: "var(--peach-icon)" }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 id="flood-alerts-title" className="text-lg font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                {T.sectionTitle}
              </h2>
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                {T.sectionSubtitle}{barangay ? ` · ${barangay}` : ""}
              </p>
            </div>
            <Link to="/alerts/all" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold" style={{ color: "var(--primary-shade)" }}>
              {T.viewAll} <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{T.checking}</p>
          ) : error ? (
            <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
              {T.loadFailed} {error}
            </p>
          ) : floodAlerts.length === 0 ? (
            <ClayCard className="p-6 text-center">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{T.none}</p>
            </ClayCard>
          ) : (
            <AlertScrollList label={T.listLabel}>
              {floodAlerts.map((alert) => (
                <li key={alert.id}>
                  <CollapsibleAlertCard alert={alert} now={now} />
                </li>
              ))}
            </AlertScrollList>
          )}
        </section>
      </div>
    </div>
  );
}
