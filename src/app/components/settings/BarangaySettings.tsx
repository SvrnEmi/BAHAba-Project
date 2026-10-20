import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Bell, CloudRain, Eye, EyeOff, User as UserIcon, type LucideIcon } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../lib/auth";
import { validateName, validatePhone } from "../../../lib/profile";
import { readBrowserNotifications, writeBrowserNotifications } from "../../../lib/barangayAdmin";
import { ClayButton } from "../clay/Clay";
import { AccordionSection, FieldError, InlineMessage, LogoutButton, errorText, type Message } from "../Profile";
import { LoadGate, SwitchRow, num, useSectionLoad } from "./common";

type SectionId = "account" | "notifications" | "automatic";

/**
 * Barangay admin settings (route guarded to the barangay role), same layout
 * as the MDRRMO Settings: one section open at a time, content mounts the
 * first time it is opened. No user management or demo tools here.
 */
export function BarangaySettings() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<SectionId | null>(null);
  const [opened, setOpened] = useState<Set<SectionId>>(() => new Set());

  const toggle = (id: SectionId) => {
    setOpen((current) => (current === id ? null : id));
    setOpened((current) => (current.has(id) ? current : new Set(current).add(id)));
  };

  const section = (id: SectionId, icon: LucideIcon, title: string, summary: string, content: () => ReactNode) => (
    <AccordionSection id={id} idPrefix="barangay-settings" icon={icon} title={title} summary={summary} open={open === id} onToggle={toggle}>
      {opened.has(id) ? content() : null}
    </AccordionSection>
  );

  return (
    <div className="min-h-screen bg-background px-[18px] pt-4 pb-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/admin/barangay")}
            aria-label="Back to dashboard"
            className="clay clay-press flex h-11 w-11 items-center justify-center rounded-full"
            style={{ color: "var(--primary-brand)" }}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Settings</h1>
        </div>

        <div className="space-y-4">
          {section("account", UserIcon, "Account", "Details, password", () => <AccountSection />)}
          {section("notifications", Bell, "Notifications", "This browser", () => <NotificationsSection />)}
          {section("automatic", CloudRain, "How the automatic level works", "Read-only", () => <AutomaticSection />)}
        </div>
      </div>
    </div>
  );
}

function AccountSection() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const email = session?.user.email ?? "";
  const { state, retry } = useSectionLoad(async () => {
    const { data, error } = await supabase.from("profiles").select("name, phone, barangay").eq("id", userId).maybeSingle();
    if (error) throw error;
    return { name: String(data?.name ?? ""), phone: String(data?.phone ?? ""), barangay: typeof data?.barangay === "string" ? data.barangay : null };
  });

  return (
    <LoadGate state={state} retry={retry} loadingText="Loading your account...">
      {(profile) => (
        <div className="space-y-6">
          <DetailsForm userId={userId} email={email} initial={profile} />
          <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-primary)" }}>Change password</h3>
            <PasswordForm email={email} />
          </div>
          <LogoutButton />
        </div>
      )}
    </LoadGate>
  );
}

function DetailsForm({ userId, email, initial }: { userId: string; email: string; initial: { name: string; phone: string; barangay: string | null } }) {
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [errors, setErrors] = useState<{ name: string | null; phone: string | null }>({ name: null, phone: null });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | undefined>();

  const save = async () => {
    if (saving) return;
    const next = { name: validateName(name), phone: phone.trim() ? validatePhone(phone) : null };
    setErrors(next);
    if (next.name || next.phone) return;
    setSaving(true);
    setMessage(undefined);
    try {
      // Only name and phone: never role, barangay or email.
      const { error } = await supabase.from("profiles").update({ name: name.trim(), phone: phone.trim() || null }).eq("id", userId);
      if (error) throw error;
      setMessage({ kind: "ok", text: "Your details were saved." });
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err, "Unable to save your details.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="clay-label">Name</span>
        <input className="clay-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" disabled={saving} />
        <FieldError text={errors.name} />
      </label>
      <label className="block">
        <span className="clay-label">Email (cannot be changed here)</span>
        <input className="clay-input opacity-70" value={email} readOnly aria-readonly="true" />
      </label>
      <label className="block">
        <span className="clay-label">Phone</span>
        <input className="clay-input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="09XXXXXXXXX" disabled={saving} />
        <FieldError text={errors.phone} />
      </label>
      {initial.barangay && (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Barangay: {initial.barangay} (set by MDRRMO)</p>
      )}
      <ClayButton className="w-full" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving..." : "Save details"}
      </ClayButton>
      <InlineMessage message={message} />
    </div>
  );
}

const MIN_PASSWORD = 10;

function PasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | undefined>();

  const save = async () => {
    if (saving) return;
    const invalid = !current
      ? "Please enter your current password."
      : password.length < MIN_PASSWORD
        ? `New password must be at least ${MIN_PASSWORD} characters.`
        : password !== confirm
          ? "New passwords do not match."
          : password === current
            ? "Your new password must be different from your current one."
            : null;
    setError(invalid);
    if (invalid) return;
    if (!email) {
      setMessage({ kind: "error", text: "Your account has no email, so the password cannot be changed here." });
      return;
    }
    setSaving(true);
    setMessage(undefined);
    try {
      // Re-authenticate with the current password first.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (signInError) {
        setError("Your current password is incorrect.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setCurrent("");
      setPassword("");
      setConfirm("");
      setMessage({ kind: "ok", text: "Your password was changed." });
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err, "Unable to change your password.") });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <label className="block">
      <span className="clay-label">{label}</span>
      <input
        type={show ? "text" : "password"}
        className="clay-input"
        value={value}
        onChange={(e) => set(e.target.value)}
        autoComplete={autoComplete}
        disabled={saving}
      />
    </label>
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {field("Current password", current, setCurrent, "current-password")}
      {field(`New password (at least ${MIN_PASSWORD} characters)`, password, setPassword, "new-password")}
      {field("Confirm new password", confirm, setConfirm, "new-password")}
      <FieldError text={error} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-pressed={show}
        className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold"
        style={{ color: "var(--primary-shade)" }}
      >
        {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        {show ? "Hide passwords" : "Show passwords"}
      </button>
      <ClayButton type="submit" variant="secondary" className="w-full" disabled={saving}>
        {saving ? "Updating..." : "Update password"}
      </ClayButton>
      <InlineMessage message={message} />
    </form>
  );
}

