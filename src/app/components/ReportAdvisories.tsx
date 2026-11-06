import { useId, useState } from "react";
import { Loader, Megaphone, Send, Trash2 } from "lucide-react";
import {
  ADVISORY_MAX_LENGTH,
  ADVISORY_MIN_LENGTH,
  advisoryAuthor,
  advisoryRoleLabel,
  deleteAdvisory,
  postAdvisory,
  postableAdvisory,
  useReportAdvisories,
  type ReportAdvisory,
} from "../../lib/reportAdvisories";
import { errorMessage, formatManilaDateTime } from "../../lib/barangayAdmin";
import { STRINGS } from "../../lib/strings";

const T = STRINGS.advisory;

/** What residents see under a report. Bodies are plain text. */
export function AdvisoryList({ advisories }: { advisories: ReportAdvisory[] }) {
  if (advisories.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label={T.listLabel}>
      {advisories.map((advisory) => (
        <li key={advisory.id} className="bg-white px-3 py-2" style={{ borderLeft: "4px solid var(--primary-shade)" }}>
          <p className="text-xs font-bold" style={{ color: "var(--primary-shade)" }}>{T.from(advisoryAuthor(advisory))}</p>
          <p className="whitespace-pre-wrap break-words text-sm font-normal" style={{ color: "var(--text-primary)" }}>{advisory.body}</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatManilaDateTime(advisory.created_at)}</p>
        </li>
      ))}
    </ul>
  );
}

/** One report's advisories for a resident, live. Used on the full report and on "My reports". */
export function ReportAdvisoryList({ reportId }: { reportId: number }) {
  const { rows } = useReportAdvisories([reportId]);
  return <AdvisoryList advisories={rows} />;
}

/**
 * The "Advisory" section for staff: helper text, the form and the list. A
 * barangay official deletes their own; the MDRRMO ([canDeleteAny]) deletes any.
 */
export function ReportAdvisoryPanel({ reportId, userId, canDeleteAny = false }: { reportId: number; userId: string | null; canDeleteAny?: boolean }) {
  const inputId = useId();
  const { rows, loading, error, added, removed } = useReportAdvisories([reportId]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const trimmed = draft.trim().length;

  const post = async () => {
    if (posting || !postableAdvisory(draft)) return;
    setPosting(true);
    setActionError(null);
    try {
      added(await postAdvisory(reportId, draft));
      setDraft("");
    } catch (err) {
      setActionError(errorMessage(err, T.postFailed));
    } finally {
      setPosting(false);
    }
  };

  const remove = async (advisory: ReportAdvisory) => {
    if (!window.confirm(T.confirmDelete)) return;
    setBusyId(advisory.id);
    setActionError(null);
    try {
      await deleteAdvisory(advisory.id);
      removed(advisory.id);
    } catch (err) {
      setActionError(errorMessage(err, T.deleteFailed));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-2 border-t pt-3" aria-label={T.title}>
      <h4 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
        <Megaphone size={16} aria-hidden="true" /> {T.title}
      </h4>
      <ul className="space-y-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
        <li><span className="font-semibold">{T.commentLabel}</span> {T.commentHelp}</li>
        <li><span className="font-semibold">{T.advisoryLabel}</span> {T.advisoryHelp}</li>
      </ul>

      <label className="sr-only" htmlFor={inputId}>{T.inputLabel}</label>
      <textarea
        id={inputId}
        className="clay-input min-h-20"
        value={draft}
        maxLength={ADVISORY_MAX_LENGTH}
        disabled={posting}
        placeholder={T.placeholder}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {trimmed}/{ADVISORY_MAX_LENGTH}{trimmed > 0 && trimmed < ADVISORY_MIN_LENGTH ? ` · ${T.tooShort(ADVISORY_MIN_LENGTH)}` : ""}
        </span>
        <button type="button" className="clay-btn clay-btn-primary text-sm" disabled={posting || !postableAdvisory(draft)} onClick={() => void post()}>
          {posting ? <Loader size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
          {posting ? T.posting : T.post}
        </button>
      </div>
      {(actionError || error) && (
        <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
          {actionError ?? error}
        </p>
      )}

      {loading ? (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{T.loading}</p>
      ) : rows.length === 0 ? (
        !error && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{T.none}</p>
      ) : (
        <ul className="space-y-2" aria-label={T.listLabel}>
          {rows.map((advisory) => (
            <li key={advisory.id} className="bg-white px-3 py-2" style={{ borderLeft: "4px solid var(--primary-shade)" }}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-bold" style={{ color: "var(--primary-shade)" }}>
                  {advisoryAuthor(advisory)} · {advisoryRoleLabel(advisory.author_role)}
                </p>
                {(canDeleteAny || advisory.author_id === userId) && (
                  <button
                    type="button"
                    className="clay-btn clay-btn-secondary text-xs"
                    aria-label={T.delete}
                    title={T.delete}
                    disabled={busyId === advisory.id}
                    onClick={() => void remove(advisory)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm font-normal" style={{ color: "var(--text-primary)" }}>{advisory.body}</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatManilaDateTime(advisory.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
