import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/community_report_model.dart';
import 'report_repository.dart';

/// Alert-level notification preferences stored in profiles.notification_prefs
/// as {"push": true, "levels": ["advisory", "warning", "critical"]}.
class NotificationPrefs {
  static const List<String> allLevels = ['advisory', 'warning', 'critical'];

  final bool push;
  final Set<String> levels;

  const NotificationPrefs({required this.push, required this.levels});

  static const NotificationPrefs defaults = NotificationPrefs(
      push: true, levels: {'advisory', 'warning', 'critical'});

  /// Reads the stored JSON defensively. Critical is always on.
  factory NotificationPrefs.fromJson(Object? value) {
    if (value is! Map) return defaults;
    final rawLevels = value['levels'];
    final levels = rawLevels is List
        ? rawLevels.whereType<String>().where(allLevels.contains).toSet()
        : {...defaults.levels};
    levels.add('critical');
    final push = value['push'];
    return NotificationPrefs(push: push is bool ? push : true, levels: levels);
  }

  Map<String, dynamic> toJson() => {
        'push': push,
        'levels': allLevels
            .where((l) => l == 'critical' || levels.contains(l))
            .toList(),
      };

  NotificationPrefs copyWith({bool? push, Set<String>? levels}) =>
      NotificationPrefs(push: push ?? this.push, levels: levels ?? this.levels);
}

/// Thrown when Supabase needs a fresh login before changing the password.
class ReauthenticationRequired implements Exception {
  const ReauthenticationRequired();
}

/// Profile reads and self-service updates. Updates never send role or email.
class ProfileRepository {
  SupabaseClient get _client => Supabase.instance.client;

  String get _userId {
    final id = _client.auth.currentUser?.id;
    if (id == null) throw StateError('Not signed in.');
    return id;
  }

  /// Reads notification_prefs. select('*') so a missing column falls back
  /// to defaults instead of failing.
  Future<NotificationPrefs> fetchNotificationPrefs() async {
    final row =
        await _client.from('profiles').select().eq('id', _userId).maybeSingle();
    return NotificationPrefs.fromJson(row?['notification_prefs']);
  }

  Future<void> updateDetails({
    required String name,
    required String phone,
  }) async {
    await _client
        .from('profiles')
        .update({'name': name, 'phone': phone}).eq('id', _userId);
  }

  /// Residents only; the database rejects this for admin roles.
  Future<void> updateBarangay(String barangay) async {
    await _client
        .from('profiles')
        .update({'barangay': barangay}).eq('id', _userId);
  }

  Future<void> saveNotificationPrefs(NotificationPrefs prefs) async {
    await _client
        .from('profiles')
        .update({'notification_prefs': prefs.toJson()}).eq('id', _userId);
  }

  Future<List<String>> fetchBarangayNames() async {
    final rows = await _client.from('barangays').select('name').order('name');
    return rows.map<String>((r) => r['name'] as String).toList();
  }

  /// Throws [ReauthenticationRequired] if Supabase asks for a fresh login.
  Future<void> changePassword(String password) async {
    try {
      await _client.auth.updateUser(UserAttributes(password: password));
    } on AuthException catch (e) {
      if (e.code == 'reauthentication_needed' ||
          e.message.toLowerCase().contains('reauthenticat')) {
        throw const ReauthenticationRequired();
      }
      rethrow;
    }
  }

  /// Count of the user's own reports (optionally only pending). Count-only
  /// request: no rows, no realtime. Used for the "My reports" summary.
  Future<int> countMyReports({
    required String name,
    required String email,
    bool pendingOnly = false,
  }) async {
    final names = [name, email].where((v) => v.trim().isNotEmpty).toList();
    if (names.isEmpty) return 0;
    var query = _client
        .from('community_reports')
        .count(CountOption.exact)
        .inFilter('user_name', names);
    if (pendingOnly) query = query.eq('status', 'pending');
    return await query;
  }

  /// The user's own reports, newest first. Reports are stored under the
  /// profile name (the web app falls back to email). One-shot read.
  Future<List<CommunityReport>> fetchMyReports({
    required String name,
    required String email,
  }) {
    return ReportRepository().fetchByUserNames(
      [name, email].where((v) => v.trim().isNotEmpty).toList(),
    );
  }
}
