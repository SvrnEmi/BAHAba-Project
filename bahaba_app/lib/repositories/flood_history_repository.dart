import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/flood_event_model.dart';

/// Flood events and the Baha History map data.
///
/// The map reads reports only through the flood_history() function, which
/// returns approved reports without any reporter details.
class FloodHistoryRepository {
  SupabaseClient get _client => Supabase.instance.client;

  /// Newest first.
  Future<List<FloodEvent>> events() async {
    final rows = await _client
        .from('flood_events')
        .select('id, name, start_at, end_at')
        .order('start_at', ascending: false);
    return [for (final row in rows) FloodEvent.fromMap(row)];
  }

  /// Approved reports in [eventId]'s window, or all when null.
  Future<List<HistoryReport>> history({int? eventId}) async {
    final rows = await _client
        .rpc('flood_history', params: {'p_event_id': eventId}) as List;
    return [
      for (final row in rows)
        HistoryReport.fromMap(Map<String, dynamic>.from(row as Map)),
    ];
  }

  /// Displayable photo URL. Community photos are public URLs; quick report
  /// photos are private and need a short-lived signed URL.
  Future<String?> photoUrl(HistoryReport report) async {
    final path = report.photoPath;
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http')) return path;
    return _client.storage
        .from(report.photoBucket ?? 'quick-report-photos')
        .createSignedUrl(path, 300);
  }

  // MDRRMO only (enforced by RLS; created_by is set by the database).

  Future<void> createEvent(String name, DateTime start, DateTime end) =>
      _client.from('flood_events').insert(_payload(name, start, end));

  Future<void> updateEvent(int id, String name, DateTime start, DateTime end) async {
    final rows = await _client
        .from('flood_events')
        .update(_payload(name, start, end))
        .eq('id', id)
        .select('id');
    if (rows.isEmpty) throw Exception('Update not permitted.');
  }

  Future<void> deleteEvent(int id) async {
    final rows =
        await _client.from('flood_events').delete().eq('id', id).select('id');
    if (rows.isEmpty) throw Exception('Delete not permitted.');
  }

  Map<String, dynamic> _payload(String name, DateTime start, DateTime end) => {
        'name': name.trim(),
        'start_at': start.toUtc().toIso8601String(),
        'end_at': end.toUtc().toIso8601String(),
      };
}
