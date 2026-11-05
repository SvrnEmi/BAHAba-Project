import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Loader, Pencil, Phone, Plus, Save, Trash2 } from "lucide-react";
import { errorMessage } from "../../../lib/barangayAdmin";
import {
  NAME_MAX,
  NAME_MIN,
  ROLE_MAX,
  createContact,
  deleteContact,
  editContact,
  isValidPhone,
  listContacts,
  saveContactOrder,
  telHref,
  type Contact,
  type ContactInput,
} from "../../../lib/barangayContacts";

/*
 * Emergency Contacts for one barangay, or the municipal list when barangay is
 * null. Officials manage their own barangay and see municipal contacts
 * read-only; the MDRRMO manages any list.
 */

const emptyForm = (): ContactInput => ({ name: "", role: "", phone: "" });

type Notice = { kind: "ok" | "error"; text: string };

function NoticeLine({ notice }: { notice: Notice }) {
  return (
    <p
      role={notice.kind === "error" ? "alert" : "status"}
      className="bg-white px-3 py-2 text-sm"
      style={{ color: "var(--text-primary)", borderLeft: `4px solid ${notice.kind === "error" ? "var(--risk-high)" : "var(--risk-low)"}` }}
    >
      {notice.text}
    </p>
  );
}

function ContactDetails({ contact }: { contact: Contact }) {
  return (
    <div className="min-w-0">
      <p className="break-words text-sm font-bold" style={{ color: "var(--text-primary)" }}>{contact.name}</p>
      {contact.role && <p className="break-words text-xs" style={{ color: "var(--text-secondary)" }}>{contact.role}</p>}
      <a href={telHref(contact.phone)} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold" style={{ color: "var(--primary-shade)" }}>
        <Phone size={14} aria-hidden="true" /> {contact.phone}
      </a>
    </div>
  );
}

export function BarangayContacts({ barangay }: { barangay: string }) {
  return <ContactManager barangay={barangay} showMunicipal />;
}

