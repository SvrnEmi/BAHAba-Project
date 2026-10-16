import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/community_report_model.dart';
import '../repositories/audit_repository.dart';
import '../services/realtime_hub.dart';

/// Data access for community flood reports.
///
/// Supabase is the single source of truth. Local SQLite caching was removed
/// on purpose: the previous hybrid design silently fell back to a stale
/// local cache whenever the Supabase call failed for any reason, which
/// masked real errors (including permission denials) and made deleted/
/// updated reports appear to "come back" after admin actions.
class ReportRepository {
  final AuditRepository _audit = AuditRepository();

  SupabaseClient get _client => Supabase.instance.client;

  /// One-shot fetch — use for simple reads where a live stream isn't needed.
  Future<List<CommunityReport>> getAll() async {
    final rows = await _client
        .from('community_reports')
        .select()
        .order('timestamp', ascending: false);
    return rows.map<CommunityReport>(_fromRow).toList();
  }

  /// Live stream of ALL reports, ordered newest first. Use this for the
  /// MDRRMO admin dashboard so approve/reject/delete actions from any
  /// device are reflected immediately without a manual refresh.
  Stream<List<CommunityReport>> watchAll() => _watchWhere((_) => true);

  /// Live stream of approved reports only. Use this for the public
  /// community feed so pending/rejected reports are never shown.
  Stream<List<CommunityReport>> watchApproved() =>
      _watchWhere((row) => row['status'] == 'approved');

  /// Live stream of reports submitted by [userName]. Use this on the
  /// resident-facing "My Reports" screen so status changes (and deletions)
  /// made by MDRRMO appear immediately.
  Stream<List<CommunityReport>> watchByUserName(String userName) =>
      _watchWhere((row) => row['user_name'] == userName);

  /// All report streams share one community_reports channel (see
  /// [RealtimeHub]); each applies its own filter and newest-first order.
  Stream<List<CommunityReport>> _watchWhere(
    bool Function(Map<String, dynamic> row) test,
  ) {
    return RealtimeHub.instance.table('community_reports').map((rows) {
      final matching = rows.where(test).toList()
        ..sort((a, b) => (b['timestamp'] ?? '')
            .toString()
            .compareTo((a['timestamp'] ?? '').toString()));
      return matching.map<CommunityReport>(_fromRow).toList();
    });
  }

  /// One-shot read of reports submitted under any of [userNames], newest
  /// first (used by the Profile screen; no realtime).
  Future<List<CommunityReport>> fetchByUserNames(List<String> userNames) async {
    if (userNames.isEmpty) return [];
    final rows = await _client
        .from('community_reports')
        .select()
        .inFilter('user_name', userNames)
        .order('timestamp', ascending: false);
    return rows.map<CommunityReport>(_fromRow).toList();
  }

  Future<List<CommunityReport>> getByStatus(ReportStatus status) async {
    final rows = await _client
        .from('community_reports')
        .select()
        .eq('status', status.value)
        .order('timestamp', ascending: false);
    return rows.map<CommunityReport>(_fromRow).toList();
  }

  Future<List<CommunityReport>> getByUserName(String userName) async {
    final rows = await _client
        .from('community_reports')
        .select()
        .eq('user_name', userName)
        .order('timestamp', ascending: false);
    return rows.map<CommunityReport>(_fromRow).toList();
  }

  Future<CommunityReport> submit({
    required String userName,
    required String location,
    double? lat,
    double? lng,
    required WaterLevel waterLevel,
    required String description,
    String? photoPath,
  }) async {
    final row = await _client
        .from('community_reports')
        .insert({
          'user_name': userName,
          'location': location,
          'lat': lat,
          'lng': lng,
          'water_level': waterLevel.value,
          'description': description,
          'photo_path': photoPath,
          'status': ReportStatus.pending.value,
        })
        .select()
        .single();

    return _fromRow(row);
  }

  Future<void> updateReportStatus(
    int reportId,
    String newStatus, {
    String? rejectionReason,
  }) async {
    debugPrint('Updating report $reportId to $newStatus');
    final response = await _client
        .from('community_reports')
        .update({
          'status': newStatus,
          if (rejectionReason != null) 'rejection_reason': rejectionReason,
        })
        .eq('id', reportId)
        .select();
    debugPrint('Update report $reportId result: $response');
    if (response.isEmpty) {
      throw Exception(
        'Update failed or not permitted for report $reportId. '
        'Confirm the logged-in account has role "mdrrmo" in profiles.',
      );
    }
  }

  Future<void> sendReportReply(int reportId, String replyText) async {
    final response = await _client
        .from('community_reports')
        .update({'admin_reply': replyText})
        .eq('id', reportId)
        .select();

    if (response.isEmpty) {
      throw Exception(
        'Unable to send reply to report $reportId — only MDRRMO admins can reply.',
      );
    }
  }

  Future<void> deleteReport(int reportId) async {
    debugPrint('Deleting report $reportId');
    final response = await _client
        .from('community_reports')
        .delete()
        .eq('id', reportId)
        .select();
    debugPrint('Delete report $reportId result: $response');
    if (response.isEmpty) {
      throw Exception(
        'Delete failed or not permitted for report $reportId. '
        'Confirm the logged-in account has role "mdrrmo" in profiles.',
      );
    }
  }

  Future<void> verify(int id, String adminName) async {
    await updateReportStatus(id, ReportStatus.approved.value);
    await _audit.log(
      action: 'REPORT_APPROVED',
      user: adminName,
      details: 'Approved report #$id',
    );
  }

  Future<void> reject(int id, String reason, String adminName) async {
    await updateReportStatus(id, ReportStatus.rejected.value,
        rejectionReason: reason);
    await _audit.log(
      action: 'REPORT_REJECTED',
      user: adminName,
      details: 'Rejected report #$id - Reason: $reason',
    );
  }

  Future<void> delete(int id, String adminName) async {
    await deleteReport(id);
    await _audit.log(
      action: 'REPORT_DELETED',
      user: adminName,
      details: 'Deleted report #$id',
    );
  }

  Future<int> count() async {
    final rows = await _client.from('community_reports').select('id');
    return rows.length;
  }

  CommunityReport _fromRow(Map<String, dynamic> row) => CommunityReport(
        id: row['id'] as int?,
        userName: row['user_name'] as String? ?? '',
        location: row['location'] as String? ?? '',
        lat: (row['lat'] as num?)?.toDouble(),
        lng: (row['lng'] as num?)?.toDouble(),
        waterLevel:
            WaterLevel.fromString(row['water_level'] as String? ?? 'ankle'),
        description: row['description'] as String? ?? '',
        photoPath: row['photo_path'] as String?,
        status: ReportStatus.fromString(row['status'] as String? ?? 'pending'),
        timestamp:
            row['timestamp'] as String? ?? DateTime.now().toIso8601String(),
        rejectionReason: row['rejection_reason'] as String?,
        adminReply: row['admin_reply'] as String?,
        adminReplyAt: row['admin_reply_at'] as String?,
      );
}
