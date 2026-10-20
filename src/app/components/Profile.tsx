import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Lock,
  LogOut,
  MapPin,
  Phone,
  User as UserIcon,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { ClayButton, ClayCard } from "./clay/Clay";
import {
  DEFAULT_NOTIFICATION_PREFS,
  initials,
  parseNotificationPrefs,
  roleLabel,
  validateName,
  validatePassword,
  validatePhone,
  type AlertLevelPref,
  type NotificationPrefs,
  type Role,
} from "../../lib/profile";
import { MDRRMO_ODIONGAN_NUMBER, NATIONAL_EMERGENCY_NUMBER, barangayHallNumber } from "../../lib/emergencyContacts";
import { waterLevelLabel } from "../../lib/reports";
import { useLatestMessages } from "../../lib/reportMessages";
import { ReportMessages } from "./ReportMessages";

type ProfileRow = {
  name: string;
  phone: string | null;
  role: Role;
  barangay: string | null;
  notification_prefs?: unknown;
};

type MyReport = {
  id: number;
  location: string | null;
  water_level: string | null;
  description: string | null;
  status: string | null;
  rejection_reason: string | null;
  admin_reply: string | null;
  admin_reply_at: string | null;
  timestamp: string;
};

/** Accordion section ids; also the values for /profile?section=<id>. */
type SectionId = "details" | "barangay" | "reports" | "notifications" | "password";
const SECTION_IDS: SectionId[] = ["details", "barangay", "reports", "notifications", "password"];

export type Message = { kind: "ok" | "error"; text: string };
/** Sections report save results here: shown inline; errors also open the section. */
export type Report = (message: Message) => void;

export const errorText = (err: unknown, fallback: string) =>
  err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
    ? (err as { message: string }).message
    : fallback;

const PROFILE_COLUMNS = "name, email, phone, role, barangay, notification_prefs";

