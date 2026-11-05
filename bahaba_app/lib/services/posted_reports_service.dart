import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/community_report_model.dart';

/// An approved community report as residents see it. The reporter's name is
/// never read here: these screens say "Reported by a resident of {barangay}".
class PostedReport {
  final int id;
  final String location;
  final WaterLevel waterLevel;
  final String? description;
  final String? photoPath;
  final DateTime timestamp;
  final String? barangay;
  final String? userId;
  final String status;
  final String? rejectionReason;

  const PostedReport({
    required this.id,
    required this.location,
    required this.waterLevel,
    this.description,
    this.photoPath,
    required this.timestamp,
    this.barangay,
    this.userId,
    this.status = 'approved',
    this.rejectionReason,
  });

  factory PostedReport.fromRow(Map<String, dynamic> row) => PostedReport(
        id: (row['id'] as num).toInt(),
        location: (row['location'] as String?)?.trim() ?? '',
        waterLevel: WaterLevel.fromString((row['water_level'] ?? '') as String),
        description: row['description'] as String?,
        photoPath: row['photo_path'] as String?,
        timestamp:
            DateTime.tryParse((row['timestamp'] ?? '') as String)?.toLocal() ??
                DateTime.now(),
        barangay: row['barangay'] as String?,
        userId: row['user_id'] as String?,
        status: (row['status'] ?? 'approved') as String,
        rejectionReason: row['rejection_reason'] as String?,
      );
}

class PostedReportsService {
  PostedReportsService._();

  static const _columns =
      'id, location, water_level, description, photo_path, timestamp, barangay';
  static const _popupColumns =
      'id, location, water_level, timestamp, barangay, user_id, status, '
      'rejection_reason';
  static const _feedLimit = 20;
  static const catchUpLimit = 100;

  /// The report open on screen, so no pop-up appears for it.
  static int? viewingId;

  static SupabaseClient get _client => Supabase.instance.client;

  /// Newer reports store a full URL; a bare path is in the public bucket.
  static String photoUrl(String path) => path.startsWith('http')
      ? path
      : _client.storage.from('report-photos').getPublicUrl(path);

  static Future<List<PostedReport>> fetch(String barangay) async {
    final rows = await _client
        .from('community_reports')
        .select(_columns)
        .eq('status', 'approved')
        .eq('barangay', barangay)
        .order('timestamp', ascending: false)
        .limit(_feedLimit);
    return rows.map<PostedReport>(PostedReport.fromRow).toList();
  }

  static Future<PostedReport?> fetchOne(int id) async {
    final row = await _client
        .from('community_reports')
        .select(_columns)
        .eq('id', id)
        .eq('status', 'approved')
        .maybeSingle();
    return row == null ? null : PostedReport.fromRow(row);
  }

  /// Newest reports a pop-up could be about: the barangay's approved ones and
  /// the resident's own decided ones.
  static Future<List<PostedReport>> fetchForPopups(
    String barangay,
    String userId,
  ) async {
    final rows = await _client
        .from('community_reports')
        .select(_popupColumns)
        .or('and(status.eq.approved,barangay.eq."$barangay"),'
            'and(user_id.eq.$userId,status.in.(approved,rejected))')
        .order('timestamp', ascending: false)
        .limit(catchUpLimit);
    return rows.map<PostedReport>(PostedReport.fromRow).toList();
  }
}
