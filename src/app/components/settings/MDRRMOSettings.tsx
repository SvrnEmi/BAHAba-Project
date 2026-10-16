import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Bell, CloudRain, Lock, Users, Wrench, type LucideIcon } from "lucide-react";
import { Toaster } from "sonner";
import { useAuth } from "../../../lib/auth";
import { AccordionSection } from "../Profile";
import { AutomationSection } from "./AutomationSection";
import { UsersSection } from "./UsersSection";
import { AccountSection, NotificationsSection } from "./NotificationsAccountSections";
import { SystemSection } from "./SystemSection";

type SectionId = "automation" | "users" | "notifications" | "account" | "system";

/**
 * MDRRMO settings (route guarded to the mdrrmo role). One section open at a
 * time, all collapsed at first. A section's content mounts the first time it
 * is opened, so its data loads lazily, and stays mounted afterwards so
 * unsaved edits survive collapsing. No realtime channels are opened here.
 */
export function MDRRMOSettings() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const adminId = session?.user.id ?? "";
  const adminEmail = session?.user.email ?? "MDRRMO Admin";
  const [open, setOpen] = useState<SectionId | null>(null);
  const [opened, setOpened] = useState<Set<SectionId>>(() => new Set());

  const toggle = (id: SectionId) => {
    setOpen((current) => (current === id ? null : id));
    setOpened((current) => (current.has(id) ? current : new Set(current).add(id)));
  };

  const section = (id: SectionId, icon: LucideIcon, title: string, summary: string, content: () => ReactNode) => (
    <AccordionSection id={id} idPrefix="settings" icon={icon} title={title} summary={summary} open={open === id} onToggle={toggle}>
      {opened.has(id) ? content() : null}
    </AccordionSection>
  );

  return (
    <div className="min-h-screen bg-background px-[18px] pt-4 pb-10">
      <Toaster position="top-center" richColors />
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/admin/mdrrmo")}
            aria-label="Back to dashboard"
            className="clay clay-press flex h-11 w-11 items-center justify-center rounded-full"
            style={{ color: "var(--primary-brand)" }}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            Settings
          </h1>
        </div>

        <div className="space-y-4">
          {section("automation", CloudRain, "Automation and risk rules", "Thresholds", () => (
            <AutomationSection adminEmail={adminEmail} />
          ))}
          {section("users", Users, "Users and roles", "Roles", () => (
            <UsersSection adminId={adminId} adminEmail={adminEmail} />
          ))}
          {section("notifications", Bell, "Notifications for admins", "This browser", () => <NotificationsSection />)}
          {section("account", Lock, "Account", "Password", () => <AccountSection />)}
          {section("system", Wrench, "System and demo tools", "Forecast", () => <SystemSection adminEmail={adminEmail} />)}
        </div>
      </div>
    </div>
  );
}
