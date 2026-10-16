import { supabase } from "./supabase";

/**
 * Appends a row to audit_logs as the signed-in admin. Returns the database
 * error message, or null when written, so callers can say the change was
 * saved but not logged (the change itself is never rolled back).
 */
export async function writeAuditLog(action: string, userName: string, details: string): Promise<string | null> {
  const { error } = await supabase.from("audit_logs").insert({
    action,
    user_name: userName,
    timestamp: new Date().toISOString(),
    details,
  });
  if (error) {
    console.error(`Unable to write audit log (${action}):`, error);
    return error.message;
  }
  return null;
}

/** "field: old -> new" for each changed field, joined with "; ". */
export function describeChanges(before: Record<string, unknown>, after: Record<string, unknown>): string {
  return Object.keys(after)
    .filter((key) => before[key] !== after[key])
    .map((key) => `${key}: ${String(before[key] ?? "none")} -> ${String(after[key] ?? "none")}`)
    .join("; ");
}
