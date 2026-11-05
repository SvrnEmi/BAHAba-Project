import 'community_report_model.dart';

/// A named flood window, e.g. "Typhoon Obet". Reports whose time falls
/// between [startAt] and [endAt] belong to it.
class FloodEvent {
  final int id;
  final String name;
  final DateTime startAt;
  final DateTime endAt;

  const FloodEvent({
    required this.id,
    required this.name,
    required this.startAt,
    required this.endAt,
  });

  factory FloodEvent.fromMap(Map<String, dynamic> map) => FloodEvent(
        id: (map['id'] as num).toInt(),
        name: map['name'] as String,
        startAt: DateTime.parse(map['start_at'] as String).toLocal(),
        endAt: DateTime.parse(map['end_at'] as String).toLocal(),
      );
}

/// One approved report on the Baha History map, from flood_history().
/// Carries no reporter details by design.
class HistoryReport {
  /// 'community' or 'quick'.
  final String source;
  final int reportId;
  final WaterLevel waterLevel;
  final double lat;
  final double lng;
  final DateTime reportedAt;
  final String? barangay;
  final String? photoBucket;
  final String? photoPath;

  const HistoryReport({
    required this.source,
    required this.reportId,
    required this.waterLevel,
    required this.lat,
    required this.lng,
    required this.reportedAt,
    this.barangay,
    this.photoBucket,
    this.photoPath,
  });

  bool get hasPhoto => photoPath != null && photoPath!.isNotEmpty;

  factory HistoryReport.fromMap(Map<String, dynamic> map) => HistoryReport(
        source: map['source'] as String,
        reportId: (map['report_id'] as num).toInt(),
        waterLevel: WaterLevel.fromString(map['water_level'] as String? ?? ''),
        lat: (map['lat'] as num).toDouble(),
        lng: (map['lng'] as num).toDouble(),
        reportedAt: DateTime.parse(map['reported_at'] as String).toLocal(),
        barangay: map['barangay'] as String?,
        photoBucket: map['photo_bucket'] as String?,
        photoPath: map['photo_path'] as String?,
      );
}
