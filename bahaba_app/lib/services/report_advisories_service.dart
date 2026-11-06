import 'package:supabase_flutter/supabase_flutter.dart';

import 'realtime_hub.dart';

/// Advisories on community reports (public.report_advisories). The database
/// sets barangay, author_id, author_role, author_name and created_at, so inserts
/// only ever send `{report_id, body}`. Bodies are plain text: show them with
/// [Text] only.
///
/// Unlike a comment in the message thread, an advisory is public: residents
/// see it on the posted report once the report is verified. The reporter sees
/// it on their own report at any status. src/lib/reportAdvisories.ts in the web
/// app holds the same rules.

const int kAdvisoryMinLength = 3;
const int kAdvisoryMaxLength = 300;

class ReportAdvisory {
  final int id;
  final int reportId;
  final String authorId;
  final String authorRole;
  final String? authorName;
  final String body;
  final DateTime createdAt;

  const ReportAdvisory({
    required this.id,
    required this.reportId,
    required this.authorId,
    required this.authorRole,
    this.authorName,
    required this.body,
    required this.createdAt,
  });

  factory ReportAdvisory.fromRow(Map<String, dynamic> row) => ReportAdvisory(
        id: (row['id'] as num).toInt(),
        reportId: (row['report_id'] as num).toInt(),
        authorId: '${row['author_id'] ?? ''}',
        authorRole: '${row['author_role'] ?? ''}',
        authorName: row['author_name'] as String?,
        body: '${row['body'] ?? ''}',
        createdAt: DateTime.tryParse('${row['created_at']}')?.toLocal() ??
            DateTime.now(),
      );

  String get roleLabel => authorRole == 'mdrrmo' ? 'MDRRMO' : 'Barangay';

  /// The name the database saved, or the role when it is missing.
  String get author {
    final name = authorName?.trim() ?? '';
    return name.isEmpty ? roleLabel : name;
  }
}

/// Trimmed body, or null when it cannot be posted (the database counts
/// trimmed characters).
String? postableAdvisory(String draft) {
  final body = draft.trim();
  return body.length >= kAdvisoryMinLength && body.length <= kAdvisoryMaxLength
      ? body
      : null;
}

class ReportAdvisoriesService {
  ReportAdvisoriesService._();

  static const _columns =
      'id, report_id, barangay, author_id, author_role, author_name, body, '
      'created_at';

  static SupabaseClient get _client => Supabase.instance.client;

  /// Every advisory the user may read, newest first, on the shared channel.
  /// Callers filter by report.
  static Stream<List<ReportAdvisory>> rows() {
    try {
      _client;
    } catch (_) {
      return const Stream.empty(); // Supabase not initialised (tests).
    }
    return RealtimeHub.instance.table('report_advisories').map((rows) {
      final advisories = rows.map(ReportAdvisory.fromRow).toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return advisories;
    });
  }

  /// Sends `{report_id, body}` only; the database fills in the rest.
  static Future<ReportAdvisory> post(int reportId, String draft) async {
    final body = postableAdvisory(draft);
    if (body == null) {
      throw ArgumentError(
          'Write $kAdvisoryMinLength-$kAdvisoryMaxLength characters.');
    }
    final row = await _client
        .from('report_advisories')
        .insert({'report_id': reportId, 'body': body})
        .select(_columns)
        .single();
    return ReportAdvisory.fromRow(row);
  }

  static Future<void> delete(int id) async {
    final rows = await _client
        .from('report_advisories')
        .delete()
        .eq('id', id)
        .select('id');
    if (rows.isEmpty) {
      throw Exception('The advisory was not deleted.');
    }
  }

  /// Newest advisories on the resident's own reports, for the catch-up dialog.
  static Future<List<ReportAdvisory>> fetchFor(
    Iterable<int> reportIds, {
    int limit = 100,
  }) async {
    final ids = reportIds.toList();
    if (ids.isEmpty) return [];
    final rows = await _client
        .from('report_advisories')
        .select(_columns)
        .inFilter('report_id', ids)
        .order('created_at', ascending: false)
        .limit(limit);
    return rows.map<ReportAdvisory>(ReportAdvisory.fromRow).toList();
  }

  static String? get currentUserId {
    try {
      return _client.auth.currentUser?.id;
    } catch (_) {
      return null; // Supabase not initialised (tests).
    }
  }
}