export function Profile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Same source as the route guard: the shared session, restored and kept
  // current by AuthProvider. ProtectedRoute only renders this page once the
  // session and role are confirmed, so no separate auth lookup is needed.
  const { session, role: authRole } = useAuth();
  const user = session?.user ?? null;
  const userId = user?.id ?? null;
  const email = user?.email ?? "";
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [pushOn, setPushOn] = useState(true);
  const [reportCounts, setReportCounts] = useState<{ total: number; pending: number } | null>(null);

  // All collapsed, unless a deep link (/profile?section=reports) asks for one.
  const requested = searchParams.get("section") as SectionId | null;
  const [openSection, setOpenSection] = useState<SectionId | null>(
    requested && SECTION_IDS.includes(requested) ? requested : null,
  );
  const [messages, setMessages] = useState<Partial<Record<SectionId, Message>>>({});

  const reporter = (id: SectionId): Report => (message) => {
    setMessages((m) => ({ ...m, [id]: message }));
    if (message.kind === "error") setOpenSection(id);
  };
  const toggle = (id: SectionId) => setOpenSection((current) => (current === id ? null : id));

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    const load = async () => {
      const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        console.error("Unable to load profile:", error ?? "no profiles row for this user");
        setLoadFailed(true);
      } else {
        const row = data as ProfileRow;
        setProfile(row);
        setPushOn(parseNotificationPrefs(row.notification_prefs).push);
        if (row.role === "resident") {
          // Summary counts only (no rows, no realtime); the list itself
          // loads when "My reports" is first opened.
          const names = [row.name, email].filter(Boolean);
          const count = (pendingOnly: boolean) => {
            let query = supabase
              .from("community_reports")
              .select("id", { count: "exact", head: true })
              .in("user_name", names);
            if (pendingOnly) query = query.eq("status", "pending");
            return query;
          };
          const [all, pending] = await Promise.all([count(false), count(true)]);
          if (!cancelled && !all.error && !pending.error) {
            setReportCounts({ total: all.count ?? 0, pending: pending.count ?? 0 });
          }
        }
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, email, reloadKey]);

  // Signed out while on this page (e.g. from another tab): go to login.
  if (!session) return <Navigate to="/login" replace />;

  // Header data from the session when the profiles row could not be read.
  const meta = user?.user_metadata ?? {};
  const fallbackProfile: ProfileRow = {
    name: String(meta.name ?? "").trim() || email || "Your account",
    phone: null,
    role: authRole ?? "resident",
    barangay: typeof meta.barangay === "string" && meta.barangay.trim() ? meta.barangay.trim() : null,
  };

  const role = profile?.role ?? authRole ?? "resident";
  const isResident = role === "resident";

  return (
    <div className="min-h-screen max-w-md mx-auto bg-background px-[18px] pt-4 pb-10">
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="clay clay-press flex h-11 w-11 items-center justify-center rounded-full"
          style={{ color: "var(--primary-brand)" }}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          Profile
        </h1>
      </div>

      {loading ? (
        <ClayCard className="p-6 text-center">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading your profile...</p>
        </ClayCard>
      ) : loadFailed || !profile || !userId ? (
        <div className="space-y-4">
          <ProfileHeader profile={fallbackProfile} />
          <div role="alert" className="flat-alert" style={{ "--alert-color": "var(--risk-high)" } as CSSProperties}>
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>Could not load your profile.</p>
          </div>
          <ClayButton onClick={() => setReloadKey((k) => k + 1)} className="w-full">
            Retry
          </ClayButton>
          <div className="pt-2">
            <LogoutButton />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ProfileHeader profile={profile} />
          <EmergencyButtons barangay={profile.barangay} />

          <AccordionSection
            id="details"
            icon={UserIcon}
            title="Edit details"
            summary={profile.phone?.trim() || "Add phone"}
            open={openSection === "details"}
            onToggle={toggle}
          >
            <EditDetails
              userId={userId}
              email={email}
              profile={profile}
              message={messages.details}
              report={reporter("details")}
              onSaved={(name, phone) => setProfile((p) => (p ? { ...p, name, phone } : p))}
            />
          </AccordionSection>

          {isResident && (
            <AccordionSection
              id="barangay"
              icon={MapPin}
              title="My barangay"
              summary={profile.barangay ?? "Not set"}
              open={openSection === "barangay"}
              onToggle={toggle}
            >
              <MyBarangay
                userId={userId}
                barangay={profile.barangay}
                message={messages.barangay}
                report={reporter("barangay")}
                onSaved={(barangay) => setProfile((p) => (p ? { ...p, barangay } : p))}
              />
            </AccordionSection>
          )}

          {isResident && (
            <AccordionSection
              id="reports"
              icon={FileText}
              title="My reports"
              summary={
                reportCounts
                  ? `${reportCounts.total} ${reportCounts.total === 1 ? "report" : "reports"}${
                      reportCounts.pending ? ` - ${reportCounts.pending} pending` : ""
                    }`
                  : undefined
              }
              open={openSection === "reports"}
              onToggle={toggle}
            >
              <MyReports
                userId={userId}
                name={profile.name}
                email={email}
                active={openSection === "reports"}
                onLoaded={(reports) =>
                  setReportCounts({
                    total: reports.length,
                    pending: reports.filter((r) => (r.status ?? "pending") === "pending").length,
                  })
                }
              />
            </AccordionSection>
          )}

          <AccordionSection
            id="notifications"
            icon={Bell}
            title="Notification settings"
            summary={pushOn ? "Push on" : "Push off"}
            open={openSection === "notifications"}
            onToggle={toggle}
          >
            <NotificationSettings
              userId={userId}
              initial={parseNotificationPrefs(profile.notification_prefs)}
              message={messages.notifications}
              report={reporter("notifications")}
              onSaved={(prefs) => setPushOn(prefs.push)}
            />
          </AccordionSection>

          <AccordionSection
            id="password"
            icon={Lock}
            title="Change password"
            open={openSection === "password"}
            onToggle={toggle}
          >
            <ChangePassword message={messages.password} report={reporter("password")} />
          </AccordionSection>

          <div className="pt-2">
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible clay card. The body stays mounted while collapsed (so unsaved
 * input survives) but is made inert, so it cannot be focused or read.
 */
export function AccordionSection<Id extends string>({
  id,
  icon: Icon,
  title,
  summary,
  open,
  onToggle,
  idPrefix = "profile",
  children,
}: {
  id: Id;
  icon: LucideIcon;
  title: string;
  summary?: string;
  open: boolean;
  onToggle: (id: Id) => void;
  /** Prefix for the header/panel element ids. */
  idPrefix?: string;
  children: ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // React 18 has no `inert` prop; set the DOM property directly.
    if (bodyRef.current) bodyRef.current.inert = !open;
  }, [open]);

  const headerId = `${idPrefix}-${id}-header`;
  const panelId = `${idPrefix}-${id}-panel`;
  return (
    <ClayCard className="overflow-hidden" radius={22}>
      <h2>
        <button
          type="button"
          id={headerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(id)}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
        >
          <Icon size={20} className="shrink-0" style={{ color: "var(--primary-brand)" }} aria-hidden="true" />
          <span className="shrink-0 text-base font-bold" style={{ color: "var(--text-primary)" }}>
            {title}
          </span>
          <span className="ml-auto min-w-0 truncate text-right text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {summary}
          </span>
          <ChevronDown
            size={20}
            aria-hidden="true"
            className="shrink-0 transition-transform duration-200 motion-reduce:transition-none"
            style={{ color: "var(--text-secondary)", transform: open ? "rotate(180deg)" : "none" }}
          />
        </button>
      </h2>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div ref={bodyRef} className="min-h-0 overflow-hidden" aria-hidden={!open}>
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </ClayCard>
  );
}

export function InlineMessage({ message }: { message?: Message }) {
  if (!message) return null;
  return (
    <p
      role={message.kind === "error" ? "alert" : "status"}
      className="mt-3 bg-white px-3 py-2 text-sm"
      style={{
        color: "var(--text-primary)",
        borderLeft: `4px solid ${message.kind === "error" ? "var(--risk-high)" : "var(--risk-low)"}`,
      }}
    >
      {message.text}
    </p>
  );
}

export function FieldError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mt-1 text-xs font-medium" style={{ color: "var(--risk-high)" }}>
      {text}
    </p>
  );
}

