import { Activity, Clock, Eye, History, MapPin, Radio, Waves, type LucideIcon } from "lucide-react";

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

export type MdrrmoTabId = AdminTabId | "field-observations";

/** Shown after the main tabs, under an "Other" label. */
export const MDRRMO_OTHER_TABS: ReadonlyArray<{ id: MdrrmoTabId; label: string; icon: LucideIcon }> = [
  { id: "field-observations", label: "Field Observations", icon: Eye },
];

type SharedTabId = Extract<AdminTabId, "alerts" | "reports" | "quick-reports">;
export type BarangayTabId = SharedTabId | "field-observations";

const isSharedTab = (tab: (typeof ADMIN_TABS)[number]): tab is (typeof ADMIN_TABS)[number] & { id: SharedTabId } =>
  tab.id === "alerts" || tab.id === "reports" || tab.id === "quick-reports";

/** The shared tabs in the same order, then the barangay-only pages. */
export const BARANGAY_TABS: ReadonlyArray<{ id: BarangayTabId; label: string }> = [
  ...ADMIN_TABS.filter(isSharedTab),
  { id: "field-observations", label: "Field Observations" },
];
