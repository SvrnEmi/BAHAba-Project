import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Per-user "last time Alerts was opened", for the Home bell's unread badge.
///
/// Stored in shared_preferences as `bahaba_alerts_seen_<userId>` (epoch ms).
/// Listeners are notified when [markSeen] runs so the badge resets at once.
class AlertsSeenStore extends ChangeNotifier {
  AlertsSeenStore._();
  static final AlertsSeenStore instance = AlertsSeenStore._();

  static const Duration _firstRunWindow = Duration(days: 7);
  static String _key(String userId) => 'bahaba_alerts_seen_$userId';

  static String? get currentUserId =>
      Supabase.instance.client.auth.currentUser?.id;

  /// New users count everything older than 7 days as already seen.
  Future<DateTime> lastSeen(String userId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final millis = prefs.getInt(_key(userId));
      if (millis != null && millis > 0) {
        return DateTime.fromMillisecondsSinceEpoch(millis);
      }
    } catch (error) {
      debugPrint('Alerts seen: read failed: $error');
    }
    return DateTime.now().subtract(_firstRunWindow);
  }

  /// Marks all current alerts as seen for the signed-in user.
  Future<void> markSeen() async {
    final userId = currentUserId;
    if (userId == null) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(
        _key(userId),
        DateTime.now().millisecondsSinceEpoch,
      );
    } catch (error) {
      debugPrint('Alerts seen: write failed: $error');
    }
    notifyListeners();
  }

  /// Exact barangay match, "All Barangays", or a comma/semicolon-separated
  /// multi-barangay target that includes [barangay].
  static bool targetsBarangay(String target, String barangay) {
    final wanted = barangay.trim().toLowerCase();
    return target.split(RegExp('[,;]')).map((p) => p.trim().toLowerCase()).any(
          (part) =>
              part == 'all barangays' ||
              part == wanted ||
              part == 'barangay $wanted',
        );
  }
}
