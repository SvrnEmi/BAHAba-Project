import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/database_helper.dart';
import '../models/alert_model.dart';
import '../services/realtime_hub.dart';
import '../services/sync_service.dart';

/// Data access for alerts.
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

  /// Explicit columns (never select *).
  static const columns =
      'id, level, title, message, target_barangay, created_by, status, source, '
      'channels, sent_at, recipients, rejection_reason, withdrawn_reason';

  static String _targetFilter(String barangayName) =>
      'target_barangay.eq."$barangayName",target_barangay.eq."All Barangays"';

  /// Published (approved) alerts for a resident's barangay plus "All
  /// Barangays", newest first. Withdrawn alerts are hidden by the server.
  Future<List<Alert>> fetchResidentAlerts(String barangayName,
      {int limit = 50}) async {
    final rows = await _client
        .from('alerts')
        .select(columns)
        .eq('status', 'approved')
        .or(_targetFilter(barangayName))
        .order('sent_at', ascending: false)
        .limit(limit);
    return rows.map<Alert>(_fromRow).toList();
  }

  /// One page (20 rows, via range()) of the resident "All alerts" list with
  /// search, PAGASA color, source and date filters. Returns rows + total.
  Future<({List<Alert> rows, int total})> fetchResidentPage({
    required String barangayName,
    required int page,
    String search = '',
    AlertLevel? level,
    String? source,
    DateTime? from,
    DateTime? to,
    String sort = 'newest',
    int pageSize = 20,
  }) async {
    var query = _client
        .from('alerts')
        .select(columns)
        .eq('status', 'approved')
        .or(_targetFilter(barangayName));
    final text = search.replaceAll(RegExp(r'[,()%*\\"]'), ' ').trim();
    if (text.isNotEmpty) {
      query = query.or('title.ilike.%$text%,message.ilike.%$text%');
    }
    if (level != null) query = query.eq('level', level.value);
    if (source == 'barangay' || source == 'mdrrmo') {
      query = query.eq('source', source!);
    } else if (source == 'auto') {
      query = query.not('source', 'in', '(barangay,mdrrmo)');
    }
    if (from != null) {
      query = query.gte('sent_at', DateTime.utc(from.year, from.month, from.day)
          .subtract(const Duration(hours: 8))
          .toIso8601String());
    }
    if (to != null) {
      query = query.lt('sent_at', DateTime.utc(to.year, to.month, to.day + 1)
          .subtract(const Duration(hours: 8))
          .toIso8601String());
    }
    final start = page * pageSize;
    // pagasa_label sorts Be Alert < Be Prepared < Take Action: descending is Red first.
    final ordered = switch (sort) {
      'oldest' => query.order('sent_at', ascending: true),
      'level' => query
          .order('pagasa_label', ascending: false, nullsFirst: false)
          .order('sent_at', ascending: false),
      'barangay' => query
          .order('target_barangay', ascending: true)
          .order('sent_at', ascending: false),
      _ => query.order('sent_at', ascending: false),
    };
    final response = await ordered
        .range(start, start + pageSize - 1)
        .count(CountOption.exact);
    return (
      rows: response.data.map<Alert>(_fromRow).toList(),
      total: response.count,
    );
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

  /// Publishes a barangay admin's alert to their residents. The database
  /// stamps the status, source, target barangay and time for this role.
  Future<Alert> publishBarangayAlert({
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
        })
        .select()
        .single();
    return _fromRow(row);
  }

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

  Future<int> count() => _db.alertCount();

  Future<void> syncPending() => _sync.syncPending();

  Future<void> syncRemote() => _sync.pullRemote();

  Alert _fromRow(Map<String, dynamic> row) => Alert(
        id: row['id'] as int?,
        level: AlertLevel.fromString(row['level'] as String? ?? 'advisory'),
        title: row['title'] as String? ?? '',
        message: row['message'] as String? ?? '',
        targetBarangay: row['target_barangay'] as String? ?? 'All Barangays',
        channels: AlertChannel.parseList(row['channels'] as String?),
        sentAt: row['sent_at'] as String? ?? DateTime.now().toIso8601String(),
        recipients: row['recipients'] as int? ?? 0,
        createdBy: row['created_by'] as String? ?? 'System',
        status: AlertStatus.fromString(row['status'] as String? ?? 'approved'),
        rejectionReason: row['rejection_reason'] as String?,
        source: row['source'] as String? ?? 'mdrrmo',
        withdrawnReason: row['withdrawn_reason'] as String?,
      );

  String _now() =>
      DateTime.now().toIso8601String().replaceFirst('T', ' ').substring(0, 16);
}
