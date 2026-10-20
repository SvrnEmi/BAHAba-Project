import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Loader, MessageSquare, RefreshCw, Send, Trash2 } from "lucide-react";
import {
  EMPTY_THREAD_TEXT,
  MESSAGE_COUNTER_FROM,
  MESSAGE_MAX_LENGTH,
  SENDER_LABELS,
  deleteReportMessage,
  errorText,
  getThreadLastSeen,
  hasNewMessage,
  markThreadSeen,
  sendReportMessage,
  sendableBody,
  useReportThread,
  type LatestMessage,
  type ReportMessage,
  type SenderRole,
} from "../../lib/reportMessages";

/*
 * "Messages" section on a report card: a collapsible thread between the
 * resident and staff (Barangay / MDRRMO). The thread loads and subscribes
 * only while open. Bodies are rendered as plain text.
 */

type LegacyReply = { body: string | null; at: string | null };

const timeFormat = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const formatWhen = (iso: string) => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? "" : timeFormat.format(t);
};

/** Red dot plus the word "New" (not color alone); screen readers hear "New messages". */
export function NewDot({ suffix = "messages" }: { suffix?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--risk-high)" }}>
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--risk-high)" }} />
      <span>New</span>
      <span className="sr-only"> {suffix}</span>
    </span>
  );
}

export function ReportMessages({
  reportId,
  viewerRole,
  userId,
  latest,
  onLatest,
  legacyReply,
  canDelete = false,
}: {
  reportId: number;
  viewerRole: SenderRole;
  userId: string | null;
  /** Latest message from the list-level query, for the "New" dot while closed. */
  latest?: LatestMessage | null;
  onLatest?: (reportId: number, message: LatestMessage | null) => void;
  /** The old single admin reply, shown as the first MDRRMO message. */
  legacyReply?: LegacyReply;
  canDelete?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(() => (userId ? getThreadLastSeen(userId, reportId) : 0));
  const isNew = hasNewMessage(latest, viewerRole, lastSeen);

  return (
    <section className="mt-3 border-t pt-3" aria-label="Messages">
      <button
        type="button"
        className="flex min-h-12 w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        aria-controls={`report-${reportId}-messages`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          <MessageSquare size={16} aria-hidden="true" style={{ color: "var(--primary-brand)" }} />
          Messages
          {isNew && !open && <NewDot />}
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--text-secondary)" }}
        />
      </button>
      {open && (
        <div id={`report-${reportId}-messages`}>
          <Thread
            reportId={reportId}
            viewerRole={viewerRole}
            legacyReply={legacyReply}
            canDelete={canDelete}
            onLatest={(message) => {
              if (message && userId) {
                markThreadSeen(userId, reportId, message.created_at);
                setLastSeen(getThreadLastSeen(userId, reportId));
              }
              onLatest?.(reportId, message);
            }}
          />
        </div>
      )}
    </section>
  );
}

