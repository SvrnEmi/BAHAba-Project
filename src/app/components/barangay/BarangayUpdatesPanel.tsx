import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { relativeTime } from "../../../lib/barangayAdmin";

/*
 * Barangay "Recent updates" feed, same look as the MDRRMO column. Items are
 * built by the dashboard from its own state (its queries + the shared
 * realtime channels), so this adds no queries or channels. Capped at 30.
 */

export type BarangayUpdateKind = "report" | "quick" | "approved" | "rejected" | "auto" | "level";

export type BarangayUpdate = {
  key: string;
  kind: BarangayUpdateKind;
  title: string;
  detail: string;
  time: number;
  /** DOM id to scroll to, and the dashboard tab that holds it. */
  target: { tab: "reports" | "quick" | "alerts" | "status"; elementId: string };
};

export const FEED_LIMIT = 30;

const KIND_STYLE: Record<BarangayUpdateKind, { label: string; bg: string; fg: string }> = {
  report: { label: "Report", bg: "#DCEAF8", fg: "#1E4E8C" },
  quick: { label: "Quick Report", bg: "#D5F2EF", fg: "#0F6B63" },
  approved: { label: "Approved", bg: "#DDF3E6", fg: "#1F6B3F" },
  rejected: { label: "Rejected", bg: "#FBE3E0", fg: "#9B2C20" },
  auto: { label: "Automated", bg: "#FDF1DC", fg: "#8A5A00" },
  level: { label: "Level", bg: "#E9E4FA", fg: "#4C3FA8" },
};

const SEEN_KEY = (userId: string) => `bahaba_barangay_updates_seen_${userId}`;
const FIRST_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

function readSeen(userId: string | null): number {
  if (userId) {
    try {
      const stored = Number(localStorage.getItem(SEEN_KEY(userId)));
      if (Number.isFinite(stored) && stored > 0) return stored;
    } catch {
      // Storage blocked: fall through to the first-run window.
    }
  }
  return Date.now() - FIRST_RUN_WINDOW_MS;
}