function NotificationsSection() {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const [on, setOn] = useState(() => supported && readBrowserNotifications() && Notification.permission === "granted");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | undefined>();

  const change = async (next: boolean) => {
    setMessage(undefined);
    if (!next) {
      setOn(false);
      writeBrowserNotifications(false);
      return;
    }
    if (!supported) {
      setMessage({ kind: "error", text: "This browser does not support notifications." });
      return;
    }
    setBusy(true);
    try {
      // Ask for permission only now, when the admin turns this on.
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission === "granted") {
        setOn(true);
        writeBrowserNotifications(true);
        setMessage({ kind: "ok", text: "Browser notifications are on for this browser." });
      } else {
        setOn(false);
        writeBrowserNotifications(false);
        setMessage({ kind: "error", text: "Notifications are blocked. Allow them for this site in your browser settings, then try again." });
      }
    } catch (err) {
      setMessage({ kind: "error", text: errorText(err, "Unable to turn on notifications.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SwitchRow
        label="Browser notifications"
        hint="When a new report or Quick Report arrives for your barangay while the dashboard is open."
        checked={on}
        disabled={busy}
        onChange={(v) => void change(v)}
      />
      <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>Saved on this browser only.</p>
      <InlineMessage message={message} />
    </div>
  );
}

function AutomaticSection() {
  const { state, retry } = useSectionLoad(async () => {
    const { data, error } = await supabase
      .from("risk_settings")
      .select("auto_enabled, medium_mm_3h, high_mm_3h, medium_mm_24h, high_mm_24h, override_hours, holddown_hours")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The automatic level settings are not available.");
    const row = data as Record<string, unknown>;
    return {
      autoEnabled: row.auto_enabled === true,
      medium3: num(row.medium_mm_3h, 30),
      high3: num(row.high_mm_3h, 60),
      medium24: num(row.medium_mm_24h, 50),
      high24: num(row.high_mm_24h, 100),
      overrideHours: num(row.override_hours, 6),
      holddownHours: num(row.holddown_hours, 3),
    };
  });

  const hrs = (n: number) => `${n} ${n === 1 ? "hour" : "hours"}`;

  return (
    <LoadGate state={state} retry={retry} loadingText="Loading the rules...">
      {(s) => (
        <div className="space-y-3 text-sm" style={{ color: "var(--text-primary)" }}>
          <p>
            Automatic updates are <strong>{s.autoEnabled ? "on" : "off"}</strong>. Every 30 minutes BAHAba reads the Open-Meteo rainfall
            forecast for your barangay and sets the flood level:
          </p>
          <ul className="space-y-2">
            <li className="flex flex-wrap items-center gap-2">
              <span className="risk-badge risk-badge-high is-compact">High risk</span>
              {s.high3} mm or more in 3 hours, or {s.high24} mm or more in 24 hours
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span className="risk-badge risk-badge-medium is-compact">Medium risk</span>
              {s.medium3} mm or more in 3 hours, or {s.medium24} mm or more in 24 hours
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span className="risk-badge risk-badge-low is-compact">Low risk</span>
              Less rain than that
            </li>
          </ul>
          <p>
            When you set the level yourself, it overrides the automatic level for {hrs(s.overrideHours)}. After that, or when you press
            "Return to automatic", the forecast takes over again.
          </p>
          <p>Once the level goes up, it stays up for at least {hrs(s.holddownHours)} so it does not flicker between levels.</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Forecasts are estimates, not guarantees. Only MDRRMO can change these rules.
          </p>
        </div>
      )}
    </LoadGate>
  );
}
