import { SOURCE_LABELS, STATUS_LABELS, asSource, pagasaText, type AlertLevel, type AlertStatus } from "./alerts";
import { formatManilaDateTime } from "./barangayAdmin";
import { STATUS_OPTIONS, type ObservationKind, KIND_LABELS, statusOption } from "./fieldObservations";
import type { FloodEvent } from "./floodHistory";
import { waterLevelLabel } from "./reports";
import { supabase } from "./supabase";

/*
 * Flood event report. flood_event_summary (MDRRMO only) returns the figures;
 * reportTables() turns them into one list of tables, and both the PDF and the
 * CSV files are built from that list, so the two always match.
 */

type Counts = Record<string, number>;

export type EventSummary = {
  event: { id: number; name: string; start_at: string; end_at: string };
  community_reports: { total: number; by_status: Counts; by_barangay: Counts; by_water_level: Counts };
  quick_reports: { total: number; by_status: Counts; flagged_false: number };
  alerts: {
    total: number;
    by_level: Counts;
    list: Array<{ sent_at: string; level: string; title: string; target: string; status: string; source: string; is_all_clear: boolean }>;
  };
  field_observations: Array<{ observed_at: string; barangay: string; kind: string; location: string; status: string; note: string | null }>;
};

export type ReportTable = { title: string; file: string; columns: string[]; rows: string[][] };

export const NONE_RECORDED = "None recorded";

export async function fetchEventSummary(eventId: number): Promise<EventSummary> {
  const { data, error } = await supabase.rpc("flood_event_summary", { p_event_id: eventId });
  if (error) throw error;
  if (!data) throw new Error("The report came back empty.");
  return data as EventSummary;
}

/** The end time is required, so an event is ongoing until that time has passed. */
export const isOngoing = (event: Pick<FloodEvent, "end_at">, now = Date.now()) => new Date(event.end_at).getTime() > now;

const titleCase = (value: string) => (value ? value[0].toUpperCase() + value.slice(1) : value);

const countRows = (counts: Counts, label: (key: string) => string = titleCase) =>
  Object.entries(counts)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([key, n]) => [label(key), String(n)]);

const levelText = (level: string) => (level === "advisory" || level === "warning" || level === "critical" ? pagasaText(level as AlertLevel) : titleCase(level));
const alertStatusText = (status: string) => STATUS_LABELS[status as AlertStatus] ?? titleCase(status);
const observationStatus = (kind: string, status: string) =>
  kind in STATUS_OPTIONS ? statusOption(kind as ObservationKind, status).label : titleCase(status);

export function reportTables(s: EventSummary): ReportTable[] {
  const counts = ["Count"];
  return [
    {
      title: "Totals",
      file: "totals.csv",
      columns: ["Measure", ...counts],
      rows: [
        ["Community reports", String(s.community_reports.total)],
        ["Quick Reports", String(s.quick_reports.total)],
        ["Quick Reports flagged as false", String(s.quick_reports.flagged_false)],
        ["Alerts", String(s.alerts.total)],
        ["Field observations", String(s.field_observations.length)],
      ],
    },
    { title: "Community reports by status", file: "community-reports-by-status.csv", columns: ["Status", ...counts], rows: countRows(s.community_reports.by_status) },
    { title: "Community reports by barangay", file: "community-reports-by-barangay.csv", columns: ["Barangay", ...counts], rows: countRows(s.community_reports.by_barangay, (k) => k) },
    { title: "Community reports by water level", file: "community-reports-by-water-level.csv", columns: ["Water level", ...counts], rows: countRows(s.community_reports.by_water_level, waterLevelLabel) },
    { title: "Quick Reports by status", file: "quick-reports-by-status.csv", columns: ["Status", ...counts], rows: countRows(s.quick_reports.by_status) },
    {
      title: "Alerts sent during the event",
      file: "alerts.csv",
      columns: ["Time", "Level", "Title", "Target", "Source", "Status", "All clear"],
      rows: s.alerts.list.map((a) => [
        formatManilaDateTime(a.sent_at),
        levelText(a.level),
        a.title,
        a.target,
        SOURCE_LABELS[asSource(a.source)],
        alertStatusText(a.status),
        a.is_all_clear ? "Yes" : "No",
      ]),
    },
    {
      title: "Field observations",
      file: "field-observations.csv",
      columns: ["Time", "Barangay", "Kind", "Location", "Status", "Note"],
      rows: s.field_observations.map((o) => [
        formatManilaDateTime(o.observed_at),
        o.barangay,
        KIND_LABELS[o.kind as ObservationKind] ?? titleCase(o.kind),
        o.location,
        observationStatus(o.kind, o.status),
        o.note ?? "",
      ]),
    },
  ];
}

