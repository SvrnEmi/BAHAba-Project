import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export type Role = "resident" | "barangay" | "mdrrmo";
export type AlertLevelPref = "advisory" | "warning" | "critical";
export type NotificationPrefs = { push: boolean; levels: AlertLevelPref[] };

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push: true,
  levels: ["advisory", "warning", "critical"],
};

export function roleLabel(role: string | null | undefined): string {
  if (role === "barangay") return "Barangay Admin";
  if (role === "mdrrmo") return "MDRRMO";
  return "Resident";
}

/** "Juan Dela Cruz" -> "JC"; emails use the part before "@". */
export function initials(name: string | null | undefined): string {
  const base = (name ?? "").split("@")[0].trim();
  const words = base.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function validateName(name: string): string | null {
  return name.trim() ? null : "Please enter your name.";
}

/** Digits, "+" and "-" only, 7 to 15 characters. */
export function validatePhone(phone: string): string | null {
  return /^[0-9+-]{7,15}$/.test(phone.trim())
    ? null
    : "Phone must be 7-15 characters using digits, + or - only.";
}

export function validatePassword(password: string, confirm: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

/** Reads profiles.notification_prefs defensively; critical is always on. */
export function parseNotificationPrefs(value: unknown): NotificationPrefs {
  if (!value || typeof value !== "object") return DEFAULT_NOTIFICATION_PREFS;
  const raw = value as { push?: unknown; levels?: unknown };
  const levels = Array.isArray(raw.levels)
    ? raw.levels.filter((l): l is AlertLevelPref => l === "advisory" || l === "warning" || l === "critical")
    : DEFAULT_NOTIFICATION_PREFS.levels;
  return {
    push: typeof raw.push === "boolean" ? raw.push : true,
    levels: levels.includes("critical") ? levels : [...levels, "critical"],
  };
}

/**
 * Signed-in user's display name (profiles.name, falling back to email) for
 * header avatars. One read; no realtime.
 */
export function useMyDisplayName(): string | null {
  const [name, setName] = useState<string | null>(null);
  // The shared session (no auth-server round trip), as on the Profile page.
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setName((data?.name as string | undefined) ?? email);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, email]);
  return name;
}
