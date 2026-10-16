import logoTile from "../../assets/bahaba-logo.svg";

/**
 * The BAHAba logo: symbol only (rounded teal tile). Never put text inside or
 * beside the image; pages show the name "BAHAba" as their own heading.
 * Decorative by default, because the page title already names the app.
 */
export function BrandLogo({ size = 112, label }: { size?: number; label?: string }) {
  return (
    <img
      src={logoTile}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className="shrink-0 select-none"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        boxShadow: size >= 48 ? "8px 8px 20px rgba(118,146,184,0.35), -6px -6px 16px rgba(255,255,255,0.9)" : undefined,
      }}
    />
  );
}
