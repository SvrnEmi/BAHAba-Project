/*
 * MDRRMO popup preferences, kept per browser in localStorage. Every access is
 * wrapped in try/catch: storage can be blocked (private mode, site data
 * cleared), and then the defaults apply.
 */

export type AdminPopupPrefs = {
  /** Popup when a resident submits a new report awaiting review. */
  pendingReports: boolean;
  /** Popup when a barangay admin submits a new alert awaiting review. */
  barangayAlerts: boolean;
  /** Short sound together with a popup. */
  sound: boolean;
};

export const DEFAULT_ADMIN_POPUP_PREFS: AdminPopupPrefs = {
  pendingReports: true,
  barangayAlerts: true,
  sound: false,
};

const KEY = "bahaba.mdrrmo.popupPrefs";

export function readAdminPopupPrefs(): AdminPopupPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ADMIN_POPUP_PREFS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof AdminPopupPrefs, unknown>>;
    const pick = (key: keyof AdminPopupPrefs) =>
      typeof parsed[key] === "boolean" ? (parsed[key] as boolean) : DEFAULT_ADMIN_POPUP_PREFS[key];
    return { pendingReports: pick("pendingReports"), barangayAlerts: pick("barangayAlerts"), sound: pick("sound") };
  } catch {
    return DEFAULT_ADMIN_POPUP_PREFS;
  }
}

export function writeAdminPopupPrefs(prefs: AdminPopupPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}

let audio: AudioContext | null = null;

/** Two short tones. Silently does nothing where audio is unavailable or blocked. */
export function playNotificationSound() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
    const start = audio.currentTime;
    [880, 1175].forEach((frequency, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.frequency.value = frequency;
      const t = start + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  } catch {
    // No sound; the popup still shows.
  }
}
