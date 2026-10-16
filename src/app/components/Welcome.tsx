import { useNavigate } from "react-router";
import { ChevronRight, LogIn, Phone, UserPlus, Waves } from "lucide-react";
import { EMERGENCY_HOTLINE, MDRRMO_HOTLINE } from "../../lib/quickReport";
import { BrandLogo } from "./BrandLogo";
import { LegalFooter } from "./LegalFooter";

/**
 * First screen at "/" for signed-out visitors (signed-in users are sent to
 * their own home by the route guard before this renders). Sized to fit a
 * phone screen without scrolling.
 */
export function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background px-6 pt-8 pb-3">
      <main className="flex flex-1 flex-col justify-center">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo size={112} />
          <h1 className="mt-4 text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
            BAHAba
          </h1>
          <p className="mt-1.5 text-[15px]" style={{ color: "var(--text-secondary)" }}>
            Flood early warning and community reports for Odiongan
          </p>
        </div>

        <div className="space-y-3">
          <button type="button" onClick={() => navigate("/login")} className="clay-btn clay-btn-primary w-full">
            <LogIn size={20} aria-hidden="true" />
            Log in
          </button>
          <button type="button" onClick={() => navigate("/register")} className="clay-btn clay-btn-secondary w-full">
            <UserPlus size={20} aria-hidden="true" />
            Create an account
          </button>
          <button
            type="button"
            onClick={() => navigate("/quick-report")}
            className="clay clay-press flex w-full items-center gap-3 px-4 py-3 text-left"
            style={{
              borderRadius: 22,
              background: "linear-gradient(135deg, #14B4CF, #0A6B88)",
              color: "#fff",
            }}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.18)" }}>
              <Waves size={22} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold leading-tight">Quick Report - no account needed</span>
              <span className="mt-0.5 block text-sm leading-tight" style={{ color: "#E6FBFF" }}>
                Report a flood in under a minute
              </span>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>

        <section className="mt-6" aria-labelledby="welcome-emergency">
          <h2 id="welcome-emergency" className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--risk-high)" }}>
            Emergency
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            <a
              href={`tel:${MDRRMO_HOTLINE.tel}`}
              className="clay-btn clay-btn-danger h-auto min-h-14 flex-col gap-0.5 whitespace-normal px-2 py-2 text-center leading-tight"
            >
              <span className="flex items-center gap-1.5 text-sm font-bold">
                <Phone size={16} aria-hidden="true" /> Call MDRRMO
              </span>
              <span className="text-xs font-semibold">{MDRRMO_HOTLINE.label}</span>
            </a>
            <a
              href={`tel:${EMERGENCY_HOTLINE.tel}`}
              className="clay-btn clay-btn-secondary h-auto min-h-14 flex-col gap-0.5 whitespace-normal px-2 py-2 text-center leading-tight"
            >
              <span className="flex items-center gap-1.5 text-base font-bold">
                <Phone size={16} aria-hidden="true" /> Call {EMERGENCY_HOTLINE.label}
              </span>
            </a>
          </div>
        </section>
      </main>

      <LegalFooter className="mt-4" />
    </div>
  );
}
