import { useEffect, useState, type ReactNode } from "react";
import { Bell, Share2, Megaphone } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { subscribeToTable } from "../../lib/realtime";
import { markAlertsSeenForCurrentUser } from "../../lib/alertsSeen";
import { AlertCard, ClayCard, ScreenHeader } from "./clay/Clay";

type AlertRow = {
  id: number;
  title: string;
  message: string;
  target_barangay: string;
  level: "advisory" | "warning" | "critical";
  created_by: string;
  sent_at: string;
  status: string;
};

export function Alerts() {
  const [floodAlerts, setFloodAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Opening Alerts clears the Home bell badge. Marked again on leave so alerts
  // that arrived while this screen was open don't count as unread.
  useEffect(() => {
    void markAlertsSeenForCurrentUser();
    return () => {
      void markAlertsSeenForCurrentUser();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAlerts = async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("status", "approved")
        .order("sent_at", { ascending: false });

      if (cancelled) return;
      if (!error) {
        // Keep any rows that arrived over realtime while this was loading.
        setFloodAlerts((current) => {
          const loaded = (data as AlertRow[]) ?? [];
          const extra = current.filter((row) => !loaded.some((item) => item.id === row.id));
          return [...extra, ...loaded];
        });
      }
      setLoading(false);
    };

    void loadAlerts();

    const unsubscribe = subscribeToTable<AlertRow>("alerts", (change) => {
      if (change.eventType !== "INSERT") return;
      const row = change.new as AlertRow;
      setFloodAlerts((current) => [row, ...current.filter((item) => item.id !== row.id)]);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-full bg-background">
      <ScreenHeader title="Alerts & Notifications" subtitle="Stay informed about flood risks" icon={Bell} pastel="peach" />

      <div className="px-[18px] pt-2 pb-6">
        {/* Flood Alerts from Admin: flat cards, never clay */}
        <section className="mb-7">
          <div className="flex items-center gap-3 mb-3">
            <Megaphone size={22} style={{ color: "var(--peach-icon)" }} aria-hidden="true" />
            <div>
              <h2 className="text-lg font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                Flood Alerts
              </h2>
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Official alerts from MDRRMO
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Checking for approved alerts...</p>
            ) : floodAlerts.length === 0 ? (
              <ClayCard className="p-6 text-center">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No approved alerts available.</p>
              </ClayCard>
            ) : (
              floodAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  level={alert.level ?? "advisory"}
                  title={alert.title}
                  message={alert.message}
                  meta={`📍 ${alert.target_barangay} · ${new Date(alert.sent_at).toLocaleString()}`}
                />
              ))
            )}
          </div>
        </section>

        {/* Social Media Feed Integration */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              Social Media Updates
            </h2>
            <Share2 size={20} style={{ color: "var(--text-secondary)" }} aria-hidden="true" />
          </div>
          <div className="space-y-3">
            <SocialCard initials="FB" color="#1877F2" handle="Odiongan MDRRMO" time="30 mins ago">
              Water level in Odiongan river now at 2.5 meters. Stay alert and monitor updates.
            </SocialCard>
            <SocialCard initials="TW" color="#0B6FA4" handle="@OdionganLGU" time="1 hour ago">
              All rescue teams on standby. Emergency hotline: 042-567-1234
            </SocialCard>
          </div>
        </section>
      </div>
    </div>
  );
}

function SocialCard({
  initials,
  color,
  handle,
  time,
  children,
}: {
  initials: string;
  color: string;
  handle: string;
  time: string;
  children: ReactNode;
}) {
  return (
    <ClayCard radius={20} className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background: color }}
        >
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{handle}</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{time}</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{children}</p>
    </ClayCard>
  );
}
