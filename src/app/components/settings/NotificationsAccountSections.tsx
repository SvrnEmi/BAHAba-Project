import { useState } from "react";
import {
  playNotificationSound,
  readAdminPopupPrefs,
  writeAdminPopupPrefs,
  type AdminPopupPrefs,
} from "../../../lib/adminPrefs";
import { ChangePassword, LogoutButton, type Message } from "../Profile";
import { SwitchRow } from "./common";

/** Saved per browser right away; the dashboard reads them each time a new item arrives. */
export function NotificationsSection() {
  const [prefs, setPrefs] = useState<AdminPopupPrefs>(readAdminPopupPrefs);

  const set = (key: keyof AdminPopupPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    writeAdminPopupPrefs(next);
    if (key === "sound" && value) playNotificationSound();
  };

  return (
    <div>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        <SwitchRow
          label="Popup for new pending reports"
          hint="When a resident submits a flood report for review."
          checked={prefs.pendingReports}
          onChange={(v) => set("pendingReports", v)}
        />
        <SwitchRow
          label="Popup for new barangay alerts"
          hint="When a barangay admin submits an alert for approval."
          checked={prefs.barangayAlerts}
          onChange={(v) => set("barangayAlerts", v)}
        />
        <SwitchRow
          label="Play a sound for new items"
          hint="Plays with each popup that is turned on."
          checked={prefs.sound}
          onChange={(v) => set("sound", v)}
        />
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        Saved on this browser only.
      </p>
    </div>
  );
}

export function AccountSection() {
  const [message, setMessage] = useState<Message | undefined>();
  return (
    <div className="space-y-4">
      <ChangePassword message={message} report={setMessage} />
      <LogoutButton />
    </div>
  );
}