function Thread({
  reportId,
  viewerRole,
  legacyReply,
  canDelete,
  onLatest,
}: {
  reportId: number;
  viewerRole: SenderRole;
  legacyReply?: LegacyReply;
  canDelete: boolean;
  onLatest: (message: LatestMessage | null) => void;
}) {
  const { messages, loading, error, add, remove, reload } = useReportThread(reportId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<ReportMessage["id"] | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const onLatestRef = useRef(onLatest);
  onLatestRef.current = onLatest;

  const legacy = legacyReply?.body?.trim() ? legacyReply : null;
  const last = messages[messages.length - 1] ?? null;

  useEffect(() => {
    if (loading) return;
    onLatestRef.current(last ? { sender_role: last.sender_role, created_at: last.created_at } : null);
  }, [loading, last]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  const body = sendableBody(draft);
  const length = draft.trim().length;

  const send = async () => {
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      add(await sendReportMessage(reportId, body));
      setDraft("");
    } catch (err) {
      // e.g. "Please wait for a reply..." after 3 resident messages in a row.
      setSendError(errorText(err, "Unable to send the message."));
    } finally {
      setSending(false);
    }
  };

  const removeMessage = async (message: ReportMessage) => {
    if (!window.confirm("Delete this message? Everyone on this report will stop seeing it. This cannot be undone.")) return;
    setDeletingId(message.id);
    setSendError(null);
    try {
      await deleteReportMessage(message.id);
      remove(message.id);
    } catch (err) {
      setSendError(errorText(err, "Unable to delete the message."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3 pt-1">
      {error ? (
        <div className="space-y-2">
          <p role="alert" className="bg-white px-3 py-2 text-sm" style={{ borderLeft: "4px solid var(--risk-high)", color: "var(--text-primary)" }}>
            Could not load messages: {error}
          </p>
          <button type="button" className="clay-btn clay-btn-secondary" onClick={reload}>
            <RefreshCw size={16} aria-hidden="true" /> Retry
          </button>
        </div>
      ) : loading ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }} aria-busy="true">Loading messages...</p>
      ) : !legacy && messages.length === 0 ? (
        <p className="clay-well rounded-2xl px-4 py-3 text-sm" style={{ color: "var(--text-secondary)" }}>{EMPTY_THREAD_TEXT}</p>
      ) : (
        <ol ref={listRef} className="clay-well max-h-80 space-y-3 overflow-y-auto rounded-2xl p-3" aria-label="Message thread">
          {legacy && (
            <Bubble
              own={viewerRole === "mdrrmo"}
              role="mdrrmo"
              body={legacy.body ?? ""}
              when={legacy.at}
              note="Earlier reply"
            />
          )}
          {messages.map((m) => (
            <Bubble
              key={m.id}
              own={m.sender_role === viewerRole}
              role={m.sender_role}
              body={m.body}
              when={m.created_at}
              action={
                canDelete ? (
                  <button
                    type="button"
                    className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold underline"
                    style={{ color: "var(--risk-high)" }}
                    disabled={deletingId != null}
                    onClick={() => void removeMessage(m)}
                  >
                    {deletingId === m.id ? <Loader size={12} className="animate-spin" aria-hidden="true" /> : <Trash2 size={12} aria-hidden="true" />}
                    Delete message
                  </button>
                ) : null
              }
            />
          ))}
        </ol>
      )}

      <div>
        <label className="sr-only" htmlFor={`report-${reportId}-message-input`}>Write a message</label>
        <textarea
          id={`report-${reportId}-message-input`}
          className="clay-input text-sm"
          rows={2}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder="Write a message"
          value={draft}
          disabled={sending}
          aria-describedby={sendError ? `report-${reportId}-message-error` : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (sendError) setSendError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs" style={{ color: length > MESSAGE_MAX_LENGTH ? "var(--risk-high)" : "var(--text-secondary)" }} aria-live="polite">
            {length >= MESSAGE_COUNTER_FROM ? `${length}/${MESSAGE_MAX_LENGTH}` : ""}
          </span>
          <button type="button" className="clay-btn clay-btn-primary" disabled={!body || sending} onClick={() => void send()}>
            {sending ? <Loader size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
        {sendError && (
          <p id={`report-${reportId}-message-error`} role="alert" className="mt-2 text-sm" style={{ color: "var(--risk-high)" }}>
            {sendError}
          </p>
        )}
      </div>
    </div>
  );
}

function Bubble({
  own,
  role,
  body,
  when,
  note,
  action,
}: {
  own: boolean;
  role: SenderRole;
  body: string;
  when: string | null;
  note?: string;
  action?: ReactNode;
}) {
  const label = own ? "You" : SENDER_LABELS[role] ?? "Staff";
  return (
    <li className={`flex flex-col ${own ? "items-end" : "items-start"}`}>
      <span className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: own ? "var(--text-secondary)" : "var(--primary-shade)" }}>
        {label}
        {note ? ` · ${note}` : ""}
      </span>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${own ? "rounded-br-md" : "rounded-bl-md"}`}
        style={
          own
            ? { background: "linear-gradient(to bottom right, var(--btn-from), var(--btn-to))", color: "#fff" }
            : { background: "var(--clay-gradient)", color: "var(--text-primary)", boxShadow: "3px 3px 8px var(--clay-shade)" }
        }
      >
        {/* Plain text only: React escapes it; no links, no HTML. */}
        <p className="whitespace-pre-wrap break-words">{body}</p>
      </div>
      <span className="mt-1 flex items-center gap-3 px-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
        {when ? formatWhen(when) : ""}
        {action}
      </span>
    </li>
  );
}
