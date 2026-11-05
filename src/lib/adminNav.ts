import { Activity, Clock, History, MapPin, Radio, Waves, type LucideIcon } from "lucide-react";

/*
 * The admin dashboard tabs: the only place that sets their order and labels.
 * Desktop and mobile share the same tab bar. The first tab opens after the
 * MDRRMO logs in.
 */

export type AdminTabId = "alerts" | "reports" | "quick-reports" | "flood-events" | "overview" | "audit";

export const ADMIN_TABS: ReadonlyArray<{ id: AdminTabId; label: string; icon: LucideIcon }> = [
  { id: "alerts", label: "Create Alert", icon: Radio },
  { id: "reports", label: "Verify Reports", icon: MapPin },
  { id: "quick-reports", label: "Quick Reports", icon: Waves },
  { id: "flood-events", label: "Flood Events", icon: History },
  { id: "overview", label: "Overview", icon: Activity },
  { id: "audit", label: "Audit Trail", icon: Clock },
];

export const MDRRMO_DEFAULT_TAB: AdminTabId = ADMIN_TABS[0].id;

export type BarangayTabId = Extract<AdminTabId, "alerts" | "reports" | "quick-reports">;

const isBarangayTab = (tab: (typeof ADMIN_TABS)[number]): tab is (typeof ADMIN_TABS)[number] & { id: BarangayTabId } =>
  tab.id === "alerts" || tab.id === "reports" || tab.id === "quick-reports";

/** The tabs a barangay admin has, in the same order. */
export const BARANGAY_TABS = ADMIN_TABS.filter(isBarangayTab);
