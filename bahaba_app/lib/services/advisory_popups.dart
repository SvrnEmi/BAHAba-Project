import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'posted_reports_service.dart';
import 'report_advisories_service.dart';
import 'verified_report_popups.dart';

/// Pop-ups for advisories are shown once per advisory id.
String advisoryPopupKey(ReportAdvisory advisory) => 'advisory:${advisory.id}';

const _maxShownIds = 500;

/// Advisories for the catch-up dialog, or null on the first launch (save, show
/// nothing).
List<ReportAdvisory>? catchUpAdvisories(
  List<ReportAdvisory> rows,
  int? lastSeen,
  Set<String> shown,
) {
  if (lastSeen == null) return null;
  return rows.where((row) => !shown.contains(advisoryPopupKey(row))).toList();
}

/// Watches report_advisories for one signed-in resident. Started by the
/// resident shell only, so nothing appears on the splash, login or register
/// screens, for guests or for admins. The stream carries every advisory the
/// resident may read, so each new one is checked against their own reports.
class AdvisoryWatcher {
  final String userId;

  /// Shows the dialog and completes when the resident closes it.
  final Future<void> Function(List<ReportAdvisory> advisories) show;

  AdvisoryWatcher({required this.userId, required this.show});

  late final PopupQueue<ReportAdvisory> _queue = PopupQueue(
    keyOf: advisoryPopupKey,
    reportIdOf: (advisory) => advisory.reportId,
    isShown: _shown.contains,
    markShown: _remember,
    isViewing: (id) => PostedReportsService.viewingId == id,
    show: (advisories, _) {
      show(advisories).whenComplete(_queue.closed);
    },
  );

  final Set<String> _shown = {};
  final Set<int> _own = {};
  Set<int>? _known;
  StreamSubscription<List<ReportAdvisory>>? _sub;
  SharedPreferences? _prefs;
  bool _stopped = false;

  String get _timeKey => 'last_seen_advisory_time:$userId';
  String get _idsKey => 'shown_advisory_ids:$userId';

  Future<void> start() async {
    try {
      final prefs = _prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_idsKey);
      if (saved != null) {
        _shown.addAll((jsonDecode(saved) as List).map((id) => '$id'));
      }
      _own.addAll(await PostedReportsService.ownReportIds(userId));
      final rows = await ReportAdvisoriesService.fetchFor(_own);
      if (_stopped) return;
      final fresh = catchUpAdvisories(rows, prefs.getInt(_timeKey), _shown);
      if (fresh == null) {
        _remember(rows.map(advisoryPopupKey).toList());
      } else if (fresh.isNotEmpty) {
        _queue.addCatchUp(fresh);
      }
      await prefs.setInt(_timeKey, DateTime.now().millisecondsSinceEpoch);
    } catch (e) {
      debugPrint('Advisory catch-up failed: $e');
    }
    if (_stopped) return;
    _sub = ReportAdvisoriesService.rows().listen(
      _onRows,
      onError: (Object e) => debugPrint('Advisory pop-ups: stream failed: $e'),
    );
  }

  /// The stream sends everything each time, so the first snapshot is the
  /// baseline and later ones are compared with it.
  void _onRows(List<ReportAdvisory> rows) {
    final before = _known;
    _known = {for (final row in rows) row.id};
    if (before == null) return;
    for (final advisory in rows) {
      if (before.contains(advisory.id) || advisory.authorId == userId) continue;
      unawaited(_addIfOwn(advisory));
    }
  }

  Future<void> _addIfOwn(ReportAdvisory advisory) async {
    if (!_own.contains(advisory.reportId)) {
      // A report sent after the app opened is not in the list yet.
      try {
        final mine =
            await PostedReportsService.isOwnReport(advisory.reportId, userId);
        if (!mine) return;
        _own.add(advisory.reportId);
      } catch (e) {
        debugPrint('Advisory pop-ups: report check failed: $e');
        return;
      }
    }
    if (!_stopped) _queue.add(advisory);
  }

  void _remember(List<String> keys) {
    _shown.addAll(keys);
    final ids = _shown.toList();
    final kept = ids.length > _maxShownIds
        ? ids.sublist(ids.length - _maxShownIds)
        : ids;
    _prefs?.setString(_idsKey, jsonEncode(kept));
  }

  void stop() {
    _stopped = true;
    _sub?.cancel();
    _queue.stop();
  }
}
