import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

/** "Back" to the Welcome page (/), used on the public pages. */
export function BackToWelcome() {
  return (
    <Link
      to="/"
      className="clay clay-press inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold"
      style={{ color: "var(--primary-brand)" }}
    >
      <ArrowLeft size={18} aria-hidden="true" />
      Back
    </Link>
  );
}
