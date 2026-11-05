import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// One read per session. A failed read is not cached, so the next page retries.
let cached: Promise<string | null> | null = null;

/** apk_url of the latest published Android release, or null if there is none. */
export function loadLatestApkUrl(): Promise<string | null> {
  cached ??= Promise.resolve(
    supabase
      .from("app_versions")
      .select("apk_url")
      .eq("is_published", true)
      .eq("platform", "android")
      .order("version_code", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ).then(
    ({ data, error }) => {
      if (error) {
        cached = null;
        return null;
      }
      const url = String((data as { apk_url?: unknown } | null)?.apk_url ?? "").trim();
      return /^https:\/\//i.test(url) ? url : null;
    },
    () => {
      cached = null;
      return null;
    },
  );
  return cached;
}

/** The download link, or null while loading and when there is none. */
export function useLatestApkUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadLatestApkUrl().then((next) => {
      if (!cancelled) setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return url;
}
