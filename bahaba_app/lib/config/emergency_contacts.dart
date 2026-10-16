/// Emergency hotlines shown on the Profile screen.
///
/// TODO: Replace the null placeholders with the official MDRRMO Odiongan and
/// Barangay Hall numbers. A null number shows "Hotline not set yet" instead
/// of a call button. Keep this list in sync with
/// src/lib/emergencyContacts.ts in the web app.
class EmergencyContacts {
  EmergencyContacts._();

  /// National emergency hotline (Philippines).
  static const String nationalEmergency = '911';

  /// TODO: MDRRMO Odiongan hotline.
  static const String? mdrrmoOdiongan = null;

  /// TODO: Barangay Hall numbers, keyed by barangay name as stored in
  /// profiles.barangay.
  static const Map<String, String?> barangayHalls = {
    // 'Tuburan': null,
  };

  static String? barangayHall(String? barangay) =>
      barangay == null ? null : barangayHalls[barangay];
}
