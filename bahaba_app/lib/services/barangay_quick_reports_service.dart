import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// A Quick Report as a barangay official reads it. Read-only: the MDRRMO is
/// the only verifier.
class BarangayQuickReport {
  final Object id;
  final DateTime? createdAt;
  final String? landmark;
  final double? lat;
  final double? lng;
  final String? waterLevel;
  final String? description;
  final String? photoPath;
  final String? reporterName;
  final String? reporterPhone;
  final String status;
  final String? rejectionReason;
  final bool flaggedFalse;
  final String? flagReason;
  final DateTime? reviewedAt;

  const BarangayQuickReport({
    required this.id,
    this.createdAt,
    this.landmark,
    this.lat,
    this.lng,
    this.waterLevel,
    this.description,
    this.photoPath,
    this.reporterName,
    this.reporterPhone,
    this.status = 'pending',
    this.rejectionReason,
    this.flaggedFalse = false,
    this.flagReason,
    this.reviewedAt,
  });

  factory BarangayQuickReport.fromRow(Map<String, dynamic> row) {
    DateTime? time(Object? value) =>
        DateTime.tryParse('${value ?? ''}')?.toLocal();
    return BarangayQuickReport(
      id: row['id'] as Object,
      createdAt: time(row['created_at']),
      landmark: row['landmark'] as String?,
      lat: (row['lat'] as num?)?.toDouble(),
      lng: (row['lng'] as num?)?.toDouble(),
      waterLevel: row['water_level'] as String?,
      description: row['description'] as String?,
      photoPath: row['photo_path'] as String?,
      reporterName: row['reporter_name'] as String?,
      reporterPhone: row['reporter_phone'] as String?,
      status: (row['status'] ?? 'pending') as String,
      rejectionReason: row['rejection_reason'] as String?,
      flaggedFalse: row['flagged_false'] == true,
      flagReason: row['flag_reason'] as String?,
      reviewedAt: time(row['reviewed_at']),
    );
  }

  bool get isPending => status == 'pending' && !flaggedFalse;
}

class BarangayQuickReportsService {
  SupabaseClient get _client => Supabase.instance.client;

  /// Explicit list: `select *` and table streams fail on quick_reports, because
  /// its hash columns are not readable. Live changes use [subscribe] instead
  /// of RealtimeHub for the same reason.
  static const _columns =
      'id, created_at, barangay, landmark, lat, lng, water_level, description, '
      'photo_path, reporter_name, reporter_phone, status, rejection_reason, '
      'flagged_false, flag_reason, reviewed_by, reviewed_at';

  Future<List<BarangayQuickReport>> fetch(String barangay) async {
    final rows = await _client
        .from('quick_reports')
        .select(_columns)
        .eq('barangay', barangay)
        .order('created_at', ascending: false)
        .limit(200);
    return rows.map<BarangayQuickReport>(BarangayQuickReport.fromRow).toList();
  }

  /// One report of the barangay. Throws if it is gone.
  Future<BarangayQuickReport> fetchOne(Object id, String barangay) async {
    final row = await _client
        .from('quick_reports')
        .select(_columns)
        .eq('id', id)
        .eq('barangay', barangay)
        .single();
    return BarangayQuickReport.fromRow(row);
  }

  /// Calls [onChange] on any change the official may see (RLS limits it to
  /// their barangay). Remove the returned channel with [unsubscribe].
  RealtimeChannel subscribe(void Function() onChange) {
    return _client
        .channel('quick-reports-${DateTime.now().microsecondsSinceEpoch}')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'quick_reports',
          callback: (_) => onChange(),
        )
        .subscribe();
  }

  Future<void> unsubscribe(RealtimeChannel channel) async {
    try {
      await _client.removeChannel(channel);
    } catch (error) {
      debugPrint('Quick reports: removeChannel failed: $error');
    }
  }

  /// The bucket is private: a 5-minute signed URL.
  Future<String> signedPhotoUrl(String path) => _client.storage
      .from('quick-report-photos')
      .createSignedUrl(path, 300);
}