export function ContactManager({ barangay, showMunicipal }: { barangay: string | null; showMunicipal: boolean }) {
  const place = barangay ?? "Odiongan";
  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<ContactInput>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setRows(await listContacts(barangay, showMunicipal));
    } catch (err) {
      setLoadError(errorMessage(err, "Unable to load the contacts."));
    } finally {
      setLoading(false);
    }
  }, [barangay, showMunicipal]);

  useEffect(() => {
    void load();
  }, [load]);

  const own = useMemo(() => rows.filter((r) => r.barangay === barangay), [rows, barangay]);
  const municipal = useMemo(() => rows.filter((r) => r.barangay === null), [rows]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const submit = async () => {
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (name.length < NAME_MIN) {
      setNotice({ kind: "error", text: `Enter a name of at least ${NAME_MIN} characters.` });
      return;
    }
    if (!isValidPhone(phone)) {
      setNotice({ kind: "error", text: "Enter a valid phone number: 7 to 20 characters using digits, +, spaces, dashes or parentheses." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      if (editingId === null) {
        const next = own.reduce((max, r) => Math.max(max, r.sort_order + 1), 0);
        await createContact(barangay, form, next);
      } else {
        await editContact(editingId, form);
      }
      setNotice({ kind: "ok", text: editingId === null ? "Contact added." : "Contact updated." });
      resetForm();
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, "Unable to save the contact.") });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: Contact) => {
    setEditingId(row.id);
    setForm({ name: row.name, role: row.role ?? "", phone: row.phone });
    setNotice(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const remove = async (row: Contact) => {
    if (!window.confirm(`Delete ${row.name}? This cannot be undone.`)) return;
    setBusy(true);
    setNotice(null);
    try {
      await deleteContact(row.id);
      if (editingId === row.id) resetForm();
      setNotice({ kind: "ok", text: "Contact deleted." });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, "Unable to delete the contact.") });
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, offset: -1 | 1) => {
    const next = [...own];
    const [row] = next.splice(index, 1);
    next.splice(index + offset, 0, row);
    setBusy(true);
    setNotice(null);
    try {
      await saveContactOrder(next);
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, "Unable to change the order.") });
    } finally {
      // Also after a failure, so the list shows what was really saved.
      await load();
      setBusy(false);
    }
  };

  const listBody = (content: ReactNode) =>
    loadError ? (
      <div className="space-y-2">
        <NoticeLine notice={{ kind: "error", text: `Could not load the contacts: ${loadError}` }} />
        <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={() => void load()}>Try again</button>
      </div>
    ) : loading ? (
      <div className="clay h-24 animate-pulse" aria-busy="true" />
    ) : (
      content
    );

  return (
    <div className="space-y-6">
      <form
        ref={formRef}
        className="clay space-y-4 p-5"
        aria-labelledby="contact-form-title"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <h3 id="contact-form-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            {editingId === null ? "Emergency Contacts" : "Edit contact"}
          </h3>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>People to call in an emergency in {place}.</p>
        </div>
        <label className="block">
          <span className="clay-label">Name</span>
          <input className="clay-input" value={form.name} maxLength={NAME_MAX} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={saving} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="clay-label">Role (optional)</span>
            <input className="clay-input" value={form.role} maxLength={ROLE_MAX} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={saving} />
          </label>
          <label className="block">
            <span className="clay-label">Phone</span>
            <input className="clay-input" type="tel" value={form.phone} maxLength={20} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={saving} />
          </label>
        </div>
        {notice && <NoticeLine notice={notice} />}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" className="clay-btn clay-btn-primary" disabled={saving}>
            {saving ? <Loader size={18} className="animate-spin" aria-hidden="true" /> : editingId === null ? <Plus size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
            {saving ? "Saving..." : editingId === null ? "Add contact" : "Save changes"}
          </button>
          {editingId !== null && (
            <button type="button" className="clay-btn clay-btn-secondary" onClick={resetForm} disabled={saving}>Cancel</button>
          )}
        </div>
      </form>

      <section aria-labelledby="own-contacts-title" className="space-y-3">
        <h3 id="own-contacts-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          {barangay ?? "Municipal"} contacts ({own.length})
        </h3>
        {listBody(
          own.length === 0 ? (
            <div className="clay p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No contacts for {barangay ?? "the municipality"} yet.</div>
          ) : (
            <ul className="space-y-3">
              {own.map((row, index) => (
                <li key={row.id} id={`contact-${row.id}`} className="clay space-y-2 p-4">
                  <ContactDetails contact={row} />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={busy || index === 0} aria-label={`Move ${row.name} up`} onClick={() => void move(index, -1)}>
                      <ArrowUp size={16} aria-hidden="true" /> Up
                    </button>
                    <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={busy || index === own.length - 1} aria-label={`Move ${row.name} down`} onClick={() => void move(index, 1)}>
                      <ArrowDown size={16} aria-hidden="true" /> Down
                    </button>
                    <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={busy} aria-label={`Edit ${row.name}`} onClick={() => startEdit(row)}>
                      <Pencil size={16} aria-hidden="true" /> Edit
                    </button>
                    <button type="button" className="clay-btn clay-btn-secondary text-sm" disabled={busy} aria-label={`Delete ${row.name}`} onClick={() => void remove(row)}>
                      <Trash2 size={16} aria-hidden="true" /> Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ),
        )}
      </section>

      {showMunicipal && <section aria-labelledby="municipal-contacts-title" className="space-y-3">
        <div>
          <h3 id="municipal-contacts-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Municipal contacts</h3>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Managed by the MDRRMO.</p>
        </div>
        {listBody(
          municipal.length === 0 ? (
            <div className="clay p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No municipal contacts yet.</div>
          ) : (
            <ul className="space-y-3">
              {municipal.map((row) => (
                <li key={row.id} id={`contact-${row.id}`} className="clay p-4"><ContactDetails contact={row} /></li>
              ))}
            </ul>
          ),
        )}
      </section>}
    </div>
  );
}
