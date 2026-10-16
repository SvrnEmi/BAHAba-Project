import 'package:latlong2/latlong.dart';

import '../models/barangay_model.dart';
import '../models/community_report_model.dart';

/// Helpers for showing community reports on the resident Home screen.

const double _matchRadiusMeters = 3000;

String _normalize(String text) =>
    text.toLowerCase().replaceAll(RegExp(r'[\s-]+'), '');

/// Whether [report] belongs to [barangay]. community_reports has no barangay
/// column yet, so this decides on the device (replace when one is added):
///  1. With coordinates: the nearest barangay decides, if within 3 km.
///  2. Otherwise: the location text contains the barangay name
///     (case-insensitive, spaces and hyphens ignored).
bool reportBelongsToBarangay(
  CommunityReport report,
  String barangay,
  List<Barangay> barangays,
) {
  final lat = report.lat;
  final lng = report.lng;
  if (lat != null && lng != null && barangays.isNotEmpty) {
    const distance = Distance();
    final here = LatLng(lat, lng);
    Barangay? nearest;
    var nearestMeters = double.infinity;
    for (final b in barangays) {
      final meters = distance(here, LatLng(b.lat, b.lng));
      if (meters < nearestMeters) {
        nearestMeters = meters;
        nearest = b;
      }
    }
    if (nearest != null && nearestMeters <= _matchRadiusMeters) {
      return _normalize(nearest.name) == _normalize(barangay);
    }
  }
  final wanted = _normalize(barangay);
  return wanted.isNotEmpty && _normalize(report.location).contains(wanted);
}

String waterLevelLabel(WaterLevel level) {
  switch (level) {
    case WaterLevel.ankle:
      return 'Ankle-deep';
    case WaterLevel.knee:
      return 'Knee-deep';
    case WaterLevel.waist:
      return 'Waist-deep';
    case WaterLevel.chest:
      return 'Chest-deep';
    case WaterLevel.overhead:
      return 'Over head';
  }
}

/// Never shows a full email: "juan.cruz@x.com" becomes "Juan.cruz".
String displayReporterName(String userName) {
  final raw = userName.trim();
  final at = raw.indexOf('@');
  final name = at >= 0 ? raw.substring(0, at) : raw;
  if (name.isEmpty) return 'Resident';
  return name[0].toUpperCase() + name.substring(1);
}

/// "just now", "12 min ago", "3 hrs ago", "2 days ago", or a date.
String relativeTime(String timestamp) {
  final parsed = DateTime.tryParse(timestamp)?.toLocal();
  if (parsed == null) return '';
  final diff = DateTime.now().difference(parsed);
  if (diff.isNegative || diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
  if (diff.inHours < 24) {
    return '${diff.inHours} ${diff.inHours == 1 ? 'hr' : 'hrs'} ago';
  }
  if (diff.inDays < 7) {
    return '${diff.inDays} ${diff.inDays == 1 ? 'day' : 'days'} ago';
  }
  return '${parsed.month}/${parsed.day}/${parsed.year}';
}
