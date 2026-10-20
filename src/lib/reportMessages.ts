import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/*
 * Two-way message threads on community reports (public.report_messages).
 *
 * The server sets sender_id and sender_role from the session, so inserts
 * only ever send { report_id, body }. It also enforces the 1-1000 character
 * limit and stops a resident after 3 messages in a row until staff reply
 * ("Please wait for a reply..."). Bodies are plain text: render them as
 * text nodes only, never as HTML, and never turn them into links.
 *
 * "New" dots: the last-seen message time per report is kept per user in
 * localStorage (no database column). Every access is in try/catch because
 * storage can be blocked.
 */

export type SenderRole = "resident" | "barangay" | "mdrrmo";

export type ReportMessage = {
  id: number | string;
  sender_role: SenderRole;
  body: string;
  created_at: string;
};

export type LatestMessage = { sender_role: SenderRole; created_at: string };

export const MESSAGE_MAX_LENGTH = 1000;
/** The character counter appears once a draft reaches this length. */
export const MESSAGE_COUNTER_FROM = 800;
export const EMPTY_THREAD_TEXT = "No messages yet. Ask or update here.";

const MESSAGE_COLUMNS = "id, sender_role, body, created_at";

export const SENDER_LABELS: Record<SenderRole, string> = {
  resident: "Resident",
  barangay: "Barangay",
  mdrrmo: "MDRRMO",
};

const toTime = (iso: string | null | undefined) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

const toMessage = (row: Record<string, unknown>): ReportMessage => ({
  id: row.id as number | string,
  sender_role: row.sender_role as SenderRole,
  body: typeof row.body === "string" ? row.body : "",
  created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
});

const byCreatedAt = (a: ReportMessage, b: ReportMessage) => toTime(a.created_at) - toTime(b.created_at);

/** Trimmed body, or null when it cannot be sent (empty or over the limit). */
export function sendableBody(draft: string): string | null {
  const body = draft.trim();
  return body.length >= 1 && body.length <= MESSAGE_MAX_LENGTH ? body : null;
}

export const errorText = (err: unknown, fallback: string) =>
  err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
    ? (err as { message: string }).message
    : fallback;

// ---------- Last seen ("New" dot) ----------

const SEEN_KEY = (userId: string) => `bahaba_report_messages_seen_${userId}`;

function readSeenMap(userId: string): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY(userId)) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function getThreadLastSeen(userId: string, reportId: number): number {
  const value = Number(readSeenMap(userId)[String(reportId)]);
  return Number.isFinite(value) ? value : 0;
}

/** Remembers that this user has seen the thread up to `createdAt`. */
export function markThreadSeen(userId: string, reportId: number, createdAt: string) {
  const t = toTime(createdAt);
  if (!t) return;
  try {
    const map = readSeenMap(userId);
    if ((map[String(reportId)] ?? 0) >= t) return;
    map[String(reportId)] = t;
    localStorage.setItem(SEEN_KEY(userId), JSON.stringify(map));
  } catch {
    // Storage blocked: the dot just comes back after a reload.
  }
}

/** True when the latest message is from another role and newer than last seen. */
export function hasNewMessage(latest: LatestMessage | null | undefined, viewerRole: SenderRole, lastSeen: number): boolean {
  if (!latest || latest.sender_role === viewerRole) return false;
  return toTime(latest.created_at) > lastSeen;
}

// ---------- Data ----------

export async function sendReportMessage(reportId: number, draft: string): Promise<ReportMessage> {
  const body = sendableBody(draft);
  if (!body) throw new Error(`Write 1-${MESSAGE_MAX_LENGTH} characters.`);
  // sender_id / sender_role are set by the server; never send them.
  const { data, error } = await supabase
    .from("report_messages")
    .insert({ report_id: reportId, body })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw error;
  return toMessage(data as Record<string, unknown>);
}

export async function deleteReportMessage(id: ReportMessage["id"]) {
  const { data, error } = await supabase.from("report_messages").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The message was not deleted (it may already be gone).");
}

/**
 * Latest message per report for the "New" dots: one request for the whole
 * list, no realtime. Open threads report their own updates via onLatest.
 */
export function useLatestMessages(reportIds: number[]) {
  const [latest, setLatest] = useState<Record<number, LatestMessage>>({});
  const key = [...reportIds].sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!key) {
      setLatest({});
      return;
    }
    let cancelled = false;
    void supabase
      .from("report_messages")
      .select("report_id, sender_role, created_at")
      .in("report_id", key.split(",").map(Number))
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const next: Record<number, LatestMessage> = {};
        for (const row of data as Array<LatestMessage & { report_id: number }>) {
          if (!next[row.report_id]) next[row.report_id] = { sender_role: row.sender_role, created_at: row.created_at };
        }
        setLatest(next);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = useCallback((reportId: number, message: LatestMessage | null) => {
    setLatest((current) => {
      const next = { ...current };
      if (message) next[reportId] = message;
      else delete next[reportId];
      return next;
    });
  }, []);

  return { latest, update };
}

let channelSeq = 0;

/**
 * Loads one report's thread and listens for new messages on a channel
 * filtered to that report. The channel is removed on unmount.
 */
export function useReportThread(reportId: number) {
  const [messages, setMessages] = useState<ReportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const add = useCallback((message: ReportMessage) => {
    setMessages((current) =>
      current.some((m) => String(m.id) === String(message.id)) ? current : [...current, message].sort(byCreatedAt),
    );
  }, []);

  const remove = useCallback((id: ReportMessage["id"]) => {
    setMessages((current) => current.filter((m) => String(m.id) !== String(id)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void supabase
      .from("report_messages")
      .select(MESSAGE_COLUMNS)
      .eq("report_id", reportId)
      .order("created_at", { ascending: true })
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) {
          setError(errorText(loadError, "Unable to load messages."));
        } else {
          // Merge, in case a realtime insert arrived before the first read.
          const loaded = ((data as Record<string, unknown>[]) ?? []).map(toMessage);
          setMessages((current) => {
            const ids = new Set(loaded.map((m) => String(m.id)));
            return [...loaded, ...current.filter((m) => !ids.has(String(m.id)))].sort(byCreatedAt);
          });
        }
        setLoading(false);
      });

    const channel: RealtimeChannel = supabase
      .channel(`report-messages-${reportId}-${++channelSeq}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "report_messages", filter: `report_id=eq.${reportId}` },
        (payload) => {
          if (!cancelled) add(toMessage(payload.new as Record<string, unknown>));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      setMessages([]);
    };
  }, [reportId, reloadKey, add]);

  return { messages, loading, error, add, remove, reload: () => setReloadKey((k) => k + 1) };
}
