import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { parseRole } from "../../../lib/auth";
import { roleLabel, type Role } from "../../../lib/profile";
import { describeChanges, writeAuditLog } from "../../../lib/audit";
import { ClayButton } from "../clay/Clay";
import { errorText, InlineMessage, type Message } from "../Profile";
import { EmptyNote, ErrorRetry } from "./common";

const PAGE_SIZE = 25;

type UserRow = { id: string; name: string; email: string; role: Role | null; barangay: string | null };

const toUser = (row: Record<string, unknown>): UserRow => ({
  id: String(row.id),
  name: typeof row.name === "string" && row.name.trim() ? row.name : "(no name)",
  email: typeof row.email === "string" ? row.email : "",
  role: parseRole(row.role),
  barangay: typeof row.barangay === "string" && row.barangay.trim() ? row.barangay : null,
});

/** Characters that would break a PostgREST or() filter are dropped from the search text. */
const cleanSearch = (text: string) => text.replace(/[,()*%\\]/g, " ").trim();

const ROLE_OPTIONS: Role[] = ["resident", "barangay", "mdrrmo"];

export function UsersSection({ adminId, adminEmail }: { adminId: string; adminEmail: string }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [barangays, setBarangays] = useState<string[] | null>(null);
  const requestRef = useRef(0);

  // Debounce typing into one query.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(cleanSearch(query)), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const fetchPage = async (from: number) => {
    let request = supabase
      .from("profiles")
      .select("id, name, email, role, barangay")
      .order("name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (search) request = request.or(`name.ilike.*${search}*,email.ilike.*${search}*`);
    const { data, error: fetchError } = await request;
    if (fetchError) throw fetchError;
    return ((data ?? []) as Record<string, unknown>[]).map(toUser);
  };

  useEffect(() => {
    const request = ++requestRef.current;
    setStatus("loading");
    setEditing(null);
    fetchPage(0).then(
      (rows) => {
        if (request !== requestRef.current) return;
        setUsers(rows);
        setHasMore(rows.length === PAGE_SIZE);
        setStatus("ready");
      },
      (err) => {
        console.error("Unable to load users:", err);
        if (request !== requestRef.current) return;
        setError(errorText(err, "Unable to load users."));
        setStatus("error");
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, attempt]);

  const loadMore = async () => {
    const request = requestRef.current;
    setLoadingMore(true);
    try {
      const rows = await fetchPage(users.length);
      if (request !== requestRef.current) return;
      setUsers((current) => [...current, ...rows.filter((r) => !current.some((c) => c.id === r.id))]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      console.error("Unable to load more users:", err);
      setError(errorText(err, "Unable to load more users."));
    } finally {
      setLoadingMore(false);
    }
  };

  // The barangay list loads the first time an edit panel opens.
  useEffect(() => {
    if (!editing || barangays) return;
    let cancelled = false;
    void supabase
      .from("barangays")
      .select("name")
      .order("name")
      .then(({ data, error: barangayError }) => {
        if (cancelled) return;
        if (barangayError) console.error("Unable to load barangays:", barangayError);
        setBarangays(
          ((data as { name: unknown }[] | null) ?? []).map((b) => String(b.name ?? "")).filter(Boolean),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [editing, barangays]);

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search users by name or email</span>
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
        <input
          type="search"
          className="clay-input has-icon-left"
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {status === "loading" ? (
        <p role="status" className="py-2 text-sm" style={{ color: "var(--text-secondary)" }}>Loading users...</p>
      ) : status === "error" ? (
        <ErrorRetry message={error} retry={() => setAttempt((n) => n + 1)} />
      ) : users.length === 0 ? (
        <EmptyNote>{search ? `No users match "${search}".` : "No users yet."}</EmptyNote>
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li key={user.id} className="rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
              <button
                type="button"
                className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
                aria-expanded={editing === user.id}
                onClick={() => setEditing((current) => (current === user.id ? null : user.id))}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {user.name}
                    {user.id === adminId && <span className="font-normal" style={{ color: "var(--text-secondary)" }}> (you)</span>}
                  </span>
                  <span className="block truncate text-xs" style={{ color: "var(--text-secondary)" }}>{user.email}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="risk-badge risk-badge-info is-compact">{user.role ? roleLabel(user.role) : "No role"}</span>
                  {user.barangay && (
                    <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                      <MapPin size={12} aria-hidden="true" />
                      {user.barangay}
                    </span>
                  )}
                </span>
              </button>
              {editing === user.id && (
                <EditUser
                  user={user}
                  isSelf={user.id === adminId}
                  barangays={barangays}
                  adminEmail={adminEmail}
                  onSaved={(next) => setUsers((current) => current.map((u) => (u.id === next.id ? next : u)))}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {status === "ready" && hasMore && (
        <ClayButton variant="secondary" className="w-full" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? "Loading..." : "Load more"}
        </ClayButton>
      )}
    </div>
  );
}

function EditUser({
  user,
  isSelf,
  barangays,
  adminEmail,
  onSaved,
}: {
  user: UserRow;
  isSelf: boolean;
  barangays: string[] | null;
  adminEmail: string;
  onSaved: (user: UserRow) => void;
}) {
  const [role, setRole] = useState<Role | "">(user.role ?? "");
  const [barangay, setBarangay] = useState(user.barangay ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | undefined>();

  const roleChanged = role !== (user.role ?? "");
  const barangayChanged = barangay !== (user.barangay ?? "");
  const needsBarangay = role === "barangay" && !barangay;
  // A saved barangay that is no longer in the list stays selectable.
  const options = barangays && user.barangay && !barangays.includes(user.barangay) ? [user.barangay, ...barangays] : barangays;

  const save = async () => {
    if (!role || needsBarangay || (!roleChanged && !barangayChanged)) return;
    if (isSelf && roleChanged) return;
    if (roleChanged) {
      const question =
        role === "barangay"
          ? `Make ${user.name} a Barangay Admin for ${barangay}?`
          : role === "mdrrmo"
            ? `Make ${user.name} an MDRRMO Admin? They will be able to manage every barangay, user and setting.`
            : `Make ${user.name} a Resident? They will lose admin access.`;
      if (!window.confirm(question)) return;
    }

    setSaving(true);
    setMessage(undefined);
    const nextBarangay = barangay || null;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ role, barangay: nextBarangay })
        .eq("id", user.id)
        .select("id, name, email, role, barangay");
      if (error) throw error;
      if (!data?.length) throw new Error("The database did not save the change (no permission to update this profile).");
      const saved = toUser(data[0] as Record<string, unknown>);
      onSaved(saved);

      const details = `${user.email || user.name}: ${describeChanges(
        { role: user.role, barangay: user.barangay },
        { role: saved.role, barangay: saved.barangay },
      )}`;
      const logError = await writeAuditLog(roleChanged ? "ROLE_CHANGED" : "USER_BARANGAY_CHANGED", adminEmail, details);
      setMessage({
        kind: "ok",
        text: logError ? `Saved, but the audit log entry failed: ${logError}` : "Saved.",
      });
    } catch (err) {
      console.error("Unable to update user:", err);
      setMessage({ kind: "error", text: errorText(err, "Unable to update this user.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 border-t px-3 pb-3 pt-3" style={{ borderColor: "var(--border)" }}>
      <label className="block">
        <span className="clay-label">Role</span>
        <select
          className="clay-input"
          value={role}
          disabled={saving || isSelf}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {!user.role && <option value="">No role</option>}
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{roleLabel(r)}</option>
          ))}
        </select>
        {isSelf && (
          <span className="mt-1 block text-xs" style={{ color: "var(--text-secondary)" }}>
            You can't change your own role. Ask another MDRRMO admin.
          </span>
        )}
      </label>

      <label className="block">
        <span className="clay-label">Barangay</span>
        <select
          className="clay-input"
          value={barangay}
          disabled={saving || !options}
          onChange={(e) => setBarangay(e.target.value)}
          aria-invalid={needsBarangay}
        >
          <option value="">{options ? "No barangay" : "Loading barangays..."}</option>
          {(options ?? []).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {needsBarangay && (
          <span role="alert" className="mt-1 block text-xs" style={{ color: "var(--risk-high)" }}>
            A Barangay Admin must have a barangay.
          </span>
        )}
      </label>

      <ClayButton
        className="w-full"
        onClick={() => void save()}
        disabled={saving || !role || needsBarangay || (!roleChanged && !barangayChanged)}
      >
        {saving ? "Saving..." : "Save user"}
      </ClayButton>
      <InlineMessage message={message} />
    </div>
  );
}
