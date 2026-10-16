import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/*
 * One shared Realtime channel per table, reference-counted.
 *
 * Screens call subscribeToTable() in a useEffect and call the returned
 * function in the cleanup. The first listener opens the table's channel;
 * the last one to leave removes it with supabase.removeChannel. Listeners
 * get every INSERT/UPDATE/DELETE for the table and filter themselves
 * (row-level security still applies server-side).
 */

export type TableChange<T extends Record<string, unknown> = Record<string, unknown>> =
  RealtimePostgresChangesPayload<T>;
type Listener = (change: TableChange) => void;

type SharedChannel = { channel: RealtimeChannel; listeners: Set<Listener> };

const channels = new Map<string, SharedChannel>();
let topicSeq = 0;

/** Dev only: logs how many Realtime channels the client holds (target: 3-5 per signed-in user). */
function logChannelCount(reason: string) {
  if (!import.meta.env.DEV) return;
  console.debug(`[realtime] ${reason} -> ${supabase.getChannels().length} active channel(s)`, [...channels.keys()]);
}

export function subscribeToTable<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
  listener: (change: TableChange<T>) => void,
): () => void {
  let shared = channels.get(table);
  if (!shared) {
    const listeners = new Set<Listener>();
    // Unique topic per open, so a channel that is still being removed never
    // collides with its replacement (e.g. fast remounts).
    const channel = supabase
      .channel(`table-${table}-${++topicSeq}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (change) => {
        for (const fn of listeners) fn(change);
      })
      .subscribe();
    shared = { channel, listeners };
    channels.set(table, shared);
    logChannelCount(`opened ${table}`);
  }

  const fn = listener as Listener;
  shared.listeners.add(fn);

  const mine = shared;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const current = channels.get(table);
    // Missing or replaced: already dropped by resetRealtime() (sign-out).
    if (current !== mine) return;
    current.listeners.delete(fn);
    if (current.listeners.size === 0) {
      channels.delete(table);
      void supabase.removeChannel(current.channel).then(() => logChannelCount(`closed ${table}`));
    }
  };
}

/** Closes every shared channel (used on sign-out); later subscribes open fresh ones. */
export function resetRealtime() {
  channels.clear();
  void supabase.removeAllChannels().then(() => logChannelCount("reset"));
}
