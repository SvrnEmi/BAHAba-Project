import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/database_helper.dart';
import '../models/alert_model.dart';
import '../models/audit_log_model.dart';
import '../models/community_report_model.dart';

class SyncService {
  SyncService._();
  static final SyncService instance = SyncService._();

  final DatabaseHelper _db = DatabaseHelper.instance;
  final SupabaseClient _client = Supabase.instance.client;
  final Connectivity _connectivity = Connectivity();

  StreamSubscription<List<ConnectivityResult>>? _subscription;
  bool _isRunning = false;

  Future<void> init() async {
    _subscription = _connectivity.onConnectivityChanged.listen((results) async {
      final connected = results.any((result) => result != ConnectivityResult.none);
      if (connected) {
        await syncPending();
      }
    });

    final status = await _connectivity.checkConnectivity();
    if (status.any((result) => result != ConnectivityResult.none)) {
      await syncPending();
      await pullRemote();
    }
  }

  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
  }

  Future<void> syncPending() async {
    if (_isRunning) return;
    _isRunning = true;

    try {
      await _syncAlerts();
      await _syncReports();
      await _syncAuditLogs();
    } finally {
      _isRunning = false;
    }
  }

  Future<void> pullRemote() async {
    await _pullAlerts();
    await _pullReports();
    await _pullAuditLogs();
  }

  Future<void> _syncAlerts() async {
    final pending = await _db.pendingRows('alerts');
    for (final row in pending) {
      final id = row['id'];
      if (id == null) continue;
      final payload = {
        'id': id,
        'level': row['level'],
        'title': row['title'],
        'message': row['message'],
        'target_barangay': row['target_barangay'],
        'channels': row['channels'],
        'sent_at': row['sent_at'],
        'recipients': row['recipients'] ?? 0,
        'created_by': row['created_by'],
        'status': row['status'] ?? 'approved',
        'rejection_reason': row['rejection_reason'],
        'source': row['source'] ?? 'mdrrmo',
      };

      final response = await _client.from('alerts').upsert(payload).select();
      if (response.isNotEmpty) {
        await _db.markSynced('alerts', id as int);
      }
    }
  }

  Future<void> _syncReports() async {
    final pending = await _db.pendingRows('community_reports');
    for (final row in pending) {
      final id = row['id'];
      if (id == null) continue;
      final payload = {
        'id': id,
        'user_name': row['user_name'],
        'location': row['location'],
        'lat': row['lat'],
        'lng': row['lng'],
        'water_level': row['water_level'],
        'description': row['description'],
        'photo_path': row['photo_path'],
        'status': row['status'] ?? 'pending',
        'timestamp': row['timestamp'],
        'rejection_reason': row['rejection_reason'],
      };

      final response = await _client.from('community_reports').upsert(payload).select();
      if (response.isNotEmpty) {
        await _db.markSynced('community_reports', id as int);
      }
    }
  }

  Future<void> _syncAuditLogs() async {
    final pending = await _db.pendingRows('audit_logs');
    for (final row in pending) {
      final id = row['id'];
      if (id == null) continue;
      final payload = {
        'id': id,
        'action': row['action'],
        'user': row['user'],
        'timestamp': row['timestamp'],
        'details': row['details'],
      };

      final response = await _client.from('audit_logs').upsert(payload).select();
      if (response.isNotEmpty) {
        await _db.markSynced('audit_logs', id as int);
      }
    }
  }

  Future<void> _pullAlerts() async {
    final rows = await _client.from('alerts').select();
    for (final row in rows as List<dynamic>) {
      final payload = row as Map<String, dynamic>;
      final alert = Alert(
        id: payload['id'] as int?,
        level: AlertLevel.fromString(payload['level'] as String? ?? 'advisory'),
        title: payload['title'] as String? ?? '',
        message: payload['message'] as String? ?? '',
        targetBarangay: payload['target_barangay'] as String? ?? '',
        channels: (payload['channels'] as String? ?? '')
            .split(',')
            .where((c) => c.isNotEmpty)
            .map(AlertChannel.fromString)
            .toList(),
        sentAt: payload['sent_at'] as String? ?? DateTime.now().toIso8601String(),
        recipients: payload['recipients'] as int? ?? 0,
        createdBy: payload['created_by'] as String? ?? 'system',
        status: AlertStatus.fromString(payload['status'] as String? ?? 'approved'),
        rejectionReason: payload['rejection_reason'] as String?,
        source: payload['source'] as String? ?? 'mdrrmo',
      );

      await _db.upsertRow('alerts', alert.toMap(), conflictKey: 'id');
    }
  }

  Future<void> _pullReports() async {
    final rows = await _client
        .from('community_reports')
        .select()
        .eq('status', ReportStatus.approved.value);
    final remoteIds = <int>{};

    for (final row in rows as List<dynamic>) {
      final payload = row as Map<String, dynamic>;
      final report = CommunityReport(
        id: payload['id'] as int?,
        userName: payload['user_name'] as String? ?? '',
        location: payload['location'] as String? ?? '',
        lat: (payload['lat'] as num?)?.toDouble(),
        lng: (payload['lng'] as num?)?.toDouble(),
        waterLevel: WaterLevel.fromString(payload['water_level'] as String? ?? 'ankle'),
        description: payload['description'] as String? ?? '',
        photoPath: payload['photo_path'] as String?,
        status: ReportStatus.fromString(payload['status'] as String? ?? 'pending'),
        timestamp: payload['timestamp'] as String? ?? DateTime.now().toIso8601String(),
        rejectionReason: payload['rejection_reason'] as String?,
      );

      if (report.id != null) {
        remoteIds.add(report.id!);
      }

      await _db.upsertRow('community_reports', report.toMap(), conflictKey: 'id');
    }

    final localRows = await _db.getReports();
    for (final localRow in localRows) {
      if (localRow.id != null && !remoteIds.contains(localRow.id)) {
        final db = await _db.database;
        await db.delete(
          'community_reports',
          where: 'id = ?',
          whereArgs: [localRow.id],
        );
      }
    }
  }

  Future<void> _pullAuditLogs() async {
    final rows = await _client.from('audit_logs').select();
    for (final row in rows as List<dynamic>) {
      final payload = row as Map<String, dynamic>;
      final log = AuditLog(
        id: payload['id'] as int?,
        action: payload['action'] as String? ?? '',
        user: payload['user'] as String? ?? '',
        timestamp: payload['timestamp'] as String? ?? DateTime.now().toIso8601String(),
        details: payload['details'] as String? ?? '',
      );

      await _db.upsertRow('audit_logs', log.toMap(), conflictKey: 'id');
    }
  }
}
