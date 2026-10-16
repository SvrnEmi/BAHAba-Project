import { Link } from "react-router";

/** Terms / Privacy links for the public pages (Welcome, Login, Register). */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`flex items-center justify-center gap-4 text-sm ${className}`}>
      <Link to="/terms" className="flex min-h-11 items-center px-1 font-semibold hover:underline" style={{ color: "var(--primary-shade)" }}>
        Terms of Service
      </Link>
      <span aria-hidden="true" style={{ color: "var(--text-secondary)" }}>·</span>
      <Link to="/privacy" className="flex min-h-11 items-center px-1 font-semibold hover:underline" style={{ color: "var(--primary-shade)" }}>
        Privacy Policy
      </Link>
    </footer>
  );
}
