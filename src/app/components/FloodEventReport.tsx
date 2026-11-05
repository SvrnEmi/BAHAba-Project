import { useState } from "react";
import { Download, FileArchive, FileText, Loader } from "lucide-react";
import { errorMessage } from "../../lib/barangayAdmin";
import { buildReportPdf, buildReportZip, fetchEventSummary, isOngoing, saveFile, type EventSummary } from "../../lib/floodEventReport";
import type { FloodEvent } from "../../lib/floodHistory";

/*
 * "Download report" on a flood event. One read fills both files. They are two
 * buttons because browsers can block a second automatic download.
 */

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; summary: EventSummary; generatedAt: Date }
  | { kind: "error"; text: string };

export function FloodEventReport({ event }: { event: FloodEvent }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const ongoing = isOngoing(event);

  const prepare = async () => {
    setState({ kind: "loading" });
    setSaveError(null);
    try {
      setState({ kind: "ready", summary: await fetchEventSummary(event.id), generatedAt: new Date() });
    } catch (err) {
      setState({ kind: "error", text: errorMessage(err, "Unable to build the report.") });
    }
  };

  const save = async (build: () => ReturnType<typeof buildReportZip>) => {
    setSaving(true);
    setSaveError(null);
    try {
      saveFile(await build());
    } catch (err) {
      setSaveError(errorMessage(err, "Unable to create the file."));
    } finally {
      setSaving(false);
    }
  };

  const ready = state.kind === "ready" ? state : null;
  const fileButton = "flex min-h-12 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold";

  return (
    <div className="mt-1 space-y-1">
      {ongoing && (
        <p className="text-xs font-semibold" style={{ color: "var(--risk-medium-text)" }}>
          This event is still ongoing. A report now only covers what has been recorded so far.
        </p>
      )}
      <button
        type="button"
        onClick={() => void prepare()}
        disabled={state.kind === "loading"}
        aria-label={`Download report for ${event.name}`}
        className={fileButton}
        style={{ color: "var(--primary-shade)" }}
      >
        {state.kind === "loading" ? <Loader size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
        {state.kind === "loading" ? "Preparing report..." : "Download report"}
      </button>
      {state.kind === "error" && (
        <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ color: "var(--text-primary)", borderLeft: "4px solid var(--risk-high)" }}>
          {state.text}
        </p>
      )}
      {ready && (
        <div className="flex flex-wrap items-center gap-1" role="status">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Ready:</span>
          <button type="button" className={fileButton} style={{ color: "var(--primary-shade)" }} disabled={saving} onClick={() => void save(() => buildReportPdf(ready.summary, ready.generatedAt))}>
            <FileText size={16} aria-hidden="true" /> PDF
          </button>
          <button type="button" className={fileButton} style={{ color: "var(--primary-shade)" }} disabled={saving} onClick={() => void save(() => buildReportZip(ready.summary))}>
            <FileArchive size={16} aria-hidden="true" /> CSV files (zip)
          </button>
        </div>
      )}
      {saveError && (
        <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ color: "var(--text-primary)", borderLeft: "4px solid var(--risk-high)" }}>
          {saveError}
        </p>
      )}
    </div>
  );
}
