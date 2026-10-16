import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { canAccess, homeFor, useAuth } from "../../lib/auth";
import type { Role } from "../../lib/profile";

export type RedirectState = { from?: string };

/** Small full-screen placeholder shown while the session / profile role is being checked. */
export function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p role="status" className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Loading...
      </p>
    </div>
  );
}

/**
 * Renders children only once the signed-in user's role (from profiles) is in
 * allowedRoles. Signed out -> /login (remembering this page); wrong role ->
 * that user's own home. Children never mount before the role is confirmed,
 * so their data queries and realtime channels never start early.
 */
export function ProtectedRoute({ allowedRoles, children }: { allowedRoles: readonly Role[]; children: ReactNode }) {
  const { ready, session, role, roleLoading, signedOutByUser } = useAuth();
  const location = useLocation();

  if (!ready || roleLoading) return <AuthLoading />;

  if (!session) {
    const state: RedirectState | undefined = signedOutByUser
      ? undefined
      : { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }

  if (!role) return <SignOutMissingProfile />;

  if (!allowedRoles.includes(role)) return <Navigate to={homeFor(role)} replace />;

  return <>{children}</>;
}

/**
 * Login / register / splash: a signed-in user with a valid role is sent to the
 * page they were headed for (if their role allows it) or their own home.
 */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { ready, session, role } = useAuth();
  const location = useLocation();

  // Only the first check blanks the screen; after that the form stays mounted
  // while a sign-in loads the role, so its errors are not lost.
  if (!ready) return <AuthLoading />;

  if (session && role) {
    const from = (location.state as RedirectState | null)?.from;
    const target = from && from.startsWith("/") && canAccess(role, from) ? from : homeFor(role);
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}

/** "/", catch-all and legacy entry points: the user's own home, or /login when signed out. */
export function RoleHomeRedirect() {
  const { ready, session, role, roleLoading } = useAuth();
  if (!ready || roleLoading) return <AuthLoading />;
  if (session && !role) return <SignOutMissingProfile />;
  return <Navigate to={session && role ? homeFor(role) : "/login"} replace />;
}

/**
 * Signed in, but the profile row is missing or failed to load: never guess a
 * role. Sign out; with the session gone the guard then sends the user to
 * /login, which shows the notice.
 */
function SignOutMissingProfile() {
  const { signOut } = useAuth();
  useEffect(() => {
    void signOut("We couldn't load your account profile, so you were signed out. Please sign in again or contact your administrator.");
  }, [signOut]);
  return <AuthLoading />;
}
