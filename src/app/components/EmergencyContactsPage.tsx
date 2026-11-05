import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Phone } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { errorMessage } from "../../lib/barangayAdmin";
import { listContacts, telHref, type Contact } from "../../lib/barangayContacts";
import { useBarangayNames } from "../../lib/barangays";
import { useResidentBarangay } from "../../lib/residentAlerts";
import { STRINGS } from "../../lib/strings";
import { ScreenHeader } from "./clay/Clay";

const T = STRINGS.contacts;

function ContactList({ title, rows }: { title: string; rows: Contact[] }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h2 className="break-words text-base font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="clay p-4">
            <p className="break-words text-sm font-bold" style={{ color: "var(--text-primary)" }}>{row.name}</p>
            {row.role && <p className="break-words text-[13px]" style={{ color: "var(--text-secondary)" }}>{row.role}</p>}
            <a
              href={telHref(row.phone)}
              aria-label={T.call(row.name, row.phone)}
              className="mt-1 inline-flex min-h-12 items-center gap-2 break-all text-base font-bold"
              style={{ color: "var(--primary-shade)" }}
            >
              <Phone size={18} className="shrink-0" aria-hidden="true" /> {row.phone}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Municipal contacts first, then one barangay's. Residents see their own
 * barangay; guests pick one. Contacts come only from the database.
 */
export function EmergencyContactsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const guest = userId === null;
  const residentBarangay = useResidentBarangay(userId);
  const barangays = useBarangayNames(guest);
  const [picked, setPicked] = useState("");
  const barangay = guest ? picked : residentBarangay ?? "";

  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listContacts(barangay || null, Boolean(barangay)));
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Unknown error"));
    } finally {
      setLoading(false);
    }
  }, [barangay]);

  useEffect(() => {
    void load();
  }, [load]);

  const municipal = useMemo(() => rows.filter((r) => r.barangay === null), [rows]);
  const local = useMemo(() => rows.filter((r) => r.barangay !== null), [rows]);

  return (
    <div className="min-h-full bg-background">
      {guest && (
        <div className="px-[18px] pt-4">
          <button type="button" onClick={() => navigate("/")} aria-label={STRINGS.guest.back} className="clay clay-press flex h-11 w-11 items-center justify-center rounded-full" style={{ color: "var(--primary-brand)" }}>
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        </div>
      )}
      <ScreenHeader title={T.title} subtitle={T.subtitle} icon={Phone} pastel="peach" />
      <div className="mx-auto max-w-md space-y-4 px-[18px] pt-2 pb-6">
        {guest && (
          <label className="block">
            <span className="clay-label">{STRINGS.guest.pickBarangay}</span>
            <select className="clay-input" value={picked} onChange={(e) => setPicked(e.target.value)}>
              <option value="">{STRINGS.guest.municipalOnly}</option>
              {barangays.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        {error ? (
          <div className="space-y-2">
            <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ color: "var(--text-primary)", borderLeft: "4px solid var(--risk-high)" }}>{T.loadFailed} {error}</p>
            <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={() => void load()}>{T.retry}</button>
          </div>
        ) : loading && rows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{T.checking}</p>
        ) : rows.length === 0 ? (
          <div className="clay p-6 text-center text-sm" style={{ color: "var(--text-primary)" }}>
            {T.emptyLead}
            <a href={`tel:${T.hotline.tel}`} className="whitespace-nowrap font-bold" style={{ color: "var(--primary-shade)" }}>{T.hotline.label}</a>
            {T.emptyEnd}
          </div>
        ) : (
          <>
            {municipal.length > 0 && <ContactList title={T.municipal} rows={municipal} />}
            {local.length > 0 && <ContactList title={T.barangay(barangay)} rows={local} />}
          </>
        )}
      </div>
    </div>
  );
}
