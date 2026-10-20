import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Two-way message threads on community reports (public.report_messages).
///
/// The server sets sender_id and sender_role from the session, so inserts
/// only ever send `{report_id, body}`. It also enforces the 1-1000 character
/// limit and stops a resident after 3 messages in a row until staff reply
/// ("Please wait for a reply..."). Bodies are plain text: show them with
/// [Text] only, never as links or rich text.

const int kMessageMaxLength = 1000;

/// The character counter appears once a draft reaches this length.
const int kMessageCounterFrom = 800;

const String kEmptyThreadText = 'No messages yet. Ask or update here.';

enum SenderRole { resident, barangay, mdrrmo }

SenderRole? parseSenderRole(Object? value) {
  switch (value) {
    case 'resident':
      return SenderRole.resident;
    case 'barangay':
      return SenderRole.barangay;
    case 'mdrrmo':
      return SenderRole.mdrrmo;
  }
  return null;
}

String senderLabel(SenderRole role) {
  switch (role) {
    case SenderRole.resident:
      return 'Resident';
    case SenderRole.barangay:
      return 'Barangay';
    case SenderRole.mdrrmo:
      return 'MDRRMO';
  }
}

class ReportMessage {
  final Object id;
  final SenderRole senderRole;
  final String body;
  final DateTime createdAt;

  const ReportMessage({
    required this.id,
    required this.senderRole,
    required this.body,
    required this.createdAt,
  });

  /// Null for rows without a known sender role.
  static ReportMessage? fromRow(Map<String, dynamic> row) {
    final role = parseSenderRole(row['sender_role']);
    if (role == null || row['id'] == null) return null;
    return ReportMessage(
      id: row['id'] as Object,
      senderRole: role,
      body: row['body'] is String ? row['body'] as String : '',
      createdAt:
          DateTime.tryParse('${row['created_at']}')?.toUtc() ?? DateTime.now().toUtc(),
    );
  }
}

/// Trimmed body, or null when it cannot be sent (empty or over the limit).
String? sendableBody(String draft) {
  final body = draft.trim();
  return body.isNotEmpty && body.length <= kMessageMaxLength ? body : null;
}

/// "812/1000" once the draft is near the limit, otherwise null.
String? counterText(String draft) {
  final length = draft.trim().length;
  return length >= kMessageCounterFrom ? '$length/$kMessageMaxLength' : null;
}

/// True when the latest message is from another role and newer than [lastSeen].
bool hasNewMessage(
  ReportMessage? latest,
  SenderRole viewerRole,
  DateTime? lastSeen,
) {
  if (latest == null || latest.senderRole == viewerRole) return false;
  return lastSeen == null || latest.createdAt.isAfter(lastSeen);
}

/// The text to show under the input when a send fails.
String sendErrorText(Object error) {
  if (error is PostgrestException && error.message.trim().isNotEmpty) {
    return error.message;
  }
  return 'Unable to send the message. Please try again.';
}

/// Per-user, per-report "last seen message time", for the "New" dot.
/// Stored in shared_preferences as `bahaba_report_messages_seen_<userId>_<reportId>`.
class ReportThreadSeenStore {
  ReportThreadSeenStore._();

  static String _key(String userId, int reportId) =>
      'bahaba_report_messages_seen_${userId}_$reportId';

  static Future<DateTime?> lastSeen(String userId, int reportId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final millis = prefs.getInt(_key(userId, reportId));
      if (millis != null && millis > 0) {
        return DateTime.fromMillisecondsSinceEpoch(millis, isUtc: true);
      }
    } catch (error) {
      debugPrint('Report messages seen: read failed: $error');
    }
    return null;
  }

  static Future<void> markSeen(
    String userId,
    int reportId,
    DateTime createdAt,
  ) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = _key(userId, reportId);
      final millis = createdAt.millisecondsSinceEpoch;
      if ((prefs.getInt(key) ?? 0) >= millis) return;
      await prefs.setInt(key, millis);
    } catch (error) {
      debugPrint('Report messages seen: write failed: $error');
    }
  }
}

class ReportMessagesService {
  ReportMessagesService({SupabaseClient? client}) : _injected = client;

  final SupabaseClient? _injected;
  SupabaseClient get _client => _injected ?? Supabase.instance.client;

  static const String _columns = 'id, sender_role, body, created_at';

  Future<List<ReportMessage>> fetchThread(int reportId) async {
    final rows = await _client
        .from('report_messages')
        .select(_columns)
        .eq('report_id', reportId)
        .order('created_at', ascending: true);
    return [
      for (final row in rows)
        if (ReportMessage.fromRow(row) case final message?) message,
    ];
  }

  Future<ReportMessage?> fetchLatest(int reportId) async {
    final rows = await _client
        .from('report_messages')
        .select(_columns)
        .eq('report_id', reportId)
        .order('created_at', ascending: false)
        .limit(1);
    return rows.isEmpty ? null : ReportMessage.fromRow(rows.first);
  }

  /// Sends `{report_id, body}` only; the server fills in the sender.
  Future<ReportMessage?> send(int reportId, String draft) async {
    final body = sendableBody(draft);
    if (body == null) {
      throw ArgumentError('Write 1-$kMessageMaxLength characters.');
    }
    final row = await _client
        .from('report_messages')
        .insert({'report_id': reportId, 'body': body})
        .select(_columns)
        .single();
    return ReportMessage.fromRow(row);
  }

  /// New messages on one report. Remove the returned channel with
  /// [unsubscribe] when the thread closes.
  RealtimeChannel subscribe(
    int reportId,
    void Function(ReportMessage message) onInsert,
  ) {
    return _client
        .channel(
            'report-messages-$reportId-${DateTime.now().microsecondsSinceEpoch}')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'report_messages',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'report_id',
            value: reportId,
          ),
          callback: (payload) {
            final message = ReportMessage.fromRow(payload.newRecord);
            if (message != null) onInsert(message);
          },
        )
        .subscribe();
  }

  Future<void> unsubscribe(RealtimeChannel channel) async {
    try {
      await _client.removeChannel(channel);
    } catch (error) {
      debugPrint('Report messages: removeChannel failed: $error');
    }
  }
}
