import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { displayReporterName, waterLevelLabel } from "../../lib/reports";

/*
 * MDRRMO "Recent updates" feed. Built only from the dashboard's own
 * reports/alerts state (its existing queries + realtime subscriptions), so it
 * adds no queries or channels. Approval/rejection items get their time when
 * the status change is seen in this session (the tables have no review time).
 */

export type FeedReport = {
  id: number;
  user_name: string | null;
  location: string | null;
  water_level: string | null;
  status: string;
  timestamp: string;
  admin_reply: string | null;
  admin_reply_at: string | null;
};

export type FeedAlert = {
  id: number;
  title: string;
  targetBarangay: string;
  sentAt: string;
  createdBy: string;
  status: string;
};

export type UpdateKind = "report" | "alert" | "reply" | "approval" | "rejection";
export type UpdateFilter = "all" | "reports" | "alerts";

export type UpdateItem = {
  key: string;
  kind: UpdateKind;
  source: "report" | "alert";
  sourceId: number;
  /** Status of the underlying alert/report now (used to pick where to jump). */
  sourceStatus: string;
  title: string;
  detail: string;
  time: number;
};

const KIND_STYLE: Record<UpdateKind, { label: string; bg: string; fg: string }> = {
  report: { label: "Report", bg: "#DCEAF8", fg: "#1E4E8C" },
  alert: { label: "Alert", bg: "#FDF1DC", fg: "#8A5A00" },
  reply: { label: "Reply", bg: "#D5F2EF", fg: "#0F6B63" },
  approval: { label: "Approval", bg: "#DDF3E6", fg: "#1F6B3F" },
  rejection: { label: "Rejection", bg: "#FBE3E0", fg: "#9B2C20" },
};

const FILTERS: Array<{ id: UpdateFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "reports", label: "Reports" },
  { id: "alerts", label: "Alerts" },
];

const isApproved = (status: string) => status === "approved" || status === "verified";
const isReviewed = (status: string) => isApproved(status) || status === "rejected";
const time = (value: string | null | undefined) => {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};
const SEEN_KEY = (userId: string) => `bahaba_mdrrmo_updates_seen_${userId}`;
const FIRST_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;
const NEW_HIGHLIGHT_MS = 1500;

function readSeen(userId: string | null): number {
  if (!userId) return Date.now() - FIRST_RUN_WINDOW_MS;
  try {
    const stored = Number(localStorage.getItem(SEEN_KEY(userId)));
    if (Number.isFinite(stored) && stored > 0) return stored;
  } catch {
    // Storage blocked: fall through to the first-run window.
  }
  return Date.now() - FIRST_RUN_WINDOW_MS;
}

function writeSeen(userId: string | null, value: number) {
  if (!userId) return;
  try {
    localStorage.setItem(SEEN_KEY(userId), String(value));
  } catch {
    // Non-critical; dots just come back next visit.
  }
}

