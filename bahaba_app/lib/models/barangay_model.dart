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

class Barangay {
  final int? id;
  final String name;
  final double lat;
  final double lng;
  final FloodRisk floodRisk;
  final String waterLevel;
  final String population;
  final String evacuated;
  final String lastUpdate;
  final String description;

  const Barangay({
    this.id,
    required this.name,
    required this.lat,
    required this.lng,
    required this.floodRisk,
    required this.waterLevel,
    required this.population,
    required this.evacuated,
    required this.lastUpdate,
    required this.description,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'lat': lat,
      'lng': lng,
      'flood_risk': floodRisk.value,
      'water_level': waterLevel,
      'population': population,
      'evacuated': evacuated,
      'last_update': lastUpdate,
      'description': description,
    };
  }

  factory Barangay.fromMap(Map<String, dynamic> map) {
    return Barangay(
      id: map['id'] as int?,
      name: map['name'] as String,
      lat: (map['lat'] as num).toDouble(),
      lng: (map['lng'] as num).toDouble(),
      floodRisk: FloodRisk.fromString(map['flood_risk'] as String),
      waterLevel: map['water_level'] as String,
      population: map['population'] as String,
      evacuated: map['evacuated'] as String,
      lastUpdate: map['last_update'] as String,
      description: map['description'] as String,
    );
  }
}

