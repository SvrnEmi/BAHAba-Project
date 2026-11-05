import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, ChevronRight, Droplets, ImageOff, MapPin } from "lucide-react";
import { subscribeToTable } from "../../lib/realtime";
import { fetchPostedReport, fetchPostedReports, reportPhotoUrl, type PostedReport } from "../../lib/postedReports";
import { waterLevelLabel } from "../../lib/reports";
import { errorMessage, formatManilaDateTime, relativeTime, toTime } from "../../lib/barangayAdmin";
import { STRINGS } from "../../lib/strings";

const T = STRINGS.posted;

/** Approved reports of the resident's barangay, newest first. Live on the shared community_reports channel. */
export function PostedReports({ barangay }: { barangay: string | null }) {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [rows, setRows] = useState<PostedReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const run = useRef(0);

  const load = useCallback(async () => {
    if (!barangay) return;
    const current = ++run.current;
    try {
      const next = await fetchPostedReports(barangay);
      if (current !== run.current) return;
      setRows(next);
      setError(null);
    } catch (err) {
      if (current === run.current) setError(errorMessage(err, "Unknown error"));
    }
  }, [barangay]);

  useEffect(() => {
    setRows(null);
    setError(null);
    void load();
    let timer: number | undefined;
    const unsubscribe = subscribeToTable("community_reports", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 400);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      run.current += 1;
    };
  }, [load]);

  // "View" on a pop-up with several reports lands here.
  useEffect(() => {
    if (hash === "#posted-reports" && rows) sectionRef.current?.scrollIntoView({ block: "start" });
  }, [hash, rows]);

  if (!barangay) return null;
  const now = Date.now();

  return (
    <section ref={sectionRef} id="posted-reports" className="mb-6" aria-labelledby="posted-reports-title">
      <h2 id="posted-reports-title" className="mb-2.5 text-base font-bold" style={{ color: "var(--text-primary)" }}>{T.title}</h2>
      {error && !rows ? (
        <div role="alert" className="clay p-4 text-sm" style={{ color: "var(--text-primary)" }}>
          <p>{T.loadFailed} {error}</p>
          <button type="button" className="clay-btn clay-btn-secondary mt-2" onClick={() => void load()}>{T.retry}</button>
        </div>
      ) : !rows ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{T.checking}</p>
      ) : rows.length === 0 ? (
        <p className="clay p-4 text-sm" style={{ color: "var(--text-secondary)" }}>{T.none}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((report) => {
            const location = report.location?.trim() || T.unknownLocation;
            const when = relativeTime(toTime(report.timestamp), now);
            return (
              <li key={report.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/reports/${report.id}`)}
                  aria-label={T.open(location, waterLevelLabel(report.water_level), when)}
                  className="clay clay-press flex min-h-12 w-full items-center gap-3 p-3 text-left"
                >
                  {report.photo_path && <Thumbnail path={report.photo_path} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold" style={{ color: "var(--text-primary)" }}>{location}</span>
                    <span className="block text-[13px]" style={{ color: "var(--text-primary)" }}>{waterLevelLabel(report.water_level)}</span>
                    <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>{when}</span>
                    <span className="block truncate text-xs" style={{ color: "var(--text-secondary)" }}>{T.by(report.barangay ?? barangay)}</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Thumbnail({ path }: { path: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={reportPhotoUrl(path)}
      alt=""
      loading="lazy"
      decoding="async"
      width={64}
      height={64}
      className="h-16 w-16 shrink-0 rounded-xl object-cover"
      onError={() => setFailed(true)}
    />
  );
}

/** The full report, at /reports/:id. */
export function PostedReportPage() {
  const { id } = useParams();
  const reportId = Number(id);
  const [state, setState] = useState<{ kind: "loading" } | { kind: "missing" } | { kind: "failed"; error: string } | { kind: "report"; report: PostedReport }>({ kind: "loading" });
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    if (!Number.isInteger(reportId)) {
      setState({ kind: "missing" });
      return;
    }
    fetchPostedReport(reportId).then(
      (report) => {
        if (!cancelled) setState(report ? { kind: "report", report } : { kind: "missing" });
      },
      (err: unknown) => {
        if (!cancelled) setState({ kind: "failed", error: errorMessage(err, "Unknown error") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  return (
    <div className="p-4">
      <Link to="/home" className="mb-3 inline-flex min-h-12 items-center gap-1 text-sm font-semibold" style={{ color: "var(--primary-shade)" }}>
        <ArrowLeft size={18} aria-hidden="true" /> {T.back}
      </Link>
      {state.kind === "loading" ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{T.checking}</p>
      ) : state.kind === "failed" ? (
        <p role="alert" className="clay p-4 text-sm">{T.loadFailed} {state.error}</p>
      ) : state.kind === "missing" ? (
        <p className="clay p-4 text-sm">{T.missing}</p>
      ) : (
        <article className="clay space-y-3 p-5">
          <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{state.report.location?.trim() || T.unknownLocation}</h1>
          <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            <Droplets size={16} aria-hidden="true" /> {waterLevelLabel(state.report.water_level)}
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{formatManilaDateTime(state.report.timestamp)}</p>
          {state.report.barangay && (
            <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              <MapPin size={14} aria-hidden="true" /> {T.by(state.report.barangay)}
            </p>
          )}
          {state.report.description?.trim() && <p className="whitespace-pre-wrap break-words text-sm">{state.report.description}</p>}
          {state.report.photo_path &&
            (photoFailed ? (
              <p className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                <ImageOff size={14} aria-hidden="true" /> {T.photoUnavailable}
              </p>
            ) : (
              <img src={reportPhotoUrl(state.report.photo_path)} alt={T.photoAlt} className="max-h-96 w-full rounded-2xl object-cover" onError={() => setPhotoFailed(true)} />
            ))}
        </article>
      )}
    </div>
  );
}
