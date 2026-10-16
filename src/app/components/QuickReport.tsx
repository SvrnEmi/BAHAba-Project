import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Camera, CheckCircle2, Loader, LocateFixed, Phone, Trash2, Waves } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  EMERGENCY_HOTLINE,
  FALLBACK_BARANGAYS,
  MDRRMO_HOTLINE,
  QuickReportError,
  WATER_LEVELS,
  compressPhoto,
  quickReportStatus,
  submitQuickReport,
  uploadQuickReportPhoto,
  type QuickReportStatus,
  type WaterLevel,
} from "../../lib/quickReport";

const DESCRIPTION_MAX = 500;

/** Big call buttons; the number is written out because tel: links do nothing on desktop. */
export function HotlineButtons({ compact = false }: { compact?: boolean }) {
  const items = [
    { text: `Call MDRRMO ${MDRRMO_HOTLINE.label}`, tel: MDRRMO_HOTLINE.tel, primary: true },
    { text: `Call ${EMERGENCY_HOTLINE.label}`, tel: EMERGENCY_HOTLINE.tel, primary: false },
  ];
  return (
    <div className={`grid gap-2.5 ${compact ? "" : "sm:grid-cols-2"}`}>
      {items.map((item) => (
        <a
          key={item.tel}
          href={`tel:${item.tel}`}
          className={`clay-btn w-full ${item.primary ? "clay-btn-danger" : "clay-btn-secondary"}`}
        >
          <Phone size={18} aria-hidden="true" />
          {item.text}
        </a>
      ))}
    </div>
  );
}

function Notice({ tone, children }: { tone: "info" | "error" | "ok"; children: ReactNode }) {
  const color = tone === "error" ? "var(--risk-high)" : tone === "ok" ? "var(--risk-low)" : "var(--primary-brand)";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="bg-white px-3 py-2.5 text-sm"
      style={{ color: "var(--text-primary)", borderLeft: `4px solid ${color}`, borderRadius: 12 }}
    >
      {children}
    </div>
  );
}

type Phase =
  | { kind: "loading" }
  | { kind: "statusError"; message: string }
  | { kind: "ready"; status: QuickReportStatus }
  | { kind: "sent"; remaining: number; photoFailed: boolean };

type Location = { lat: number; lng: number; accuracy: number };

export function QuickReport() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    quickReportStatus().then(
      (status) => !cancelled && setPhase({ kind: "ready", status }),
      (err) =>
        !cancelled &&
        setPhase({
          kind: "statusError",
          message: err instanceof QuickReportError ? err.message : "We couldn't reach the Quick Report service.",
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div className="min-h-screen max-w-md mx-auto bg-background px-[18px] pt-4 pb-10">
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate("/login")}
          aria-label="Back to sign in"
          className="clay clay-press flex h-11 w-11 items-center justify-center rounded-full"
          style={{ color: "var(--primary-brand)" }}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="flex items-center gap-2 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          <Waves size={20} aria-hidden="true" style={{ color: "var(--primary-brand)" }} />
          Quick Report
        </h1>
      </div>

      <div className="mb-4">
        <Notice tone="error">In an emergency call 911 or the MDRRMO first.</Notice>
      </div>

      {phase.kind === "loading" && (
        <div className="clay p-6 text-center text-sm" style={{ color: "var(--text-secondary)" }} role="status">
          Checking Quick Report…
        </div>
      )}

      {phase.kind === "statusError" && (
        <div className="space-y-4">
          <Notice tone="error">{phase.message}</Notice>
          <button type="button" className="clay-btn clay-btn-secondary w-full" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
          <HotlineButtons />
        </div>
      )}

      {phase.kind === "ready" && phase.status.blocked && (
        <div className="space-y-4">
          <Notice tone="error">This device can no longer send Quick Reports. Please call the MDRRMO or 911.</Notice>
          <HotlineButtons />
        </div>
      )}

      {phase.kind === "ready" && !phase.status.blocked && (
        <ReportForm
          status={phase.status}
          onSent={(remaining, photoFailed) => setPhase({ kind: "sent", remaining, photoFailed })}
          onBlocked={() => setPhase({ kind: "ready", status: { ...phase.status, blocked: true } })}
        />
      )}

      {phase.kind === "sent" && (
        <div className="space-y-4">
          <div className="clay p-6 text-center">
            <CheckCircle2 size={44} className="mx-auto mb-3" style={{ color: "var(--risk-low)" }} aria-hidden="true" />
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              Report sent. The MDRRMO will review it.
            </h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              {phase.remaining > 0
                ? `You can send ${phase.remaining} more Quick Report${phase.remaining === 1 ? "" : "s"}.`
                : "You have used all 3 Quick Reports. Create an account to keep reporting."}
            </p>
          </div>
          {phase.photoFailed && (
            <Notice tone="error">Your report was sent, but the photo could not be uploaded.</Notice>
          )}
          {phase.remaining > 0 && (
            <button type="button" className="clay-btn clay-btn-primary w-full" onClick={() => setAttempt((n) => n + 1)}>
              Send another
            </button>
          )}
          <button type="button" className="clay-btn clay-btn-secondary w-full" onClick={() => navigate("/register")}>
            Create an account
          </button>
          <HotlineButtons />
        </div>
      )}

      <p className="mt-8 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
        By sending this you agree to the{" "}
        <a href="/terms" className="font-semibold underline" style={{ color: "var(--primary-shade)" }}>Terms</a> and{" "}
        <a href="/privacy" className="font-semibold underline" style={{ color: "var(--primary-shade)" }}>Privacy Policy</a>.
      </p>
    </div>
  );
}

