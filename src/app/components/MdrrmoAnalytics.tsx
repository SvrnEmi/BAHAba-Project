import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../../lib/supabase";
import { asSource, PAGASA, SOURCE_LABELS, type AlertLevel, type AlertSource } from "../../lib/alerts";
import { errorMessage } from "../../lib/barangayAdmin";
import { InfoTip } from "./InfoTip";

/*
 * MDRRMO analytics for the last 7 or 30 days, computed in the browser from
 * existing tables (community_reports, alerts, quick_reports,
 * report_messages, audit_logs). No new database objects. Every chart has
 * text labels and a table fallback.
 */

type Range = 7 | 30;
type ReportRow = { id: number; status: string | null; barangay: string | null; timestamp: string };
type AlertRow = { id: number; level: AlertLevel; source: AlertSource; sent_at: string };
type QuickRow = { id: string | number; created_at: string; flagged_false: boolean | null };
type MessageRow = { report_id: number; sender_role: string; created_at: string };
type ReviewRow = { action: string; timestamp: string; details: string };

type Data = {
  reports: ReportRow[];
  alerts: AlertRow[];
  quick: QuickRow[];
  messages: MessageRow[];
  reviews: Array<{ reportId: number; reviewedAt: number }>;
  reportTimes: Map<number, number>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const manilaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const shortDay = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() || 0 : 0);
const isApproved = (s: string | null) => s === "approved" || s === "verified";

/** Audit details written on review look like "Report #123 approved: ...". */
const REPORT_ID = /Report #(\d+)/i;

async function loadData(days: Range): Promise<Data> {
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const [reports, alerts, quick, messages, reviews] = await Promise.all([
    supabase.from("community_reports").select("id, status, barangay, timestamp").gte("timestamp", since).limit(5000),
    supabase.from("alerts").select("id, level, source, sent_at").gte("sent_at", since).limit(5000),
    supabase.from("quick_reports").select("id, created_at, flagged_false").gte("created_at", since).limit(5000),
    supabase.from("report_messages").select("report_id, sender_role, created_at").gte("created_at", since).order("created_at", { ascending: true }).limit(5000),
    supabase.from("audit_logs").select("action, timestamp, details").in("action", ["REPORT_APPROVED", "REPORT_REJECTED"]).gte("timestamp", since).limit(5000),
  ]);
  for (const res of [reports, alerts, quick, messages, reviews]) if (res.error) throw res.error;

  const reviewList = ((reviews.data ?? []) as ReviewRow[])
    .map((r) => ({ reportId: Number(REPORT_ID.exec(r.details)?.[1]), reviewedAt: t(r.timestamp) }))
    .filter((r) => Number.isFinite(r.reportId) && r.reviewedAt > 0);

  // Reviewed reports may be older than the window: read their submit times.
  const reportTimes = new Map<number, number>();
  for (const r of (reports.data ?? []) as ReportRow[]) reportTimes.set(r.id, t(r.timestamp));
  const missing = [...new Set(reviewList.map((r) => r.reportId))].filter((id) => !reportTimes.has(id));
  if (missing.length) {
    const { data } = await supabase.from("community_reports").select("id, timestamp").in("id", missing.slice(0, 500));
    for (const r of (data ?? []) as Array<{ id: number; timestamp: string }>) reportTimes.set(r.id, t(r.timestamp));
  }

  return {
    reports: (reports.data ?? []) as ReportRow[],
    alerts: ((alerts.data ?? []) as Array<Record<string, unknown>>).map((a) => ({
      id: Number(a.id),
      level: a.level === "warning" || a.level === "critical" ? a.level : "advisory",
      source: asSource(a.source),
      sent_at: String(a.sent_at ?? ""),
    })),
    quick: (quick.data ?? []) as QuickRow[],
    messages: (messages.data ?? []) as MessageRow[],
    reviews: reviewList,
    reportTimes,
  };
}

function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

