import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/*
 * Small (i) button that opens a one or two sentence description of a card's
 * number. Radix handles tap/click, Escape, focus return and edge collisions;
 * the width is capped so it never overflows a 360 px screen.
 */
export function InfoTip({ label, children }: { label: string; children: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: "var(--text-secondary)", outlineColor: "var(--primary-brand)" }}
        >
          <Info size={16} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        collisionPadding={16}
        className="w-[min(18rem,calc(100vw-32px))] rounded-2xl bg-white p-3 text-[13px] font-normal leading-snug"
        style={{ color: "var(--text-primary)" }}
      >
        <p className="mb-1 text-xs font-bold" style={{ color: "var(--text-primary)" }}>{label}</p>
        <p style={{ color: "var(--text-secondary)" }}>{children}</p>
      </PopoverContent>
    </Popover>
  );
}

/** Descriptions for the rainfall tiles shared by the MDRRMO and barangay forecast panels. */
export const RAIN_TILE_INFO: Record<string, string> = {
  "Past 24 h": "Rain that fell in the last 24 hours, as estimated by the Open-Meteo weather model (not a rain gauge).",
  "Next 3 h": "The most rain expected in any 3 hours in a row (the worst 3-hour burst) from the Open-Meteo forecast.",
  "Next 24 h": "All the rain the Open-Meteo forecast expects in the next 24 hours. Used with the 3-hour burst to set the level.",
  Peak: "The heaviest hourly rain rate in the forecast and roughly when it is expected.",
  "Peak rate": "The heaviest hourly rain rate in the forecast across barangays, and roughly when it is expected.",
  "Highest rain chance (24 h)": "The highest chance of rain in any hour of the next 24 hours, from the Open-Meteo forecast.",
};
