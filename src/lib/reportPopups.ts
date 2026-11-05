/*
 * Rules for the "report verified" pop-ups on the resident screens. No Supabase
 * or React here, so the rules can be tested alone.
 * bahaba_app/lib/services/verified_report_popups.dart holds the same rules.
 */

export type PopupReport = {
  id: number;
  location: string | null;
  water_level: string | null;
  timestamp: string;
  barangay: string | null;
  user_id: string | null;
  status: string;
  rejection_reason: string | null;
};

export const POPUP_COLUMNS = "id, location, water_level, timestamp, barangay, user_id, status, rejection_reason";
export const POPUP_WINDOW_MS = 10_000;
export const CATCH_UP_LIMIT = 100;
const MAX_SHOWN_IDS = 500;

/** A rejected report that is approved later still gets its own pop-up. */
export const popupKey = (report: Pick<PopupReport, "id" | "status">) =>
  report.status === "rejected" ? `${report.id}:rejected` : String(report.id);

/** Any approved report in the barangay, plus the resident's own approved or rejected reports. */
export function isPopupEvent(report: Pick<PopupReport, "status" | "barangay" | "user_id">, barangay: string, userId: string): boolean {
  const own = report.user_id === userId;
  if (report.status === "approved") return own || report.barangay === barangay;
  return report.status === "rejected" && own;
}

/** One saved place per resident and barangay, so moving barangay counts as a first launch. */
const scoped = (name: string, userId: string, barangay: string) => `${name}:${userId}:${barangay}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the pop-ups just won't remember across visits.
  }
}

export function readLastSeenReportTime(userId: string, barangay: string): number | null {
  const stored = Number(read(scoped("last_seen_report_time", userId, barangay)));
  return Number.isFinite(stored) && stored > 0 ? stored : null;
}

export function saveLastSeenReportTime(userId: string, barangay: string, time: number) {
  write(scoped("last_seen_report_time", userId, barangay), String(time));
}

export function readShownReportIds(userId: string, barangay: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(read(scoped("shown_report_ids", userId, barangay)) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveShownReportIds(userId: string, barangay: string, shown: Set<string>) {
  write(scoped("shown_report_ids", userId, barangay), JSON.stringify([...shown].slice(-MAX_SHOWN_IDS)));
}

/**
 * Reports for the catch-up dialog, or null on the first launch (save, show
 * nothing). community_reports has no approval time and "timestamp" is when the
 * report was sent, so a report sent before the last visit and approved after it
 * would be missed by comparing times. Comparing with the shown ids catches it.
 */
export function catchUpReports(rows: PopupReport[], lastSeen: number | null, shown: Set<string>): PopupReport[] | null {
  if (lastSeen == null) return null;
  return rows.filter((row) => !shown.has(popupKey(row)));
}

/** Waits [windowMs] after the first event, then shows everything collected as one dialog. */
export class PopupQueue {
  private waiting = new Map<string, PopupReport>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private open = false;

  constructor(
    private readonly options: {
      isShown: (key: string) => boolean;
      markShown: (keys: string[]) => void;
      isViewing: (reportId: number) => boolean;
      show: (reports: PopupReport[], catchUp: boolean) => void;
      windowMs?: number;
    },
  ) {}

  add(report: PopupReport) {
    const key = popupKey(report);
    if (this.options.isShown(key)) return;
    this.waiting.set(key, report);
    if (!this.timer && !this.open) {
      this.timer = setTimeout(() => this.flush(false), this.options.windowMs ?? POPUP_WINDOW_MS);
    }
  }

  /** The catch-up dialog shows at once. */
  addCatchUp(reports: PopupReport[]) {
    for (const report of reports) this.waiting.set(popupKey(report), report);
    this.flush(true);
  }

  /** The resident closed the dialog; anything that arrived meanwhile comes next. */
  closed() {
    this.open = false;
    if (this.waiting.size > 0) this.flush(false);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.waiting.clear();
  }

  private flush(catchUp: boolean) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.open || this.waiting.size === 0) return;
    const keys = [...this.waiting.keys()];
    const reports = [...this.waiting.values()].filter((report) => !this.options.isViewing(report.id));
    this.waiting.clear();
    this.options.markShown(keys);
    if (reports.length === 0) return;
    this.open = true;
    this.options.show(reports, catchUp);
  }
}