function Card({ title, info, children, table }: { title: string; info: string; children: ReactNode; table?: ReactNode }) {
  return (
    <section className="clay min-w-0 space-y-3 p-4" aria-label={title}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{title}</h4>
        <InfoTip label={title}>{info}</InfoTip>
      </div>
      {children}
      {table && (
        <details>
          <summary className="inline-flex min-h-10 cursor-pointer items-center text-xs font-semibold" style={{ color: "var(--primary-shade)" }}>
            Show as table
          </summary>
          <div className="mt-2 overflow-x-auto">{table}</div>
        </details>
      )}
    </section>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr style={{ color: "var(--text-secondary)" }}>{head.map((h) => <th key={h} scope="col" className="p-1.5 font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t">
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row" className="p-1.5 font-medium">{c}</th> : <td key={j} className="p-1.5">{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{value}</p>
      <p className="text-xs font-normal" style={{ color: "var(--text-secondary)" }}>{label}</p>
    </div>
  );
}

const AXIS = { fontSize: 11, fill: "#55657a" };

export function MdrrmoAnalytics() {
  const [days, setDays] = useState<Range>(7);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadData(days)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(errorMessage(err, "Unable to load analytics.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days, reloadKey]);

  const view = useMemo(() => {
    if (!data) return null;
    const status = [
      { name: "Pending", value: data.reports.filter((r) => !isApproved(r.status) && r.status !== "rejected").length, fill: "var(--risk-medium)" },
      { name: "Approved", value: data.reports.filter((r) => isApproved(r.status)).length, fill: "var(--risk-low)" },
      { name: "Rejected", value: data.reports.filter((r) => r.status === "rejected").length, fill: "var(--risk-high)" },
    ];

    const perBarangay = new Map<string, number>();
    for (const r of data.reports) {
      const name = r.barangay?.trim() || "Unknown";
      perBarangay.set(name, (perBarangay.get(name) ?? 0) + 1);
    }
    const barangays = [...perBarangay.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // One row per Manila day in the window, oldest first.
    const dayKeys: string[] = [];
    for (let i = days - 1; i >= 0; i--) dayKeys.push(manilaDay.format(Date.now() - i * DAY_MS));
    const perDay = new Map(dayKeys.map((k) => [k, { advisory: 0, warning: 0, critical: 0 }]));
    for (const a of data.alerts) {
      const row = perDay.get(manilaDay.format(t(a.sent_at)));
      if (row) row[a.level] += 1;
    }
    const colorDays = dayKeys.map((k) => ({
      day: shortDay.format(new Date(`${k}T12:00:00+08:00`)),
      Yellow: perDay.get(k)!.advisory,
      Orange: perDay.get(k)!.warning,
      Red: perDay.get(k)!.critical,
    }));

    const totalAlerts = data.alerts.length;
    const sources = (["barangay", "mdrrmo", "auto"] as AlertSource[]).map((s) => {
      const count = data.alerts.filter((a) => a.source === s).length;
      return { name: SOURCE_LABELS[s], value: count, pct: totalAlerts ? Math.round((count / totalAlerts) * 100) : 0 };
    });

    const durations = data.reviews
      .filter((r) => (data.reportTimes.get(r.reportId) ?? 0) > 0)
      .map((r) => r.reviewedAt - data.reportTimes.get(r.reportId)!)
      .filter((ms) => ms > 0);
    const avgReview = durations.length ? durations.reduce((s, ms) => s + ms, 0) / durations.length : null;

    const quickTotal = data.quick.length;
    const quickFlagged = data.quick.filter((q) => q.flagged_false === true).length;

    // A resident message counts as answered when staff write later in the same thread.
    const byReport = new Map<number, MessageRow[]>();
    for (const m of data.messages) byReport.set(m.report_id, [...(byReport.get(m.report_id) ?? []), m]);
    let residentMessages = 0;
    let answered = 0;
    for (const list of byReport.values()) {
      list.forEach((m, i) => {
        if (m.sender_role !== "resident") return;
        residentMessages += 1;
        if (list.slice(i + 1).some((later) => later.sender_role !== "resident")) answered += 1;
      });
    }

    return { status, barangays, colorDays, sources, totalAlerts, avgReview, reviewedCount: durations.length, quickTotal, quickFlagged, residentMessages, answered };
  }, [data, days]);

  return (
    <section aria-labelledby="analytics-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="analytics-title" className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          <BarChart3 size={20} aria-hidden="true" style={{ color: "var(--primary-brand)" }} /> Analytics
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex gap-1" role="group" aria-label="Time range">
            {([7, 30] as Range[]).map((d) => (
              <button key={d} type="button" className="clay-tab" aria-pressed={days === d} aria-selected={days === d} onClick={() => setDays(d)}>
                {d} days
              </button>
            ))}
          </div>
          <button type="button" className="clay-btn clay-btn-secondary text-sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} aria-label="Refresh analytics">
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
          Could not load analytics: {error}
        </p>
      ) : !view ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="clay h-48 animate-pulse" />)}
        </div>
      ) : (
        <div className={`grid gap-4 md:grid-cols-2 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <Card
            title="Reports by status"
            info={`Community reports submitted in the last ${days} days, grouped by their current status. From the community_reports table.`}
            table={<SimpleTable head={["Status", "Reports"]} rows={view.status.map((s) => [s.name, s.value])} />}
          >
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={view.status} margin={{ top: 18, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={AXIS} />
                  <YAxis allowDecimals={false} tick={AXIS} />
                  <Tooltip />
                  <Bar dataKey="value" name="Reports" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                    <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: "#1e2a38" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            title="Reports per barangay"
            info={`How many community reports each barangay sent in the last ${days} days, by the report's barangay field.`}
            table={<SimpleTable head={["Barangay", "Reports"]} rows={view.barangays.map((b) => [b.name, b.value])} />}
          >
            {view.barangays.length === 0 ? (
              <p className="text-sm font-normal" style={{ color: "var(--text-secondary)" }}>No reports in this period.</p>
            ) : (
              <div style={{ height: Math.max(120, view.barangays.length * 26) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={view.barangays} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
                    <XAxis type="number" allowDecimals={false} hide />
                    <YAxis type="category" dataKey="name" width={88} tick={AXIS} />
                    <Tooltip />
                    <Bar dataKey="value" name="Reports" fill="var(--primary-brand)" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                      <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "#1e2a38" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card
            title="Alerts per PAGASA color per day"
            info={`Alerts sent each day (Philippine time) in the last ${days} days, by PAGASA color: Yellow - Be Alert, Orange - Be Prepared, Red - Take Action.`}
            table={<SimpleTable head={["Day", "Yellow - Be Alert", "Orange - Be Prepared", "Red - Take Action"]} rows={view.colorDays.map((d) => [d.day, d.Yellow, d.Orange, d.Red])} />}
          >
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={view.colorDays} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={AXIS} interval={days === 30 ? 4 : 0} />
                  <YAxis allowDecimals={false} tick={AXIS} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => `${v} - ${v === "Yellow" ? PAGASA.advisory.label : v === "Orange" ? PAGASA.warning.label : PAGASA.critical.label}`} />
                  <Bar dataKey="Yellow" stackId="c" fill="var(--pagasa-yellow)" isAnimationActive={false} />
                  <Bar dataKey="Orange" stackId="c" fill="var(--pagasa-orange)" isAnimationActive={false} />
                  <Bar dataKey="Red" stackId="c" fill="var(--pagasa-red)" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            title="Alerts by source"
            info={`Share of the ${view.totalAlerts} alerts sent in the last ${days} days that came from barangays, the MDRRMO, or the automatic rainfall rules.`}
            table={<SimpleTable head={["Source", "Alerts", "Share"]} rows={view.sources.map((s) => [s.name, s.value, `${s.pct}%`])} />}
          >
            <ul className="space-y-2">
              {view.sources.map((s) => (
                <li key={s.name} className="text-xs">
                  <div className="mb-1 flex justify-between font-semibold" style={{ color: "var(--text-primary)" }}>
                    <span>{s.name}</span>
                    <span>{s.value} ({s.pct}%)</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white" aria-hidden="true">
                    <div className="h-2.5 rounded-full" style={{ width: `${s.pct}%`, background: "var(--primary-brand)" }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="Average time to review a report"
            info="Time from a report being sent to its approval or rejection, averaged over reviews logged in the audit trail in this period. Reviews made before review logging started are not counted."
          >
            <Stat
              value={view.avgReview == null ? "--" : formatDuration(view.avgReview)}
              label={view.reviewedCount ? `Across ${view.reviewedCount} logged ${view.reviewedCount === 1 ? "review" : "reviews"}` : "No logged reviews in this period"}
            />
          </Card>

          <Card
            title="Quick Reports"
            info={`Quick Reports (sent without an account) received in the last ${days} days, and how many the MDRRMO flagged as false. From the quick_reports table.`}
            table={<SimpleTable head={["", "Count"]} rows={[["Received", view.quickTotal], ["Flagged false", view.quickFlagged]]} />}
          >
            <div className="flex gap-8">
              <Stat value={String(view.quickTotal)} label="Received" />
              <Stat value={String(view.quickFlagged)} label={`Flagged false${view.quickTotal ? ` (${Math.round((view.quickFlagged / view.quickTotal) * 100)}%)` : ""}`} />
            </div>
          </Card>

          <Card
            title="Messages answered"
            info={`Resident messages on report threads in the last ${days} days that got a later reply from the barangay or the MDRRMO in the same thread.`}
          >
            <Stat
              value={view.residentMessages ? `${view.answered} of ${view.residentMessages}` : "--"}
              label={view.residentMessages ? `${Math.round((view.answered / view.residentMessages) * 100)}% of resident messages answered` : "No resident messages in this period"}
            />
          </Card>
        </div>
      )}
    </section>
  );
}
