import { useNavigate } from "react-router";
import { ArrowLeft, History } from "lucide-react";
import { ScreenHeader } from "./clay/Clay";
import { BahaHistoryMap } from "./BahaHistoryMap";

/** Resident page for the Baha History map, opened from the hazard map. */
export function BahaHistory() {
  const navigate = useNavigate();
  return (
    <div className="min-h-full max-w-md mx-auto bg-background pb-6">
      <div className="flex items-center pl-2">
        <button
          type="button"
          onClick={() => navigate("/map")}
          aria-label="Back to hazard map"
          className="flex h-12 w-12 shrink-0 items-center justify-center"
        >
          <ArrowLeft size={22} style={{ color: "var(--text-primary)" }} aria-hidden="true" />
        </button>
        <ScreenHeader title="Baha History" subtitle="Where flooding was verified" icon={History} pastel="mint" />
      </div>
      <div className="px-[18px]">
        <BahaHistoryMap />
      </div>
    </div>
  );
}
