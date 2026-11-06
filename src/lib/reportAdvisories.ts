import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { subscribeToTable } from "./realtime";

/*
 * Advisories on community reports (public.report_advisories). The database
 * sets barangay, author_id, author_role, author_name and created_at, so inserts
 * only ever send { report_id, body }. Bodies are plain text: render them as
 * text nodes only.
 *
 * Unlike a comment in the message thread, an advisory is public: residents see
 * it on the posted report once the report is verified. The reporter sees it on
 * their own report at any status.
 */

export type ReportAdvisory = {
  id: number;
  report_id: number;
  barangay: string | null;
  author_id: string;
  author_role: string;
  author_name: string | null;
  body: string;
  created_at: string;
};

export const ADVISORY_COLUMNS = "id, report_id, barangay, author_id, author_role, author_name, body, created_at";
export const ADVISORY_MIN_LENGTH = 3;
export const ADVISORY_MAX_LENGTH = 300;

export const advisoryRoleLabel = (role: string) => (role === "mdrrmo" ? "MDRRMO" : "Barangay");
export const advisoryAuthor = (advisory: Pick<ReportAdvisory, "author_name" | "author_role">) =>
  advisory.author_name?.trim() || advisoryRoleLabel(advisory.author_role);

/** Trimmed body, or null when it cannot be posted (the database counts trimmed characters). */
export function postableAdvisory(draft: string): string | null {
  const body = draft.trim();
  return body.length >= ADVISORY_MIN_LENGTH && body.length <= ADVISORY_MAX_LENGTH ? body : null;
}

const newestFirst = (a: ReportAdvisory, b: ReportAdvisory) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

export async function postAdvisory(reportId: number, draft: string): Promise<ReportAdvisory> {
  const body = postableAdvisory(draft);
  if (!body) throw new Error(`Write ${ADVISORY_MIN_LENGTH}-${ADVISORY_MAX_LENGTH} characters.`);
  const { data, error } = await supabase.from("report_advisories").insert({ report_id: reportId, body }).select(ADVISORY_COLUMNS).single();
  if (error) throw error;
  return data as unknown as ReportAdvisory;
}

export async function deleteAdvisory(id: number) {
  const { data, error } = await supabase.from("report_advisories").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("The advisory was not deleted (it may already be gone).");
}

export async function fetchAdvisories(reportIds: number[]): Promise<ReportAdvisory[]> {
  if (reportIds.length === 0) return [];
  const { data, error } = await supabase
    .from("report_advisories")
    .select(ADVISORY_COLUMNS)
    .in("report_id", reportIds)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as ReportAdvisory[];
}

/**
 * Advisories of the given reports, newest first, live on the shared channel.
 * A DELETE event only carries the id, so removals match on id across the list.
 */
export function useReportAdvisories(reportIds: number[]) {
  const [rows, setRows] = useState<ReportAdvisory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = [...reportIds].sort((a, b) => a - b).join(",");

  useEffect(() => {
    const ids = key ? key.split(",").map(Number) : [];
    const wanted = new Set(ids);
    let cancelled = false;
    setLoading(true);
    setError(null);

    const add = (row: ReportAdvisory) =>
      setRows((current) => (current.some((a) => a.id === row.id) ? current : [row, ...current].sort(newestFirst)));

    fetchAdvisories(ids).then(
      (loaded) => {
        if (cancelled) return;
        // Merge, in case a live insert arrived before the first read.
        setRows((current) => {
          const known = new Set(loaded.map((a) => a.id));
          return [...loaded, ...current.filter((a) => !known.has(a.id) && wanted.has(a.report_id))].sort(newestFirst);
        });
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load advisories.");
        setLoading(false);
      },
    );

    const unsubscribe = subscribeToTable("report_advisories", (change) => {
      if (cancelled) return;
      if (change.eventType === "DELETE") {
        const id = Number((change.old as { id?: unknown }).id);
        setRows((current) => current.filter((a) => a.id !== id));
      } else if (change.eventType === "INSERT") {
        const row = change.new as unknown as ReportAdvisory;
        if (wanted.has(row.report_id)) add(row);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key]);

  const added = (row: ReportAdvisory) =>
    setRows((current) => (current.some((a) => a.id === row.id) ? current : [row, ...current].sort(newestFirst)));
  const removed = (id: number) => setRows((current) => current.filter((a) => a.id !== id));

  return { rows, loading, error, added, removed };
}