const periodText = (s: EventSummary, now: number) => {
  const start = formatManilaDateTime(s.event.start_at);
  const end = formatManilaDateTime(s.event.end_at);
  return isOngoing(s.event, now) ? `${start} to ${end} (still ongoing, figures up to the time below)` : `${start} to ${end}`;
};

export const reportFooter = (generatedAt: Date) => `Generated by BAHAba on ${formatManilaDateTime(generatedAt.toISOString())}. Rainfall figures are modelled data.`;

const fileSlug = (s: EventSummary) =>
  s.event.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `event-${s.event.id}`;

/** The PDF's built-in font only covers Western characters; anything else would print as garbage. */
function pdfText(value: string): string {
  return value
    .replace(/[   ]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA1-\xFF\n]/g, "?");
}

export async function buildReportPdf(summary: EventSummary, generatedAt: Date): Promise<{ blob: Blob; name: string }> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const footerSpace = 46;
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  let y = margin + 8;

  doc.setFont("helvetica", "bold").setFontSize(16);
  const nameLines = doc.splitTextToSize(pdfText(summary.event.name), width - margin * 2) as string[];
  doc.text(nameLines, margin, y);
  y += nameLines.length * 19;
  doc.setFont("helvetica", "normal").setFontSize(10);
  const period = doc.splitTextToSize(pdfText(`Period: ${periodText(summary, generatedAt.getTime())}`), width - margin * 2) as string[];
  doc.text(period, margin, y);
  y += period.length * 13 + 10;

  for (const table of reportTables(summary)) {
    if (y > height - footerSpace - 70) {
      doc.addPage();
      y = margin + 8;
    }
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text(pdfText(table.title), margin, y);
    y += 8;
    if (table.rows.length === 0) {
      doc.setFont("helvetica", "normal").setFontSize(10);
      doc.text(NONE_RECORDED, margin, y + 10);
      y += 32;
      continue;
    }
    autoTable(doc, {
      startY: y,
      head: [table.columns.map(pdfText)],
      body: table.rows.map((row) => row.map(pdfText)),
      margin: { left: margin, right: margin, bottom: footerSpace },
      rowPageBreak: "avoid",
      styles: { fontSize: table.columns.length > 4 ? 8 : 9, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [10, 107, 136] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }

  const footer = pdfText(reportFooter(generatedAt));
  const pages = doc.getNumberOfPages();
  doc.setFont("helvetica", "normal").setFontSize(8);
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.text(footer, margin, height - 24);
    doc.text(`Page ${page} of ${pages}`, width - margin, height - 24, { align: "right" });
  }
  return { blob: doc.output("blob"), name: `bahaba-flood-report-${fileSlug(summary)}.pdf` };
}

/** Spreadsheets run cells that start with these as formulas, so they are stored as plain text. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function tableCsv(table: ReportTable): string {
  const rows = table.rows.length ? table.rows : [[NONE_RECORDED, ...table.columns.slice(1).map(() => "")]];
  // The byte order mark makes Excel read the file as UTF-8.
  return `﻿${[table.columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export async function buildReportZip(summary: EventSummary): Promise<{ blob: Blob; name: string }> {
  const { strToU8, zipSync } = await import("fflate");
  const files = Object.fromEntries(reportTables(summary).map((table) => [table.file, strToU8(tableCsv(table))]));
  const bytes = zipSync(files);
  return { blob: new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" }), name: `bahaba-flood-report-${fileSlug(summary)}.zip` };
}

export function saveFile({ blob, name }: { blob: Blob; name: string }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
