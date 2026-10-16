/*
 * Emergency hotlines shown on the Profile screen.
 *
 * TODO: Replace the null placeholders with the official MDRRMO Odiongan and
 * Barangay Hall numbers. A null number shows "Hotline not set yet" instead
 * of a call button. Keep this list in sync with
 * bahaba_app/lib/config/emergency_contacts.dart.
 */

/** National emergency hotline (Philippines). */
export const NATIONAL_EMERGENCY_NUMBER = "911";

/** TODO: MDRRMO Odiongan hotline. */
export const MDRRMO_ODIONGAN_NUMBER: string | null = null;

/** TODO: Barangay Hall numbers, keyed by barangay name as stored in profiles.barangay. */
export const BARANGAY_HALL_NUMBERS: Record<string, string | null> = {
  // Tuburan: null,
};

export function barangayHallNumber(barangay: string | null | undefined): string | null {
  if (!barangay) return null;
  return BARANGAY_HALL_NUMBERS[barangay] ?? null;
}
