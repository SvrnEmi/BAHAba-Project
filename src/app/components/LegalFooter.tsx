import { Link } from "react-router";
import { useLatestApkUrl } from "../../lib/appVersions";

/** Terms / Privacy links for the public pages, plus the app download when one is published. */
export function LegalFooter({ className = "" }: { className?: string }) {
  const apkUrl = useLatestApkUrl();

  return (
    <footer className={`flex flex-wrap items-center justify-center gap-x-4 text-sm ${className}`}>
      <Link to="/terms" className="flex min-h-11 items-center px-1 font-semibold hover:underline" style={{ color: "var(--primary-shade)" }}>
        Terms of Service
      </Link>
      <span aria-hidden="true" style={{ color: "var(--text-secondary)" }}>·</span>
      <Link to="/privacy" className="flex min-h-11 items-center px-1 font-semibold hover:underline" style={{ color: "var(--primary-shade)" }}>
        Privacy Policy
      </Link>
      {apkUrl && (
        <>
          <span aria-hidden="true" style={{ color: "var(--text-secondary)" }}>·</span>
          <a href={apkUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center px-1 font-semibold hover:underline" style={{ color: "var(--primary-shade)" }}>
            Download the Android app
          </a>
        </>
      )}
    </footer>
  );
}
