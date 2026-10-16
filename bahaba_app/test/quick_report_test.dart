import 'package:bahaba_app/services/quick_report_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('QuickReportInput.toJson', () {
    test('sends only filled fields, the water level id, and an empty honeypot', () {
      final json = const QuickReportInput(
        waterLevel: WaterLevel.overhead,
        barangay: 'Poblacion',
        landmark: '  ',
        reporterName: ' Juan ',
      ).toJson();
      expect(json, {
        'water_level': 'overhead',
        'barangay': 'Poblacion',
        'reporter_name': 'Juan',
        'website': '',
      });
    });

    test('location needs both lat and lng', () {
      expect(const QuickReportInput(waterLevel: WaterLevel.knee, lat: 12.4).toJson().containsKey('lat'), isFalse);
      final json = const QuickReportInput(waterLevel: WaterLevel.knee, lat: 12.4, lng: 122.02).toJson();
      expect(json['lat'], 12.4);
      expect(json['lng'], 122.02);
    });

    test('photo adds want_photo and photo_ext', () {
      final json = const QuickReportInput(waterLevel: WaterLevel.ankle, barangay: 'X', photoExt: 'jpg').toJson();
      expect(json['want_photo'], true);
      expect(json['photo_ext'], 'jpg');
    });

    test('description is capped at 500 characters', () {
      final json = QuickReportInput(waterLevel: WaterLevel.waist, barangay: 'X', description: 'a' * 600).toJson();
      expect((json['description'] as String).length, QuickReportService.descriptionMax);
    });
  });

  test('water level ids match the backend', () {
    expect(WaterLevel.values.map((w) => w.id), ['ankle', 'knee', 'waist', 'chest', 'overhead']);
    expect(WaterLevel.values.map((w) => w.label), ['Ankle', 'Knee', 'Waist', 'Chest', 'Over head']);
  });
}
