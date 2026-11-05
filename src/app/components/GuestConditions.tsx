import { useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Eye } from "lucide-react";
import { useBarangayNames } from "../../lib/barangays";
import { STRINGS } from "../../lib/strings";
import { ScreenHeader } from "./clay/Clay";
import { GroundReportsCard } from "./GroundReportsCard";

const T = STRINGS.guest;

/** Public: the "Reported on the ground" card for any barangay the guest picks. */
export function GuestConditions() {
  const navigate = useNavigate();
  const barangays = useBarangayNames();
  const [barangay, setBarangay] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <div className="px-[18px] pt-4">
        <button type="button" onClick={() => navigate("/")} aria-label={T.back} className="clay clay-press flex h-11 w-11 items-center justify-center rounded-full" style={{ color: "var(--primary-brand)" }}>
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
      </div>
      <ScreenHeader title={T.conditionsTitle} subtitle={T.conditionsSubtitle} icon={Eye} pastel="mint" />
      <div className="mx-auto max-w-md space-y-4 px-[18px] pt-2 pb-6">
        <label className="block">
          <span className="clay-label">{T.pickBarangay}</span>
          <select className="clay-input" value={barangay} onChange={(e) => setBarangay(e.target.value)}>
            <option value="">{T.choose}</option>
            {barangays.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <GroundReportsCard barangay={barangay || null} />
      </div>
    </div>
  );
}
