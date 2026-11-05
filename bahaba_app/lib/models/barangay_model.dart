/// Flood risk levels.
enum FloodRisk {
  high,
  medium,
  low;

  static FloodRisk fromString(String value) {
    switch (value) {
      case 'high':
        return FloodRisk.high;
      case 'low':
        return FloodRisk.low;
      default:
        return FloodRisk.medium;
    }
  }

  String get value {
    switch (this) {
      case FloodRisk.high:
        return 'high';
      case FloodRisk.medium:
        return 'medium';
      case FloodRisk.low:
        return 'low';
    }
  }

  String get label {
    switch (this) {
      case FloodRisk.high:
        return 'High Risk';
      case FloodRisk.medium:
        return 'Medium Risk';
      case FloodRisk.low:
        return 'Low Risk';
    }
  }

  String get colorHex {
    switch (this) {
      case FloodRisk.high:
        return '#EF4444';
      case FloodRisk.medium:
        return '#EAB308';
      case FloodRisk.low:
        return '#22C55E';
    }
  }
}

/// A barangay flood zone: one approximate centre point and its live risk.
class Barangay {
  final int? id;
  final String name;
  final double lat;
  final double lng;
  final FloodRisk floodRisk;
  final String lastUpdate;

  const Barangay({
    this.id,
    required this.name,
    required this.lat,
    required this.lng,
    required this.floodRisk,
    required this.lastUpdate,
  });

  /// Row for the local SQLite cache. The old water_level, population,
  /// evacuated and description columns are NOT NULL, so they get ''.
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'lat': lat,
      'lng': lng,
      'flood_risk': floodRisk.value,
      'last_update': lastUpdate,
      'water_level': '',
      'population': '',
      'evacuated': '',
      'description': '',
    };
  }

  /// A local cache row, or a Supabase barangays row. Null when it has no
  /// usable name or coordinates.
  static Barangay? tryFromMap(Map<String, dynamic> map) {
    final name = (map['name'] ?? '').toString().trim();
    final lat = map['lat'];
    final lng = map['lng'];
    if (name.isEmpty || lat is! num || lng is! num) return null;
    return Barangay(
      id: map['id'] is num ? (map['id'] as num).toInt() : null,
      name: name,
      lat: lat.toDouble(),
      lng: lng.toDouble(),
      floodRisk: FloodRisk.fromString(map['flood_risk']?.toString() ?? 'low'),
      lastUpdate: map['last_update']?.toString() ?? '',
    );
  }
}