export function relativeTime(t: number, now: number): string {
  if (!t) return "";
  const minutes = Math.floor((now - t) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(t).toLocaleDateString();
}

/** Feed items, unseen tracking and new-item highlighting for both layouts. */
export function useRecentUpdates(reports: FeedReport[], alerts: FeedAlert[], loading: boolean, userId: string | null) {
  // pending -> reviewed transitions seen while the dashboard is open.
  const prevStatus = useRef(new Map<string, string>());
  const [reviewedAt, setReviewedAt] = useState<Record<string, number>>({});

  useEffect(() => {
    if (loading) return;
    const changes: Record<string, number> = {};
    const track = (key: string, status: string) => {
      const before = prevStatus.current.get(key);
      if (before !== undefined && before !== status && isReviewed(status)) changes[`${key}-${status}`] = Date.now();
      prevStatus.current.set(key, status);
    };
    for (const r of reports) track(`report-${r.id}`, r.status);
    for (const a of alerts) track(`alert-${a.id}`, a.status);
    if (Object.keys(changes).length) setReviewedAt((current) => ({ ...current, ...changes }));
  }, [reports, alerts, loading]);

  const items = useMemo<UpdateItem[]>(() => {
    const list: UpdateItem[] = [];
    for (const r of reports) {
      const place = r.location?.trim() || "Unknown location";
      const who = displayReporterName(r.user_name);
      list.push({
        key: `report-${r.id}`, kind: "report", source: "report", sourceId: r.id, sourceStatus: r.status,
        title: `Flood report: ${place}`, detail: `${waterLevelLabel(r.water_level)} · by ${who}`, time: time(r.timestamp),
      });
      if (r.admin_reply && r.admin_reply_at) {
        list.push({
          key: `reply-${r.id}-${r.admin_reply_at}`, kind: "reply", source: "report", sourceId: r.id, sourceStatus: r.status,
          title: `Reply sent: ${r.admin_reply}`, detail: `To ${who} · ${place}`, time: time(r.admin_reply_at),
        });
      }
      const reviewed = reviewedAt[`report-${r.id}-${r.status}`];
      if (reviewed) {
        list.push({
          key: `review-report-${r.id}-${r.status}`, kind: isApproved(r.status) ? "approval" : "rejection", source: "report", sourceId: r.id, sourceStatus: r.status,
          title: isApproved(r.status) ? "Report verified" : "Report rejected", detail: `${place} · by ${who}`, time: reviewed,
        });
      }
    }
    for (const a of alerts) {
      list.push({
        key: `alert-${a.id}`, kind: "alert", source: "alert", sourceId: a.id, sourceStatus: a.status,
        title: a.title || "Alert", detail: `${a.targetBarangay} · ${a.status === "pending" ? "awaiting review" : `by ${a.createdBy}`}`, time: time(a.sentAt),
      });
      const reviewed = reviewedAt[`alert-${a.id}-${a.status}`];
      if (reviewed) {
        list.push({
          key: `review-alert-${a.id}-${a.status}`, kind: isApproved(a.status) ? "approval" : "rejection", source: "alert", sourceId: a.id, sourceStatus: a.status,
          title: isApproved(a.status) ? "Alert approved" : "Alert rejected", detail: `${a.title || "Alert"} · ${a.targetBarangay}`, time: reviewed,
        });
      }
    }
    return list.sort((x, y) => y.time - x.time);
  }, [reports, alerts, reviewedAt]);

  // Seen state (per admin, localStorage) + items clicked this session.
  const [seenAt, setSeenAt] = useState(() => readSeen(userId));
  const [clicked, setClicked] = useState<Set<string>>(() => new Set());
  useEffect(() => setSeenAt(readSeen(userId)), [userId]);

  const isUnseen = useCallback((item: UpdateItem) => item.time > seenAt && !clicked.has(item.key), [seenAt, clicked]);
  const unseenCount = useMemo(() => items.filter(isUnseen).length, [items, isUnseen]);

  const markAllSeen = useCallback(() => {
    const now = Date.now();
    setSeenAt(now);
    writeSeen(userId, now);
  }, [userId]);
  const markSeen = useCallback((key: string) => setClicked((current) => new Set(current).add(key)), []);

  // Items that arrive after the first load slide in with a short highlight.
  const known = useRef<Set<string> | null>(null);
  const [freshKeys, setFreshKeys] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (loading) return;
    if (!known.current) {
      known.current = new Set(items.map((i) => i.key));
      return;
    }
    const added = items.filter((i) => !known.current!.has(i.key)).map((i) => i.key);
    if (!added.length) return;
    added.forEach((key) => known.current!.add(key));
    setFreshKeys((current) => new Set([...current, ...added]));
    const timer = window.setTimeout(() => {
      setFreshKeys((current) => {
        const next = new Set(current);
        added.forEach((key) => next.delete(key));
        return next;
      });
    }, NEW_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [items, loading]);

  return { items, isUnseen, unseenCount, markAllSeen, markSeen, freshKeys };
}

export type RecentUpdatesState = ReturnType<typeof useRecentUpdates>;

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function matchesFilter(item: UpdateItem, filter: UpdateFilter) {
  return filter === "all" || (filter === "reports" ? item.source === "report" : item.source === "alert");
}

function KindChip({ kind }: { kind: UpdateKind }) {
  const s = KIND_STYLE[kind];
  return (
    <span className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

function UpdateRow({
  item,
  unseen,
  fresh,
  now,
  onOpen,
}: {
  item: UpdateItem;
  unseen: boolean;
  fresh: boolean;
  now: number;
  onOpen: () => void;
}) {
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
          <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-secondary)" }}>{item.detail}</span>
          <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {relativeTime(item.time, now)}
            {unseen && <span className="sr-only"> (new)</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

function FilterRow({ filter, onChange }: { filter: UpdateFilter; onChange: (f: UpdateFilter) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="Filter updates">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          aria-pressed={filter === f.id}
          className="min-h-9 rounded-full px-3 text-xs font-semibold"
          style={
            filter === f.id
              ? { background: "var(--primary-shade)", color: "#fff" }
              : { background: "#fff", color: "var(--text-secondary)", border: "1px solid var(--border)" }
          }
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
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

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#1F6B3F" }}>
      <span className="live-dot h-2 w-2 rounded-full" style={{ background: "#2E9E5B" }} aria-hidden="true" />
      Live
    </span>
  );
}

type ViewProps = {
  state: RecentUpdatesState;
  loading: boolean;
  onOpen: (item: UpdateItem) => void;
  onViewAll: (filter: UpdateFilter) => void;
};

/** Desktop (lg+) sticky column; scrolls inside itself. */
export function RecentUpdatesColumn({ state, loading, onOpen, onViewAll }: ViewProps) {
  const [filter, setFilter] = useState<UpdateFilter>("all");
  const now = useNow();
  const visible = state.items.filter((i) => matchesFilter(i, filter)).slice(0, 20);
  const listRef = useRef<HTMLDivElement>(null);
  const lastHeight = useRef(0);
  const firstKey = visible[0]?.key;

  // Keep the reader's place when items are inserted above it (no jump).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const delta = el.scrollHeight - lastHeight.current;
    if (el.scrollTop > 0 && delta > 0 && lastHeight.current > 0) el.scrollTop += delta;
    lastHeight.current = el.scrollHeight;
  }, [firstKey, visible.length]);

  return (
    <section className="clay flex h-full flex-col p-4" aria-labelledby="recent-updates-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="recent-updates-title" className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          Recent updates
        </h2>
        <LiveDot />
      </div>
      <div className="mt-3">
        <FilterRow filter={filter} onChange={setFilter} />
      </div>
      <div
        ref={listRef}
        className="relative -mx-2 mt-3 min-h-0 flex-1 overflow-y-auto"
        style={{ overflowAnchor: "none" }}
        onScroll={() => state.unseenCount > 0 && state.markAllSeen()}
        aria-live="polite"
      >
        {loading ? (
          <SkeletonRows count={6} />
        ) : visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No updates yet</p>
        ) : (
          <ul>
            {visible.map((item) => (
              <UpdateRow
                key={item.key}
                item={item}
                unseen={state.isUnseen(item)}
                fresh={state.freshKeys.has(item.key)}
                now={now}
                onOpen={() => {
                  state.markSeen(item.key);
                  onOpen(item);
                }}
              />
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={() => onViewAll(filter)}
        className="mt-2 min-h-10 self-start text-sm font-semibold hover:underline"
        style={{ color: "var(--primary-shade)" }}
      >
        View all →
      </button>
    </section>
  );
}

/** Under-1024px bar: latest item, expands inline to the latest 10. */
export function RecentUpdatesBar({ state, loading, onOpen, onViewAll }: ViewProps) {
  const [open, setOpen] = useState(false);
  const now = useNow();
  const latest = state.items[0];
  const list = state.items.slice(0, 10);

  const toggle = () => {
    setOpen((v) => !v);
    if (!open) state.markAllSeen();
  };

  return (
    <section className="clay p-3" aria-label="Recent updates">
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls="recent-updates-bar-list" className="flex w-full items-center gap-2 text-left">
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
        <div id="recent-updates-bar-list" className="relative mt-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
          {loading ? (
            <SkeletonRows count={3} />
          ) : list.length === 0 ? (
            <p className="py-3 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No updates yet</p>
          ) : (
            <ul className="-mx-2">
              {list.map((item) => (
                <UpdateRow
                  key={item.key}
                  item={item}
                  unseen={false}
                  fresh={state.freshKeys.has(item.key)}
                  now={now}
                  onOpen={() => {
                    state.markSeen(item.key);
                    setOpen(false);
                    onOpen(item);
                  }}
                />
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onViewAll("all");
            }}
            className="min-h-10 text-sm font-semibold hover:underline"
            style={{ color: "var(--primary-shade)" }}
          >
            View all →
          </button>
        </div>
      )}
    </section>
  );
}
