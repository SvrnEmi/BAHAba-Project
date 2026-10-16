import { supabase } from "./supabase";

/*
 * Quick Report: anonymous flood reports through the "quick-report" Edge
 * Function. Limits (3 per device), IP limits and blocking are enforced
 * server-side; the device id only lets the server count this browser.
 */

export const MDRRMO_HOTLINE = { label: "+63 919 079 8427", tel: "+639190798427" };
export const EMERGENCY_HOTLINE = { label: "911", tel: "911" };

export type WaterLevel = "ankle" | "knee" | "waist" | "chest" | "overhead";

export const WATER_LEVELS: { id: WaterLevel; label: string; badge: string; severity: string }[] = [
  { id: "ankle", label: "Ankle", badge: "risk-badge-low", severity: "Low" },
  { id: "knee", label: "Knee", badge: "risk-badge-medium", severity: "Medium" },
  { id: "waist", label: "Waist", badge: "risk-badge-high", severity: "High" },
  { id: "chest", label: "Chest", badge: "risk-badge-high", severity: "Severe" },
  { id: "overhead", label: "Over head", badge: "risk-badge-high", severity: "Severe" },
];

export function waterLevelInfo(level: string | null | undefined) {
  return WATER_LEVELS.find((w) => w.id === level) ?? null;
}

/**
 * Used when the barangays table cannot be read without signing in.
 * TODO: replace with the official list of the 25 Odiongan barangays (names
 * must match barangays.name exactly).
 */
export const FALLBACK_BARANGAYS = [
  "Anahao",
  "Bangon",
  "Gabawan",
  "Libertad",
  "Ligaya",
  "Luntad",
  "Panique",
  "Poblacion",
  "Tuburan",
];

const DEVICE_KEY = "bahaba_device_id";
let memoryDeviceId: string | null = null;

function newId(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === "function") return c.randomUUID();
  // randomUUID needs a secure context; getRandomValues does not.
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** One id per browser, kept in localStorage; in-memory when storage is blocked. */
export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const id = newId();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    memoryDeviceId ??= newId();
    return memoryDeviceId;
  }
}

export type QuickReportStatus = { max: number; remaining: number; blocked: boolean };
export type QuickReportUpload = { path: string; token: string; signed_url?: string } | null;
export type SubmitResult = { ok: boolean; id?: string | number; remaining: number; upload: QuickReportUpload };

/** Error with a message that is safe to show (never a raw technical error). */
export class QuickReportError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

const FRIENDLY: Record<string, string> = {
  blocked: "This device can no longer send Quick Reports. Please call the MDRRMO or 911.",
  limit: "You have used all 3 Quick Reports. Create an account to keep reporting.",
  ip_limit: "Too many Quick Reports were sent from this network. Please try again later or call the MDRRMO.",
  busy: "The service is busy right now. Please try again in a minute.",
};
const GENERIC = "We couldn't send that right now. Please check your connection and try again, or call the MDRRMO.";

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("quick-report", { body });
  let payload: { error?: unknown; code?: unknown } | null =
    data && typeof data === "object" ? (data as { error?: unknown; code?: unknown }) : null;
  if (error) {
    payload = null;
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        payload = (await context.clone().json()) as { error?: unknown; code?: unknown };
      } catch {
        // Not JSON.
      }
    }
    if (!payload?.error) {
      console.error("quick-report request failed:", error.message);
      throw new QuickReportError(GENERIC);
    }
  }
  if (payload?.error) {
    const code = typeof payload.code === "string" ? payload.code : undefined;
    const text = typeof payload.error === "string" ? payload.error : "";
    // The function's own error text is user-facing; known codes get our wording if it is missing.
    throw new QuickReportError(text || (code && FRIENDLY[code]) || GENERIC, code);
  }
  return data as T;
}

export function quickReportStatus(): Promise<QuickReportStatus> {
  return invoke<QuickReportStatus>({ action: "status", device_id: getDeviceId() });
}

export type QuickReportInput = {
  water_level: WaterLevel;
  barangay?: string;
  lat?: number;
  lng?: number;
  landmark?: string;
  description?: string;
  reporter_name?: string;
  reporter_phone?: string;
  want_photo?: boolean;
  photo_ext?: "jpg" | "png" | "webp";
  website: string;
};

export function submitQuickReport(input: QuickReportInput): Promise<SubmitResult> {
  return invoke<SubmitResult>({ action: "submit", device_id: getDeviceId(), ...input });
}

/** Uploads the compressed photo to the signed URL the function returned. */
export async function uploadQuickReportPhoto(upload: NonNullable<QuickReportUpload>, photo: Blob): Promise<boolean> {
  const { error } = await supabase.storage
    .from("quick-report-photos")
    .uploadToSignedUrl(upload.path, upload.token, photo, { contentType: "image/jpeg" });
  if (error) console.error("Quick Report photo upload failed:", error.message);
  return !error;
}

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * Re-encodes a picture as JPEG under 2 MB (longest side up to 1600 px).
 * Re-encoding also drops EXIF data such as the phone's GPS position.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new QuickReportError("Please choose a picture file.");
  const bitmap = await loadImage(file);
  let maxSide = 1600;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#fff"; // transparent PNGs become white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
    }
    maxSide = Math.round(maxSide * 0.75);
  }
  throw new QuickReportError("That picture could not be prepared. Try a different one.");
}

async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall back to <img> (e.g. formats createImageBitmap rejects).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new QuickReportError("That picture could not be opened. Try a JPG or PNG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
