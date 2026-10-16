import { useState } from "react";
import { useNavigate } from "react-router";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { parseRole, useAuth } from "../../lib/auth";
import { BrandLogo } from "./BrandLogo";
import { LegalFooter } from "./LegalFooter";
import { BackToWelcome } from "./BackToWelcome";

const getFriendlyAuthError = (error: unknown) => {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("invalid login credentials") || normalized.includes("user not found")) {
    return "Incorrect email or password. Please try again.";
  }

  if (normalized.includes("email not confirmed") || normalized.includes("confirm your email") || normalized.includes("not confirmed")) {
    return "Your email address has not been confirmed yet. Please check your inbox or resend the confirmation email.";
  }

  if (normalized.includes("email rate limit exceeded") || normalized.includes("too many requests")) {
    return "Too many sign-in attempts. Please wait a moment before trying again.";
  }

  if (normalized.includes("invalid email")) {
    return "Please enter a valid email address.";
  }

  if (normalized.includes("password") && normalized.includes("required")) {
    return "Password is required.";
  }

  if (normalized.includes("rate limit")) {
    return "The service is temporarily rate-limited. Please wait a few moments and try again.";
  }

  return rawMessage || "Unable to sign in. Please try again.";
};

export function Login() {
  const navigate = useNavigate();
  const { signOut, authNotice, clearAuthNotice } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const handleResendConfirmation = async () => {
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }

    setError(null);
    setResendMessage(null);
    setIsResending(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
      });

      if (resendError) {
        throw resendError;
      }

      setResendMessage("A confirmation email has been resent. Please check your inbox.");
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setIsResending(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }

    setError(null);
    clearAuthNotice();
    setIsSubmitting(true);

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        throw signInError;
      }

      const userId = signInData.user?.id;
      if (!userId) {
        throw new Error("Unable to identify your account after sign-in. Please try again.");
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        await signOut();
        throw new Error("Unable to load your account profile. Please try again.");
      }

      if (!parseRole(profileData?.role)) {
        await signOut();
        throw new Error("Your account role is not configured. Please contact your administrator.");
      }

      // Signed in with a valid role: PublicOnlyRoute redirects to the remembered
      // page (if this role may open it) or the role's own home.
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-background flex flex-col">
      <div className="px-6 pt-4">
        <BackToWelcome />
      </div>
      <div className="flex-1 flex flex-col justify-center px-6 pb-8">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-5">
            <BrandLogo size={104} />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Welcome Back</h1>
          <p className="text-center" style={{ color: "var(--text-secondary)" }}>Sign in to access BAHAba</p>
        </div>

        <form onSubmit={handleLogin} className="clay space-y-4 p-5" style={{ borderRadius: 28 }}>
          <div>
            <label className="clay-label">Email</label>
            <div className="relative">
              <Mail
                size={20}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="your.email@example.com"
                className="clay-input has-icon-left"
                required
              />
            </div>
          </div>

          <div>
            <label className="clay-label">Password</label>
            <div className="relative">
              <Lock
                size={20}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter your password"
                className="clay-input has-icon-left has-icon-right"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-gray-500"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex min-h-12 items-center" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" className="mr-2 rounded" />
              Remember me
            </label>
            <button type="button" className="min-h-12 px-2 font-semibold hover:underline" style={{ color: "var(--primary-shade)" }}>
              Forgot password?
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {!error && authNotice && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {authNotice}
            </div>
          )}

          {resendMessage && (
            <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {resendMessage}
            </div>
          )}

          {error && error.toLowerCase().includes("confirm") && (
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={isResending}
              className="clay-btn clay-btn-secondary w-full"
            >
              {isResending ? "Sending..." : "Resend confirmation email"}
            </button>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !email.trim() || !password.trim()}
            className="clay-btn clay-btn-primary w-full"
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px" style={{ background: "var(--border)" }}></div>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>or</span>
          <div className="flex-1 h-px" style={{ background: "var(--border)" }}></div>
        </div>

        <div className="text-center">
          <p className="mb-3" style={{ color: "var(--text-secondary)" }}>Don't have an account?</p>
          <button
            onClick={() => navigate("/register")}
            className="clay-btn clay-btn-secondary w-full"
          >
            Create Account
          </button>
        </div>

        <LegalFooter className="mt-6" />
      </div>
    </div>
  );
}