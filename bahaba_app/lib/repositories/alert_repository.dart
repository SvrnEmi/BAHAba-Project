import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/database_helper.dart';
import '../models/alert_model.dart';
import '../models/audit_log_model.dart';
import '../services/realtime_hub.dart';
import '../services/sync_service.dart';

/// Data access for alerts + audit logging.
class AlertRepository {
  final DatabaseHelper _db = DatabaseHelper.instance;
  final SyncService _sync = SyncService.instance;

  SupabaseClient get _client => Supabase.instance.client;

  /// Broadcast alerts (approved) shown to residents.
  Future<List<Alert>> getBroadcastAlerts() =>
      _db.getAlerts(onlyBroadcast: true);

  /// Live stream of approved alerts for the resident feed.
  Stream<List<Alert>> watchBroadcastAlerts() {
    return Stream.fromFuture(getBroadcastAlerts());
  }

  /// All alerts (for admin alert history).
  Future<List<Alert>> getAllAlerts() => _db.getAllAlerts();

  /// Live stream of all alerts, ordered newest first.
  /// Uses the shared alerts channel (see [RealtimeHub]).
  Stream<List<Alert>> watchAll() {
    return RealtimeHub.instance.table('alerts').map((rows) {
      final sorted = [...rows]..sort((a, b) => (b['sent_at'] ?? '')
          .toString()
          .compareTo((a['sent_at'] ?? '').toString()));
      return sorted.map<Alert>(_fromRow).toList();
    });
  }

  /// Alerts targeting [barangayName] or all barangays, newest first.
  Future<List<Alert>> fetchForBarangay(String barangayName) async {
    final rows = await _client
        .from('alerts')
        .select()
        .or('target_barangay.eq."$barangayName",target_barangay.eq."All Barangays"')
        .order('sent_at', ascending: false);
    return rows.map<Alert>(_fromRow).toList();
  }

  /// Submits a barangay admin's alert directly to Supabase as pending, so
  /// MDRRMO can review it right away.
  Future<Alert> submitForVerification({
    required AlertLevel level,
    required String title,
    required String message,
    required String barangayName,
    required int recipients,
  }) async {
    final row = await _client
        .from('alerts')
        .insert({
          'level': level.value,
          'title': title,
          'message': message,
          'target_barangay': barangayName,
          'channels': AlertChannel.push.value,
          'sent_at': DateTime.now().toUtc().toIso8601String(),
          'recipients': recipients,
          'created_by': '$barangayName Barangay Admin',
          'status': AlertStatus.pending.value,
        })
        .select()
        .single();
    return _fromRow(row);
  }

  /// Alerts pending MDRRMO verification (created by barangay admins).
  Future<List<Alert>> getPendingAlerts() => _db.getPendingAlerts();

  /// Alerts created by a specific user (barangay admin "my alerts").
  Future<List<Alert>> getMyAlerts(String createdBy) =>
      _db.getMyAlerts(createdBy);

  Future<Alert> createAlert({
    required AlertLevel level,
    required String title,
    required String message,
    required String targetBarangay,
    required List<AlertChannel> channels,
    required String createdBy,
    AlertStatus status = AlertStatus.approved,
    String source = 'mdrrmo',
    int recipients = 0,
  }) async {
    final alert = Alert(
      level: level,
      title: title,
      message: message,
      targetBarangay: targetBarangay,
      channels: channels,
      sentAt: _now(),
      recipients: recipients,
      createdBy: createdBy,
      status: status,
      source: source,
    );
    final id = await _db.insertAlert(alert);
    return Alert(
      id: id,
      level: alert.level,
      title: alert.title,
      message: alert.message,
      targetBarangay: alert.targetBarangay,
      channels: alert.channels,
      sentAt: alert.sentAt,
      recipients: alert.recipients,
      createdBy: alert.createdBy,
      status: alert.status,
      source: alert.source,
    );
  }

  Future<void> approveAlert(int id, String adminName) async {
    await _db.updateAlertStatus(id, AlertStatus.approved);
    await _db.insertAuditLog(AuditLog(
      action: 'ALERT_APPROVED',
      user: adminName,
      timestamp: _now(),
      details: 'Approved alert #$id for broadcast',
    ));
  }

  Future<void> rejectAlert(int id, String reason, String adminName) async {
    await _db.updateAlertStatus(id, AlertStatus.rejected,
        rejectionReason: reason);
    await _db.insertAuditLog(AuditLog(
      action: 'ALERT_REJECTED',
      user: adminName,
      timestamp: _now(),
      details: 'Rejected alert #$id - Reason: $reason',
    ));
  }

  Future<int> count() => _db.alertCount();

  Future<void> syncPending() => _sync.syncPending();

  Future<void> syncRemote() => _sync.pullRemote();

  Alert _fromRow(Map<String, dynamic> row) => Alert(
        id: row['id'] as int?,
        level: AlertLevel.fromString(row['level'] as String? ?? 'advisory'),
        title: row['title'] as String? ?? '',
        message: row['message'] as String? ?? '',
        targetBarangay: row['target_barangay'] as String? ?? 'All Barangays',
        channels: (row['channels'] as String? ?? '')
            .split(',')
            .where((c) => c.isNotEmpty)
            .map(AlertChannel.fromString)
            .toList(),
        sentAt: row['sent_at'] as String? ?? DateTime.now().toIso8601String(),
        recipients: row['recipients'] as int? ?? 0,
        createdBy: row['created_by'] as String? ?? 'System',
        status: AlertStatus.fromString(row['status'] as String? ?? 'approved'),
        rejectionReason: row['rejection_reason'] as String?,
        source: row['source'] as String? ?? 'mdrrmo',
      );

  String _now() =>
      DateTime.now().toIso8601String().replaceFirst('T', ' ').substring(0, 16);
}