function ProfileHeader({ profile }: { profile: ProfileRow }) {
  return (
    <ClayCard className="flex items-center gap-4 p-4">
      <span
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold"
        style={{ background: "var(--lavender)", color: "var(--lavender-icon)", fontFamily: "var(--font-heading)" }}
        aria-hidden="true"
      >
        {initials(profile.name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          {profile.name}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="risk-badge risk-badge-info is-compact">{roleLabel(profile.role)}</span>
          {profile.barangay && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              <MapPin size={12} aria-hidden="true" />
              {profile.barangay}
            </span>
          )}
        </div>
      </div>
    </ClayCard>
  );
}

/** Always visible, one tap away. A hotline without a configured number is shown disabled. */
function EmergencyButtons({ barangay }: { barangay: string | null }) {
  const hall = barangayHallNumber(barangay);
  const buttons = [
    { label: "Call MDRRMO Odiongan", number: MDRRMO_ODIONGAN_NUMBER, primary: true },
    { label: "Call 911", number: NATIONAL_EMERGENCY_NUMBER, primary: true },
    // Barangay Hall appears only once a real number is configured.
    ...(hall ? [{ label: `Call Barangay ${barangay} Hall`, number: hall, primary: false }] : []),
  ];
  return (
    // Full-width rows so the labels never truncate on small phones.
    <div className="grid grid-cols-1 gap-2.5">
      {buttons.map((b) =>
        b.number ? (
          <a
            key={b.label}
            href={`tel:${b.number}`}
            aria-label={`${b.label} at ${b.number}`}
            className={`clay-btn ${b.primary ? "clay-btn-primary" : "clay-btn-secondary"}`}
          >
            <Phone size={18} aria-hidden="true" />
            <span className="truncate">{b.label}</span>
          </a>
        ) : (
          <button key={b.label} type="button" disabled className="clay-btn clay-btn-secondary" title="Hotline not set yet">
            <Phone size={18} aria-hidden="true" />
            <span className="truncate">{b.label}</span>
          </button>
        ),
      )}
      {!MDRRMO_ODIONGAN_NUMBER && (
        <p className="-mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          MDRRMO hotline not set yet.
        </p>
      )}
    </div>
  );
}

function EditDetails({
  userId,
  email,
  profile,
  message,
  report,
  onSaved,
}: {
  userId: string;
  email: string;
  profile: ProfileRow;
  message?: Message;
  report: Report;
  onSaved: (name: string, phone: string) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [errors, setErrors] = useState<{ name: string | null; phone: string | null }>({ name: null, phone: null });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next = { name: validateName(name), phone: validatePhone(phone) };
    setErrors(next);
    if (next.name || next.phone) return;
    setSaving(true);
    try {
      // Only name and phone: never role or email.
      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim(), phone: phone.trim() })
        .eq("id", userId);
      if (error) throw error;
      onSaved(name.trim(), phone.trim());
      report({ kind: "ok", text: "Your details were saved." });
    } catch (err) {
      report({ kind: "error", text: errorText(err, "Unable to save your details.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="clay-label">Name</span>
        <input className="clay-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <FieldError text={errors.name} />
      </label>
      <label className="block">
        <span className="clay-label">Phone</span>
        <input
          className="clay-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="09XXXXXXXXX"
        />
        <FieldError text={errors.phone} />
      </label>
      <label className="block">
        <span className="clay-label">Email (cannot be changed here)</span>
        <input className="clay-input opacity-70" value={email} readOnly aria-readonly="true" />
      </label>
      <ClayButton className="w-full" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving..." : "Save details"}
      </ClayButton>
      <InlineMessage message={message} />
    </div>
  );
}

function MyBarangay({
  userId,
  barangay,
  message,
  report,
  onSaved,
}: {
  userId: string;
  barangay: string | null;
  message?: Message;
  report: Report;
  onSaved: (barangay: string) => void;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("barangays")
      .select("name")
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) report({ kind: "error", text: "Unable to load the barangay list." });
        else setOptions(((data as { name: string }[]) ?? []).map((b) => b.name));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = async (next: string) => {
    if (!next || next === barangay) return;
    const ok = window.confirm("Changing your barangay changes which alerts and flood levels you see. Continue?");
    if (!ok) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ barangay: next }).eq("id", userId);
      if (error) throw error;
      onSaved(next);
      report({ kind: "ok", text: `Your barangay is now ${next}.` });
    } catch (err) {
      report({ kind: "error", text: errorText(err, "Unable to change your barangay.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="block">
        <span className="clay-label">Barangay</span>
        <select
          className="clay-input"
          value={barangay ?? ""}
          disabled={saving || options.length === 0}
          onChange={(e) => void change(e.target.value)}
        >
          {!barangay && <option value="">Select your barangay</option>}
          {barangay && !options.includes(barangay) && <option value={barangay}>{barangay}</option>}
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <InlineMessage message={message} />
    </div>
  );
}

export function ChangePassword({ message, report }: { message?: Message; report: Report }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const invalid = validatePassword(password, confirm);
    setError(invalid);
    if (invalid) return;
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirm("");
      report({ kind: "ok", text: "Your password was changed." });
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      const text = errorText(err, "Unable to change your password.");
      if (code === "reauthentication_needed" || /reauthenticat/i.test(text)) {
        report({ kind: "error", text: "For your security, please log out and log in again, then change your password." });
      } else if (code === "same_password") {
        report({ kind: "error", text: "Your new password must be different from your current one." });
      } else {
        report({ kind: "error", text });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="clay-label">New password</span>
        <input
          type="password"
          className="clay-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      <label className="block">
        <span className="clay-label">Confirm new password</span>
        <input
          type="password"
          className="clay-input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        <FieldError text={error} />
      </label>
      <ClayButton variant="secondary" className="w-full" onClick={() => void save()} disabled={saving}>
        {saving ? "Updating..." : "Update password"}
      </ClayButton>
      <InlineMessage message={message} />
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  approved: { label: "Approved", className: "risk-badge-low", icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "risk-badge-high", icon: XCircle },
  pending: { label: "Pending", className: "risk-badge-medium", icon: Clock },
};

/** Loads only once the section is first opened (`active`). One-shot read, no realtime. */
function MyReports({
  userId,
  name,
  email,
  active,
  onLoaded,
}: {
  userId: string | null;
  name: string;
  email: string;
  active: boolean;
  onLoaded: (reports: MyReport[]) => void;
}) {
  const [requested, setRequested] = useState(false);
  const [reports, setReports] = useState<MyReport[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { latest, update: updateLatest } = useLatestMessages(reports?.map((r) => r.id) ?? []);

  useEffect(() => {
    if (active) setRequested(true);
  }, [active]);

  useEffect(() => {
    if (!requested) return;
    let cancelled = false;
    // Reports are stored under the profile name (or email as a fallback).
    const names = [name, email].filter(Boolean);
    void supabase
      .from("community_reports")
      .select("id, location, water_level, description, status, rejection_reason, admin_reply, admin_reply_at, timestamp")
      .in("user_name", names)
      .order("timestamp", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setFailed(true);
          return;
        }
        const rows = (data as MyReport[]) ?? [];
        setReports(rows);
        onLoaded(rows);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, name, email]);

  if (failed) {
    return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Unable to load your reports right now.</p>;
  }
  if (reports === null) {
    return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Loading your reports...</p>;
  }
  if (reports.length === 0) {
    return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>You have not submitted any reports yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {reports.map((report) => {
        const badge = STATUS_BADGE[report.status ?? "pending"] ?? STATUS_BADGE.pending;
        const BadgeIcon = badge.icon;
        return (
          <li key={report.id} className="rounded-2xl border bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {waterLevelLabel(report.water_level)} - {report.location ?? "Unknown location"}
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {new Date(report.timestamp).toLocaleString()}
                </p>
              </div>
              <span className={`risk-badge is-compact ${badge.className}`}>
                <BadgeIcon size={12} aria-hidden="true" />
                {badge.label}
              </span>
            </div>
            {report.status === "rejected" && report.rejection_reason?.trim() && (
              <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                Reason: {report.rejection_reason}
              </p>
            )}
            <ReportMessages
              reportId={report.id}
              viewerRole="resident"
              userId={userId}
              latest={latest[report.id]}
              onLatest={updateLatest}
              legacyReply={{ body: report.admin_reply, at: report.admin_reply_at }}
            />
          </li>
        );
      })}
    </ul>
  );
}

const LEVELS: Array<{ id: AlertLevelPref; label: string }> = [
  { id: "advisory", label: "Advisory" },
  { id: "warning", label: "Warning" },
  { id: "critical", label: "Critical" },
];

function NotificationSettings({
  userId,
  initial,
  message,
  report,
  onSaved,
}: {
  userId: string;
  initial: NotificationPrefs;
  message?: Message;
  report: Report;
  onSaved: (prefs: NotificationPrefs) => void;
}) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial ?? DEFAULT_NOTIFICATION_PREFS);
  const [saving, setSaving] = useState(false);

  const toggleLevel = (level: AlertLevelPref) => {
    if (level === "critical") return; // Always on.
    setPrefs((p) => ({
      ...p,
      levels: p.levels.includes(level) ? p.levels.filter((l) => l !== level) : [...p.levels, level],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const value: NotificationPrefs = {
        push: prefs.push,
        levels: LEVELS.map((l) => l.id).filter((id) => id === "critical" || prefs.levels.includes(id)),
      };
      const { error } = await supabase.from("profiles").update({ notification_prefs: value }).eq("id", userId);
      if (error) throw error;
      onSaved(value);
      report({ kind: "ok", text: "Notification settings saved." });
    } catch (err) {
      report({ kind: "error", text: errorText(err, "Unable to save notification settings.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label className="flex min-h-12 items-center justify-between gap-3">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Push notifications</span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={prefs.push}
          checked={prefs.push}
          onChange={(e) => setPrefs((p) => ({ ...p, push: e.target.checked }))}
          className="h-5 w-5"
        />
      </label>
      <fieldset className="mt-1">
        <legend className="clay-label">Alert levels</legend>
        {LEVELS.map((level) => {
          const locked = level.id === "critical";
          return (
            <label key={level.id} className="flex min-h-11 items-center gap-3 text-sm" style={{ color: "var(--text-primary)" }}>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={locked || prefs.levels.includes(level.id)}
                disabled={locked}
                onChange={() => toggleLevel(level.id)}
              />
              {level.label}
              {locked && (
                <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <Lock size={12} aria-hidden="true" /> Always on
                </span>
              )}
            </label>
          );
        })}
      </fieldset>
      <ClayButton variant="secondary" className="mt-2 w-full" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving..." : "Save notification settings"}
      </ClayButton>
      <InlineMessage message={message} />
    </div>
  );
}

export function LogoutButton() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    if (!window.confirm("Log out of BAHAba?")) return;
    setBusy(true);
    // Clears the session, role and realtime channels; never blocks on a failed request.
    await signOut();
    navigate("/login", { replace: true });
  };
  return (
    <button type="button" onClick={() => void logout()} disabled={busy} className="clay-btn clay-btn-danger w-full">
      <LogOut size={18} aria-hidden="true" />
      {busy ? "Logging out..." : "Log out"}
    </button>
  );
}