/** Unseen dots (per admin, localStorage) and a short highlight for items that arrive live. */
export function useFeedState(items: BarangayUpdate[], loading: boolean, userId: string | null) {
  const [seenAt, setSeenAt] = useState(() => readSeen(userId));
  useEffect(() => setSeenAt(readSeen(userId)), [userId]);
  const unseenCount = useMemo(() => items.filter((i) => i.time > seenAt).length, [items, seenAt]);
  const markAllSeen = useCallback(() => {
    const now = Date.now();
    setSeenAt(now);
    if (!userId) return;
    try {
      localStorage.setItem(SEEN_KEY(userId), String(now));
    } catch {
      // Non-critical; dots come back next visit.
    }
  }, [userId]);

  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (loading) return;
    if (!known.current) {
      known.current = new Set(items.map((i) => i.key));
      return;
    }
    const added = items.filter((i) => !known.current!.has(i.key)).map((i) => i.key);
    if (!added.length) return;
    added.forEach((k) => known.current!.add(k));
    setFresh((current) => new Set([...current, ...added]));
    const timer = window.setTimeout(() => {
      setFresh((current) => {
        const next = new Set(current);
        added.forEach((k) => next.delete(k));
        return next;
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [items, loading]);

  return { seenAt, unseenCount, markAllSeen, fresh };
}

type FeedState = ReturnType<typeof useFeedState>;

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function KindChip({ kind }: { kind: BarangayUpdateKind }) {
  const s = KIND_STYLE[kind];
  return (
    <span className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#1F6B3F" }}>
      <span className="live-dot h-2 w-2 rounded-full" style={{ background: "#2E9E5B" }} aria-hidden="true" />
      Live
    </span>
  );
}

function Row({ item, unseen, fresh, now, onOpen }: { item: BarangayUpdate; unseen: boolean; fresh: boolean; now: number; onOpen: () => void }) {
  return (
    <li className={fresh ? "update-item-new rounded-xl" : "rounded-xl"}>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/70">
        <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden="true">
          {unseen && <span className="h-2 w-2 rounded-full" style={{ background: "var(--primary-brand)" }} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <KindChip kind={item.kind} />
            <span className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.title}</span>
          </span>
          <span className="mt-0.5 block text-xs" style={{ color: "var(--text-secondary)" }}>{item.detail}</span>
          <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {relativeTime(item.time, now)}
            {unseen && <span className="sr-only"> (new)</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

function Skeleton({ count }: { count: number }) {
  return (
    <ul className="space-y-3 px-2" aria-busy="true" aria-label="Loading updates">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="space-y-1.5">
          <div className="h-4 w-3/4 animate-pulse rounded" style={{ background: "var(--border)" }} />
          <div className="h-3 w-1/2 animate-pulse rounded" style={{ background: "var(--border)" }} />
        </li>
      ))}
    </ul>
  );
}

type ViewProps = { items: BarangayUpdate[]; state: FeedState; loading: boolean; onOpen: (item: BarangayUpdate) => void };

/** Desktop (lg+) sticky column; scrolls inside itself. */
export function BarangayUpdatesColumn({ items, state, loading, onOpen }: ViewProps) {
  const now = useNow();
  return (
    <section className="clay flex h-full flex-col p-4" aria-labelledby="barangay-updates-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="barangay-updates-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          Recent updates{state.unseenCount > 0 ? ` (${state.unseenCount} new)` : ""}
        </h2>
        <LiveDot />
      </div>
      <div
        className="relative -mx-2 mt-3 min-h-0 flex-1 overflow-y-auto"
        onScroll={() => state.unseenCount > 0 && state.markAllSeen()}
        aria-live="polite"
      >
        {loading ? (
          <Skeleton count={6} />
        ) : items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No updates yet</p>
        ) : (
          <ul>
            {items.map((item) => (
              <Row key={item.key} item={item} unseen={item.time > state.seenAt} fresh={state.fresh.has(item.key)} now={now} onOpen={() => onOpen(item)} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Under 1024px: the latest item, expanding inline to the full list. */
export function BarangayUpdatesBar({ items, state, loading, onOpen }: ViewProps) {
  const [open, setOpen] = useState(false);
  const now = useNow();
  const latest = items[0];

  return (
    <section className="clay p-3" aria-label="Recent updates">
      <button
        type="button"
        onClick={() => {
          if (!open) state.markAllSeen();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-controls="barangay-updates-bar-list"
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              Recent updates{state.unseenCount > 0 ? ` (${state.unseenCount} new)` : ""}
            </span>
            <LiveDot />
          </span>
          {loading ? (
            <span className="mt-1 block h-3 w-2/3 animate-pulse rounded" style={{ background: "var(--border)" }} />
          ) : latest ? (
            <span className="mt-1 flex items-center gap-2">
              <KindChip kind={latest.kind} />
              <span className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                {latest.title} · {relativeTime(latest.time, now)}
              </span>
            </span>
          ) : (
            <span className="mt-1 block text-xs" style={{ color: "var(--text-secondary)" }}>No updates yet</span>
          )}
        </span>
        <ChevronDown size={20} aria-hidden="true" style={{ color: "var(--text-secondary)", transform: open ? "rotate(180deg)" : undefined }} />
      </button>

      {open && (
        <div id="barangay-updates-bar-list" className="mt-2 max-h-[60vh] overflow-y-auto border-t pt-2" style={{ borderColor: "var(--border)" }}>
          {items.length === 0 ? (
            <p className="py-3 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No updates yet</p>
          ) : (
            <ul className="-mx-2">
              {items.map((item) => (
                <Row
                  key={item.key}
                  item={item}
                  unseen={false}
                  fresh={state.fresh.has(item.key)}
                  now={now}
                  onOpen={() => {
                    setOpen(false);
                    onOpen(item);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
