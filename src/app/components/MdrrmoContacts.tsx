import { useState } from "react";
import { useBarangayNames } from "../../lib/barangays";
import { ContactManager } from "./barangay/BarangayContacts";

const MUNICIPAL = "";

/* MDRRMO: municipal contacts, or the contacts of any one barangay. */
export function MdrrmoContacts() {
  const barangays = useBarangayNames();
  const [scope, setScope] = useState(MUNICIPAL);

  return (
    <div className="space-y-4">
      <label className="block max-w-sm">
        <span className="clay-label">Show contacts for</span>
        <select className="clay-input" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value={MUNICIPAL}>Municipal</option>
          {barangays.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      {/* The key clears any half-filled form when the list changes. */}
      <ContactManager key={scope} barangay={scope === MUNICIPAL ? null : scope} showMunicipal={false} />
    </div>
  );
}
