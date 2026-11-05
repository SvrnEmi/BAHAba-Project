/**
 * User-facing text for Supabase Auth failures on sign-up and password reset.
 * Keep the wording in step with bahaba_app/lib/utils/auth_errors.dart.
 */
export const ALREADY_REGISTERED_MESSAGE = "This email is already registered. Please log in or reset your password.";
export const WEAK_PASSWORD_MESSAGE = "This password is too weak. Please choose a stronger one.";
export const INVALID_EMAIL_MESSAGE = "Please enter a valid email address.";
export const NO_INTERNET_MESSAGE = "No internet connection. Please check your connection and try again.";
export const TOO_MANY_ATTEMPTS_MESSAGE = "Too many attempts. Please wait a few minutes.";
export const SERVER_BUSY_MESSAGE = "The server is busy right now. Please try again in a minute.";
export const REGISTRATION_FAILED_MESSAGE = "Registration failed. Please try again.";
export const RESET_LINK_SENT_MESSAGE = "If this email is registered, a reset link has been sent.";
export const RESET_FAILED_MESSAGE = "Could not send the reset link. Please try again.";

type AuthErrorLike = { code?: string; status?: number; message?: string; name?: string };

const asAuthError = (error: unknown): AuthErrorLike => (error ?? {}) as AuthErrorLike;

/** Logs the real error on the dev server only; production builds print nothing. */
export function logAuthError(action: string, error: unknown) {
  if (!import.meta.env.DEV) return;
  const { code, status, message } = asAuthError(error);
  console.error(`${action} failed: code=${code} status=${status} message=${message ?? error}`);
}

export function isAlreadyRegistered(error: unknown) {
  const { code, message = "" } = asAuthError(error);
  return code === "user_already_exists" || message.toLowerCase().includes("already registered");
}

/**
 * With "Confirm email" on, Supabase hides existing accounts: signUp returns no
 * error, just a placeholder user with no identities and no session.
 */
export function isDuplicateSignUp(data: { session: unknown; user: { identities?: unknown[] } | null }) {
  return !data.session && data.user?.identities?.length === 0;
}

const isRateLimited = ({ code, status }: AuthErrorLike) =>
  code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || status === 429;

const isInvalidEmail = ({ code, message = "" }: AuthErrorLike) => {
  if (code === "email_address_invalid") return true;
  const text = message.toLowerCase();
  return text.includes("email") && (text.includes("invalid") || text.includes("validate"));
};

/** No response at all from the server; the SDK reports that as status 0. */
const isNoInternet = ({ name, status, message = "" }: AuthErrorLike) =>
  (name === "AuthRetryableFetchError" && status === 0) || /failed to fetch|networkerror/i.test(message);

const isServerError = ({ status }: AuthErrorLike) => status !== undefined && status >= 500;

export function registerErrorMessage(error: unknown) {
  const authError = asAuthError(error);
  if (isAlreadyRegistered(error)) return ALREADY_REGISTERED_MESSAGE;
  if (isNoInternet(authError)) return NO_INTERNET_MESSAGE;
  if (isServerError(authError)) return SERVER_BUSY_MESSAGE;
  if (authError.code === "weak_password") return WEAK_PASSWORD_MESSAGE;
  if (isRateLimited(authError)) return TOO_MANY_ATTEMPTS_MESSAGE;
  if (isInvalidEmail(authError)) return INVALID_EMAIL_MESSAGE;
  return REGISTRATION_FAILED_MESSAGE;
}

export function resetErrorMessage(error: unknown) {
  const authError = asAuthError(error);
  if (isNoInternet(authError)) return NO_INTERNET_MESSAGE;
  if (isServerError(authError)) return SERVER_BUSY_MESSAGE;
  if (isRateLimited(authError)) return TOO_MANY_ATTEMPTS_MESSAGE;
  if (isInvalidEmail(authError)) return INVALID_EMAIL_MESSAGE;
  return RESET_FAILED_MESSAGE;
}
