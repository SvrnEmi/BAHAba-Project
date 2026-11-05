import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../widgets/app_release_dialogs.dart';
import 'push_notification_service.dart';

/// One published row of public.app_versions.
class AppRelease {
  final int versionCode;
  final String versionName;
  final String apkUrl;
  final List<String> notes;
  final bool required;

  const AppRelease({
    required this.versionCode,
    required this.versionName,
    this.apkUrl = '',
    this.notes = const [],
    this.required = false,
  });

  factory AppRelease.fromRow(Map<String, dynamic> row) => AppRelease(
        versionCode: (row['version_code'] as num).toInt(),
        versionName: (row['version_name'] ?? '').toString(),
        apkUrl: (row['apk_url'] ?? '').toString().trim(),
        notes: [
          for (final note in (row['notes'] as List? ?? const []))
            if (note.toString().trim().isNotEmpty) note.toString().trim(),
        ],
        required: row['required'] == true,
      );
}

/// True when [latest] is newer than the installed build and can be downloaded.
bool offersUpdate(AppRelease? latest, int installedBuild) =>
    latest != null &&
    latest.versionCode > installedBuild &&
    latest.apkUrl.isNotEmpty;

enum WhatsNewStep { none, saveOnly, show }

/// First install (nothing stored): save and show nothing. A newer build than
/// the last one seen: show its notes.
WhatsNewStep whatsNewStep({required int installedBuild, int? lastSeenBuild}) {
  if (lastSeenBuild == null) return WhatsNewStep.saveOnly;
  return installedBuild > lastSeenBuild ? WhatsNewStep.show : WhatsNewStep.none;
}

/// True when a check may run: the first one, or an hour after the last.
bool checkIsDue(DateTime? lastCheck, DateTime now) =>
    lastCheck == null || now.difference(lastCheck) >= AppUpdateService.minGap;

/// Update check and "What's new". Runs only while a home screen is attached
/// (resident shell or an admin dashboard), so nothing appears on Login or
/// Register. Any failure, such as no internet, is ignored.
class AppUpdateService with WidgetsBindingObserver {
  AppUpdateService._();
  static final AppUpdateService instance = AppUpdateService._();

  static const minGap = Duration(hours: 1);
  static const lastSeenKey = 'last_seen_build';
  static const _columns =
      'version_code, version_name, apk_url, notes, required';

  int _homes = 0;
  bool _busy = false;
  DateTime? _lastCheck;

  SupabaseClient get _client => Supabase.instance.client;

  /// Called by a home screen's initState; the check starts after the frame.
  void attachHome() {
    if (_homes++ == 0) WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  /// Called by a home screen's dispose.
  void detachHome() {
    if (--_homes == 0) WidgetsBinding.instance.removeObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _check();
  }

  Future<void> _check() async {
    final now = DateTime.now();
    if (_busy || _homes == 0 || !checkIsDue(_lastCheck, now)) return;
    _busy = true;
    _lastCheck = now;
    try {
      final build = await installedBuild();
      if (build == null) return;
      await _showWhatsNewIfNeeded(build);
      await _offerUpdate(build);
    } catch (e) {
      debugPrint('Update check skipped: $e');
    } finally {
      _busy = false;
    }
  }

  BuildContext? get _dialogContext =>
      _homes > 0 ? PushNotificationService.instance.navigatorKey.currentContext : null;

  Future<void> _showWhatsNewIfNeeded(int build) async {
    final prefs = await SharedPreferences.getInstance();
    final step = whatsNewStep(
      installedBuild: build,
      lastSeenBuild: prefs.getInt(lastSeenKey),
    );
    if (step == WhatsNewStep.none) return;
    if (step == WhatsNewStep.saveOnly) {
      await prefs.setInt(lastSeenKey, build);
      return;
    }
    // Not saved until shown, so notes published later still appear.
    final release = await releaseFor(build);
    final context = _dialogContext;
    if (release == null || context == null) return;
    if (!context.mounted) return;
    await showWhatsNewDialog(context, release);
    await prefs.setInt(lastSeenKey, build);
  }

  Future<void> _offerUpdate(int build) async {
    final latest = await latestRelease();
    if (!offersUpdate(latest, build)) return;
    final required = await hasRequiredUpdate(build);
    final context = _dialogContext;
    if (context == null || !context.mounted) return;
    await showUpdateDialog(context, latest!, required: required);
  }

  /// The installed build number, or null if it cannot be read.
  Future<int?> installedBuild() async =>
      int.tryParse((await PackageInfo.fromPlatform()).buildNumber);

  /// "1.2.0 (build 3)".
  Future<String> versionLabel() async {
    final info = await PackageInfo.fromPlatform();
    return '${info.version} (build ${info.buildNumber})';
  }

  PostgrestFilterBuilder<List<Map<String, dynamic>>> _published() => _client
      .from('app_versions')
      .select(_columns)
      .eq('is_published', true)
      .eq('platform', 'android');

  Future<AppRelease?> latestRelease() async {
    final row = await _published()
        .order('version_code', ascending: false)
        .limit(1)
        .maybeSingle();
    return row == null ? null : AppRelease.fromRow(row);
  }

  Future<AppRelease?> releaseFor(int build) async {
    final row = await _published().eq('version_code', build).maybeSingle();
    return row == null ? null : AppRelease.fromRow(row);
  }

  /// True if any published row newer than [build] is required, not only the latest.
  Future<bool> hasRequiredUpdate(int build) async {
    final rows = await _published()
        .gt('version_code', build)
        .eq('required', true)
        .limit(1);
    return rows.isNotEmpty;
  }
}
