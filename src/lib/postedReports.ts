import { supabase } from "./supabase";

/*
 * Approved community reports for residents. The reporter's name is never
 * selected here: these screens say "Reported by a resident of {barangay}".
 */

export type PostedReport = {
  id: number;
  location: string | null;
  water_level: string | null;
  description: string | null;
  photo_path: string | null;
  timestamp: string;
  barangay: string | null;
};

const COLUMNS = "id, location, water_level, description, photo_path, timestamp, barangay";
const FEED_LIMIT = 20;

/** Newer reports store a full URL; a bare path is resolved in the public bucket. */
export function reportPhotoUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from("report-photos").getPublicUrl(path).data.publicUrl;
}

export async function fetchPostedReports(barangay: string): Promise<PostedReport[]> {
  const { data, error } = await supabase
    .from("community_reports")
    .select(COLUMNS)
    .eq("status", "approved")
    .eq("barangay", barangay)
    .order("timestamp", { ascending: false })
    .limit(FEED_LIMIT);
  if (error) throw error;
  return (data ?? []) as PostedReport[];
}

export async function fetchPostedReport(id: number): Promise<PostedReport | null> {
  const { data, error } = await supabase
    .from("community_reports")
    .select(COLUMNS)
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw error;
  return data as PostedReport | null;
}
