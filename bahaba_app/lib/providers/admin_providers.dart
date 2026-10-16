import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/alert_model.dart';
import '../models/audit_log_model.dart';
import '../models/community_report_model.dart';
import '../repositories/alert_repository.dart';
import '../repositories/audit_repository.dart';
import '../repositories/report_repository.dart';

/// Provides alert data for the MDRRMO admin dashboard.
class AdminAlertProvider extends ChangeNotifier {
  final AlertRepository _repo = AlertRepository();
  StreamSubscription<List<Alert>>? _sub;

  List<Alert> _alerts = [];
  List<Alert> _pending = [];
  bool _loading = true;
  String? _error;

  List<Alert> get alerts => _alerts;
  List<Alert> get pendingAlerts => _pending;
  bool get loading => _loading;
  String? get error => _error;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();

    _sub?.cancel();
    _sub = _repo.watchAll().listen(
      (alerts) {
        _alerts = alerts;
        _pending = alerts
            .where((alert) => alert.status == AlertStatus.pending)
            .toList();
        _loading = false;
        notifyListeners();
      },
      onError: (e) {
        _error = e.toString();
        _loading = false;
        notifyListeners();
      },
    );
  }

  Future<void> createAlert({
    required AlertLevel level,
    required String title,
    required String message,
    required String targetBarangay,
    required List<AlertChannel> channels,
    required String createdBy,
  }) async {
    await _repo.createAlert(
      level: level,
      title: title,
      message: message,
      targetBarangay: targetBarangay,
      channels: channels,
      createdBy: createdBy,
      status: AlertStatus.approved,
      source: 'mdrrmo',
      recipients: targetBarangay == 'All Barangays' ? 1234 : 500,
    );
    await load();
  }

  Future<void> approve(int id, String adminName) async {
    await _repo.approveAlert(id, adminName);
    await load();
  }

  Future<void> reject(int id, String reason, String adminName) async {
    await _repo.rejectAlert(id, reason, adminName);
    await load();
  }

  /// Cancels the live subscription. Call from the owning screen's dispose
  /// so the Realtime channel closes when the screen does.
  void stop() {
    _sub?.cancel();
    _sub = null;
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

/// Provides community report data for admin verification.
///
/// Subscribes to a live Supabase Realtime stream so the list always
/// reflects the true database state — including changes made from this
/// very screen (approve/reject/delete) and from any other device.
class AdminReportProvider extends ChangeNotifier {
  final ReportRepository _repo = ReportRepository();
  StreamSubscription<List<CommunityReport>>? _sub;

  List<CommunityReport> _reports = [];
  bool _loading = true;
  String? _error;

  List<CommunityReport> get reports => _reports;
  bool get loading => _loading;
  String? get error => _error;

  int get pendingCount =>
      _reports.where((r) => r.status == ReportStatus.pending).length;
  int get approvedCount =>
      _reports.where((r) => r.status == ReportStatus.approved).length;
  int get verifiedCount => approvedCount;
  int get rejectedCount =>
      _reports.where((r) => r.status == ReportStatus.rejected).length;

  /// Starts (or restarts) the live subscription. Safe to call multiple
  /// times (e.g. from a "Refresh" button) — it just re-subscribes.
  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();

    _sub?.cancel();
    _sub = _repo.watchAll().listen(
      (reports) {
        _reports = reports;
        _loading = false;
        notifyListeners();
      },
      onError: (e) {
        _error = e.toString();
        _loading = false;
        notifyListeners();
      },
    );
  }

  Future<void> approve(int id, String adminName) async {
    // No manual reload needed afterward — the realtime stream updates
    // `_reports` automatically once the write commits.
    await _repo.verify(id, adminName);
  }

  Future<void> verify(int id, String adminName) => approve(id, adminName);

  Future<void> reject(int id, String reason, String adminName) async {
    await _repo.reject(id, reason, adminName);
  }

  Future<void> delete(int id, String adminName) async {
    await _repo.delete(id, adminName);
  }

  /// Cancels the live subscription. Call from the owning screen's dispose
  /// so the Realtime channel closes when the screen does.
  void stop() {
    _sub?.cancel();
    _sub = null;
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

/// Provides the audit trail for the MDRRMO dashboard.
class AuditProvider extends ChangeNotifier {
  final AuditRepository _repo = AuditRepository();

  List<AuditLog> _logs = [];
  bool _loading = true;

  List<AuditLog> get logs => _logs;
  bool get loading => _loading;

  Future<void> load() async {
    _loading = true;
    notifyListeners();
    _logs = await _repo.getLogs();
    _loading = false;
    notifyListeners();
  }
}
