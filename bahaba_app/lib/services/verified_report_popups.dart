import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'posted_reports_service.dart';
import 'realtime_hub.dart';

/// Rules for the "report verified" pop-ups.
/// src/lib/reportPopups.ts in the web app holds the same rules.

const popupWindow = Duration(seconds: 10);
const _maxShownIds = 500;

/// A rejected report that is approved later still gets its own pop-up.
String popupKey(PostedReport report) =>
    report.status == 'rejected' ? '${report.id}:rejected' : '${report.id}';

/// Any approved report in the barangay, plus the resident's own approved or
/// rejected reports.
bool isPopupEvent(PostedReport report, String barangay, String userId) {
  final own = report.userId == userId;
  if (report.status == 'approved') return own || report.barangay == barangay;
  return report.status == 'rejected' && own;
}

/// Reports for the catch-up dialog, or null on the first launch (save, show
/// nothing). community_reports has no approval time and "timestamp" is when
/// the report was sent, so a report sent before the last visit and approved
/// after it would be missed by comparing times. Comparing with the shown ids
/// catches it.
List<PostedReport>? catchUpReports(
  List<PostedReport> rows,
  int? lastSeen,
  Set<String> shown,
) {
  if (lastSeen == null) return null;
  return rows.where((row) => !shown.contains(popupKey(row))).toList();
}

/// Waits [window] after the first event, then shows everything collected as
/// one dialog.
class PopupQueue {
  final bool Function(String key) isShown;
  final void Function(List<String> keys) markShown;
  final bool Function(int reportId) isViewing;
  final void Function(List<PostedReport> reports, bool catchUp) show;
  final Duration window;

  final Map<String, PostedReport> _waiting = {};
  Timer? _timer;
  bool _open = false;

  PopupQueue({
    required this.isShown,
    required this.markShown,
    required this.isViewing,
    required this.show,
    this.window = popupWindow,
  });

  void add(PostedReport report) {
    final key = popupKey(report);
    if (isShown(key)) return;
    _waiting[key] = report;
    if (_timer == null && !_open) {
      _timer = Timer(window, () => _flush(false));
    }
  }

  /// The catch-up dialog shows at once.
  void addCatchUp(List<PostedReport> reports) {
    for (final report in reports) {
      _waiting[popupKey(report)] = report;
    }
    _flush(true);
  }

  /// The resident closed the dialog; anything that arrived meanwhile is next.
  void closed() {
    _open = false;
    if (_waiting.isNotEmpty) _flush(false);
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _waiting.clear();
  }

  void _flush(bool catchUp) {
    _timer?.cancel();
    _timer = null;
    if (_open || _waiting.isEmpty) return;
    final keys = _waiting.keys.toList();
    final reports =
        _waiting.values.where((report) => !isViewing(report.id)).toList();
    _waiting.clear();
    markShown(keys);
    if (reports.isEmpty) return;
    _open = true;
    show(reports, catchUp);
  }
}

/// Watches community_reports for one signed-in resident. Started by the
/// resident shell only, so nothing appears on the splash, login or register
/// screens, for guests or for admins.
class VerifiedReportWatcher {
  final String userId;
  final String barangay;

  /// Shows the dialog and completes when the resident closes it.
  final Future<void> Function(List<PostedReport> reports, bool catchUp) show;

  VerifiedReportWatcher({
    required this.userId,
    required this.barangay,
    required this.show,
  });

  late final PopupQueue _queue = PopupQueue(
    isShown: _shown.contains,
    markShown: _remember,
    isViewing: (id) => PostedReportsService.viewingId == id,
    show: (reports, catchUp) {
      show(reports, catchUp).whenComplete(_queue.closed);
    },
  );

  final Set<String> _shown = {};
  StreamSubscription<List<Map<String, dynamic>>>? _sub;
  Map<int, String>? _statuses;
  SharedPreferences? _prefs;
  bool _stopped = false;

  // One saved place per resident and barangay, so moving barangay counts as a
  // first launch.
  String get _timeKey => 'last_seen_report_time:$userId:$barangay';
  String get _idsKey => 'shown_report_ids:$userId:$barangay';

  Future<void> start() async {
    try {
      final prefs = _prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_idsKey);
      if (saved != null) {
        _shown.addAll((jsonDecode(saved) as List).map((id) => '$id'));
      }
      final rows = (await PostedReportsService.fetchForPopups(barangay, userId))
          .where((row) => isPopupEvent(row, barangay, userId))
          .toList();
      if (_stopped) return;
      final fresh = catchUpReports(rows, prefs.getInt(_timeKey), _shown);
      if (fresh == null) {
        _remember(rows.map(popupKey).toList());
      } else if (fresh.isNotEmpty) {
        _queue.addCatchUp(fresh);
      }
      await prefs.setInt(_timeKey, DateTime.now().millisecondsSinceEpoch);
    } catch (e) {
      debugPrint('Report catch-up failed: $e');
    }
    if (_stopped) return;
    _sub = RealtimeHub.instance.table('community_reports').listen(
      _onRows,
      onError: (Object e) => debugPrint('Report pop-ups: stream failed: $e'),
    );
  }

  /// The hub sends the whole table each time, so the first snapshot is the
  /// baseline and later ones are compared with it.
  void _onRows(List<Map<String, dynamic>> rows) {
    final before = _statuses;
    final after = <int, String>{};
    for (final row in rows) {
      final report = PostedReport.fromRow(row);
      after[report.id] = report.status;
      if (before != null &&
          before[report.id] != report.status &&
          isPopupEvent(report, barangay, userId)) {
        _queue.add(report);
      }
    }
    _statuses = after;
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
