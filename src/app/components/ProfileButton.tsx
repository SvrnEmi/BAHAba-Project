import { useNavigate } from "react-router";
import { initials } from "../../lib/profile";

/** Round clay avatar with the user's initials; opens /profile. 44px inside a 48px tap target. */
export function ProfileButton({ name }: { name: string | null }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/profile")}
      aria-label="Open your profile"
      title="Profile"
      className="flex h-12 w-12 shrink-0 items-center justify-center"
    >
      <span
        className="clay clay-press flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold"
        style={{ background: "var(--lavender)", color: "var(--lavender-icon)", fontFamily: "var(--font-heading)" }}
      >
        {initials(name)}
      </span>
    </button>
  );
}
