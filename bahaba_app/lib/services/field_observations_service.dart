import 'package:supabase_flutter/supabase_flutter.dart';

/// What barangay officials report from the ground (public.field_observations).
class FieldObservation {
  final int id;
  final String barangay;
  final String kind;
  final String location;
  final String status;
  final String? note;
  final DateTime observedAt;

  const FieldObservation({
    required this.id,
    required this.barangay,
    required this.kind,
    required this.location,
    required this.status,
    this.note,
    required this.observedAt,
  });

  factory FieldObservation.fromRow(Map<String, dynamic> row) {
    final note = (row['note'] ?? '').toString().trim();
    return FieldObservation(
      id: (row['id'] as num).toInt(),
      barangay: (row['barangay'] ?? '').toString(),
      kind: (row['kind'] ?? '').toString(),
      location: (row['location'] ?? '').toString(),
      status: (row['status'] ?? '').toString(),
      note: note.isEmpty ? null : note,
      observedAt: DateTime.parse(row['observed_at'] as String).toLocal(),
    );
  }

  /// Older than this, a reading may no longer be true.
  static const staleAfter = Duration(hours: 6);

  bool isStale(DateTime now) => now.difference(observedAt) > staleAfter;
}

/// The newest reading of each place. [rows] must be newest first.
List<FieldObservation> latestPerLocation(List<FieldObservation> rows) {
  final seen = <String>{};
  return [
    for (final row in rows)
      if (seen.add('${row.kind}:${row.location.trim().toLowerCase()}')) row,
  ];
}

class FieldObservationsService {
  static const _columns =
      'id, barangay, kind, location, status, note, observed_at';

  /// The table has no realtime, so callers read it on open and on a timer.
  static Future<List<FieldObservation>> latestFor(String barangay) async {
    final rows = await Supabase.instance.client
        .from('field_observations')
        .select(_columns)
        .eq('barangay', barangay)
        .order('observed_at', ascending: false)
        .limit(200);
    return latestPerLocation(rows.map(FieldObservation.fromRow).toList());
  }
}