function ReportForm({
  status,
  onSent,
  onBlocked,
}: {
  status: QuickReportStatus;
  onSent: (remaining: number, photoFailed: boolean) => void;
  onBlocked: () => void;
}) {
  const navigate = useNavigate();
  const used = status.remaining <= 0;
  const [level, setLevel] = useState<WaterLevel | null>(null);
  const [barangays, setBarangays] = useState<string[]>(FALLBACK_BARANGAYS);
  const [barangay, setBarangay] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [landmark, setLandmark] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: people never see or fill it
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Public read of barangay names; the fallback list stays if it is not allowed.
  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("barangays")
      .select("name")
      .order("name")
      .then(({ data, error: readError }) => {
        if (cancelled || readError) return;
        const names = ((data as { name: unknown }[] | null) ?? []).map((b) => String(b.name ?? "").trim()).filter(Boolean);
        if (names.length) setBarangays(names);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocationNote("Your browser can't share a location. Please choose your barangay instead.");
      return;
    }
    setLocating(true);
    setLocationNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocationNote(
          err.code === err.PERMISSION_DENIED
            ? "Location wasn't shared, and that's okay. Please choose your barangay instead."
            : "We couldn't get your location right now. Please choose your barangay instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const blob = await compressPhoto(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setPhotoError(err instanceof QuickReportError ? err.message : "That picture could not be used. Try another one.");
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const levelMissing = !level;
  const placeMissing = !barangay && !location;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (sending || used || levelMissing || placeMissing) return;
    setSending(true);
    setError(null);
    try {
      const result = await submitQuickReport({
        water_level: level!,
        ...(barangay ? { barangay } : {}),
        ...(location ? { lat: location.lat, lng: location.lng } : {}),
        ...(landmark.trim() ? { landmark: landmark.trim() } : {}),
        ...(description.trim() ? { description: description.trim().slice(0, DESCRIPTION_MAX) } : {}),
        ...(name.trim() ? { reporter_name: name.trim() } : {}),
        ...(phone.trim() ? { reporter_phone: phone.trim() } : {}),
        ...(photo ? { want_photo: true, photo_ext: "jpg" as const } : {}),
        website,
      });
      let photoFailed = false;
      if (photo) {
        photoFailed = !result.upload || !(await uploadQuickReportPhoto(result.upload, photo.blob));
      }
      onSent(Math.max(0, Number(result.remaining ?? 0)), photoFailed);
    } catch (err) {
      if (err instanceof QuickReportError && err.code === "blocked") {
        onBlocked();
        return;
      }
      setError(err instanceof QuickReportError ? err.message : "We couldn't send that right now. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (used) {
    return (
      <div className="space-y-4">
        <Notice tone="info">You have used all 3 Quick Reports. Create an account to keep reporting.</Notice>
        <button type="button" className="clay-btn clay-btn-primary w-full" onClick={() => navigate("/register")}>
          Sign up
        </button>
        <HotlineButtons />
      </div>
    );
  }

  const disabled = sending;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Notice tone="info">
        You can send {status.remaining} more Quick Report{status.remaining === 1 ? "" : "s"}.
      </Notice>

      <fieldset className="clay p-4" aria-describedby={touched && levelMissing ? "level-error" : undefined}>
        <legend className="sr-only">How deep is the water?</legend>
        <p className="clay-label" aria-hidden="true">How deep is the water? *</p>
        <div className="grid grid-cols-1 gap-2">
          {WATER_LEVELS.map((w) => (
            <button
              key={w.id}
              type="button"
              aria-pressed={level === w.id}
              onClick={() => setLevel(w.id)}
              disabled={disabled}
              className={`clay-btn w-full justify-between ${level === w.id ? "clay-btn-primary" : "clay-btn-secondary"}`}
              style={{ minHeight: 52 }}
            >
              <span className="text-base font-bold">{w.label}</span>
              {level === w.id && <CheckCircle2 size={20} aria-hidden="true" />}
            </button>
          ))}
        </div>
        {touched && levelMissing && (
          <p id="level-error" role="alert" className="mt-2 text-sm" style={{ color: "var(--risk-high)" }}>
            Choose how deep the water is.
          </p>
        )}
      </fieldset>

      <div className="clay space-y-3 p-4">
        <label className="block">
          <span className="clay-label">Barangay</span>
          <select className="clay-input" value={barangay} onChange={(e) => setBarangay(e.target.value)} disabled={disabled}>
            <option value="">Choose a barangay</option>
            {barangays.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        {location ? (
          <div className="flex items-center justify-between gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
            <span>Location added ✓ (about {location.accuracy} m)</span>
            <button type="button" className="clay-btn clay-btn-secondary" onClick={() => setLocation(null)} disabled={disabled}>
              Remove
            </button>
          </div>
        ) : (
          <button type="button" className="clay-btn clay-btn-secondary w-full" onClick={useMyLocation} disabled={disabled || locating}>
            {locating ? <Loader size={18} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={18} aria-hidden="true" />}
            {locating ? "Getting your location…" : "Use my location"}
          </button>
        )}
        {locationNote && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{locationNote}</p>}
        {touched && placeMissing && (
          <p role="alert" className="text-sm" style={{ color: "var(--risk-high)" }}>
            Choose a barangay or use your location.
          </p>
        )}
        <label className="block">
          <span className="clay-label">Landmark (optional)</span>
          <input className="clay-input" value={landmark} maxLength={200} onChange={(e) => setLandmark(e.target.value)} disabled={disabled} placeholder="e.g. near the chapel" />
        </label>
      </div>

      <div className="clay space-y-3 p-4">
        <label className="block">
          <span className="clay-label">What do you see? (optional)</span>
          <textarea
            className="clay-input min-h-24"
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
            disabled={disabled}
          />
          <span className="mt-1 block text-right text-xs" style={{ color: "var(--text-secondary)" }}>
            {description.length}/{DESCRIPTION_MAX}
          </span>
        </label>

        <div>
          <span className="clay-label">Photo (optional)</span>
          {photo ? (
            <div className="space-y-2">
              <img src={photo.url} alt="Selected flood photo" className="max-h-64 w-full rounded-2xl object-cover" />
              <button
                type="button"
                className="clay-btn clay-btn-secondary w-full"
                onClick={() => setPhoto(null)}
                disabled={disabled}
              >
                <Trash2 size={18} aria-hidden="true" /> Remove photo
              </button>
            </div>
          ) : (
            <label className={`clay-btn clay-btn-secondary w-full cursor-pointer ${disabled || photoBusy ? "pointer-events-none opacity-60" : ""}`}>
              {photoBusy ? <Loader size={18} className="animate-spin" aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}
              {photoBusy ? "Preparing photo…" : "Take or choose a photo"}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void pickPhoto(e.target.files?.[0])}
                disabled={disabled || photoBusy}
              />
            </label>
          )}
          {photoError && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--risk-high)" }}>{photoError}</p>}
        </div>
      </div>

      <div className="clay space-y-3 p-4">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Only the MDRRMO can see this. It helps them verify your report.
        </p>
        <label className="block">
          <span className="clay-label">Your name (optional)</span>
          <input className="clay-input" value={name} maxLength={100} autoComplete="name" onChange={(e) => setName(e.target.value)} disabled={disabled} />
        </label>
        <label className="block">
          <span className="clay-label">Phone (optional)</span>
          <input className="clay-input" type="tel" value={phone} maxLength={20} autoComplete="tel" onChange={(e) => setPhone(e.target.value)} disabled={disabled} />
        </label>
      </div>

      {/* Honeypot: hidden from people and screen readers; bots that fill it are rejected server-side. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <button type="submit" className="clay-btn clay-btn-primary w-full" disabled={sending || photoBusy} style={{ minHeight: 56 }}>
        {sending ? <Loader size={18} className="animate-spin" aria-hidden="true" /> : null}
        {sending ? "Sending…" : "Send Quick Report"}
      </button>

      <HotlineButtons />
    </form>
  );
}
