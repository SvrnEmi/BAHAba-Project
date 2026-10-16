import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { resetRealtime } from "./realtime";
import type { Role } from "./profile";

/*
 * App-wide auth state: the Supabase session plus the role read from the
 * profiles table for that session's user. The role is never taken from
 * browser storage, the URL, or the user metadata sent at sign-up.
 *
 * AuthProvider is mounted once at the app root; route guards
 * (components/ProtectedRoute.tsx) read it through useAuth().
 */

const ROLES: readonly Role[] = ["resident", "barangay", "mdrrmo"];

export const RESIDENT_ONLY: readonly Role[] = ["resident"];

/** Who may open each protected path. Shared by the router and the post-login redirect. */
export const ROUTE_ROLES: Record<string, readonly Role[]> = {
  "/home": RESIDENT_ONLY,
  "/alerts": RESIDENT_ONLY,
  "/reports": RESIDENT_ONLY,
  "/map": RESIDENT_ONLY,
  // Each user's own profile, reached from the avatar in the resident and barangay headers.
  // MDRRMO has no profile page; its dashboard header has its own Log out button.
  "/profile": ["resident", "barangay"],
  "/admin/barangay": ["barangay"],
  "/admin/mdrrmo": ["mdrrmo"],
  "/admin/mdrrmo/settings": ["mdrrmo"],
};

export function homeFor(role: Role): string {
  if (role === "mdrrmo") return "/admin/mdrrmo";
  if (role === "barangay") return "/admin/barangay";
  return "/home";
}

/** True when `path` (pathname, optionally with ?query) is a protected route this role may open. */
export function canAccess(role: Role, path: string): boolean {
  const pathname = path.split(/[?#]/)[0];
  return ROUTE_ROLES[pathname]?.includes(role) ?? false;
}

export function parseRole(value: unknown): Role | null {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (ROLES as readonly string[]).includes(role) ? (role as Role) : null;
}

type AuthContextValue = {
  /** False until the stored session (and its profile, if any) has been checked once. */
  ready: boolean;
  session: Session | null;
  /** Role from profiles for session.user; null while loading or when not configured. */
  role: Role | null;
  roleLoading: boolean;
  /** True after signOut() from this tab, so guards do not remember the page for after login. */
  signedOutByUser: boolean;
  /** Why the user was signed out (e.g. missing profile), shown on the login page. */
  authNotice: string | null;
  clearAuthNotice: () => void;
  /** Re-reads the role, e.g. after Register creates the profile row. */
  refreshProfile: () => void;
  signOut: (notice?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = not known yet (before INITIAL_SESSION).
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<{ userId: string; role: Role | null } | null>(null);
  const [ready, setReady] = useState(false);
  const [signedOutByUser, setSignedOutByUser] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Fires INITIAL_SESSION first, then SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED,
    // including sign-outs from other tabs and failed token refreshes.
    // No Supabase calls in here: the profile is loaded by the effect below.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "SIGNED_IN") {
        setSignedOutByUser(false);
        setAuthNotice(null);
      }
      if (!next) {
        setProfile(null);
        resetRealtime();
      }
      setSession(next);
    });
    return () => subscription.unsubscribe();
  }, []);

  const sessionKnown = session !== undefined;
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!sessionKnown) return;
    if (!userId) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Unable to load profile role:", error);
        setProfile({ userId, role: error ? null : parseRole(data?.role) });
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionKnown, userId, reloadKey]);

  const refreshProfile = useCallback(() => {
    setProfile(null);
    setReloadKey((k) => k + 1);
  }, []);

  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);

  const signOut = useCallback(async (notice?: string) => {
    setSignedOutByUser(true);
    setAuthNotice(notice ?? null);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // The local session is cleared either way; never block logout.
      console.error("Sign-out failed:", err);
    }
    // Clear even if the SIGNED_OUT event did not arrive.
    setProfile(null);
    setSession(null);
    resetRealtime();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const current = session ?? null;
    const profileMatches = !!userId && profile?.userId === userId;
    return {
      ready,
      session: current,
      role: profileMatches ? profile!.role : null,
      roleLoading: !!userId && !profileMatches,
      signedOutByUser,
      authNotice,
      clearAuthNotice,
      refreshProfile,
      signOut,
    };
  }, [ready, session, userId, profile, signedOutByUser, authNotice, clearAuthNotice, refreshProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}
