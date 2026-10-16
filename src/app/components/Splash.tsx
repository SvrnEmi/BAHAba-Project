import { useNavigate } from "react-router";
import { Waves } from "lucide-react";
import { ClayButton, ClayLogoBadge } from "./clay/Clay";

export function Splash() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen max-w-md mx-auto bg-background px-8">
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Logo */}
        <div className="mb-7">
          <ClayLogoBadge size={132} icon={Waves} />
        </div>

        {/* App Name */}
        <h1 className="text-4xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
          BAHAba
        </h1>

        {/* Tagline */}
        <p className="text-center text-lg" style={{ color: "var(--text-secondary)" }}>
          Community-Centered Flood Communication System
        </p>
      </div>

      {/* Get Started Button */}
      <ClayButton onClick={() => navigate("/login")} className="w-full mb-12">
        Get Started
      </ClayButton>
    </div>
  );
}
