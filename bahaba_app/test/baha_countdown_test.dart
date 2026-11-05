import 'package:bahaba_app/models/community_report_model.dart';
import 'package:bahaba_app/utils/baha_countdown.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  // 2:00 PM local; forecast fetched 10 minutes earlier.
  final now = DateTime(2026, 10, 25, 14);
  Map<String, dynamic> row({
    double next3h = 0,
    double peak = 0,
    DateTime? peakAt,
    String risk = 'low',
    DateTime? updated,
  }) =>
      {
        'flood_risk': risk,
        'rain_next_3h': next3h,
        'peak_rain_mm_h': peak,
        'peak_rain_at': peakAt?.toUtc().toIso8601String(),
        'auto_updated_at': (updated ?? now.subtract(const Duration(minutes: 10)))
            .toUtc()
            .toIso8601String(),
      };

  BahaCountdown build(Map<String, dynamic> r,
          [CountdownLang lang = CountdownLang.en]) =>
      BahaCountdown.fromRow(r, lang: lang, now: now)!;

  test('heavy rain in about 2 hours with a peak time', () {
    final c = build(row(peak: 12, peakAt: DateTime(2026, 10, 25, 16)));
    expect(c.headline, 'Heavy rain expected in about 2 hours.');
    expect(c.peakLine, 'Peak around 4:00 PM.');
    expect(c.impact, WaterLevel.knee);
    expect(c.heavy, isTrue);
    expect(c.stale, isFalse);
  });

  test('Filipino text', () {
    final c = build(
        row(peak: 12, peakAt: DateTime(2026, 10, 25, 16)), CountdownLang.fil);
    expect(c.headline,
        'Inaasahan ang malakas na ulan sa loob ng mga 2 oras.');
    expect(c.peakLine, 'Pinakamalakas bandang 4:00 PM.');
    expect(countdownWaterLabel(c.impact!, CountdownLang.fil),
        'Hanggang tuhod');
  });

  test('heavy rain during the peak hour', () {
    final c = build(row(peak: 20, peakAt: DateTime(2026, 10, 25, 14)));
    expect(c.headline, 'Heavy rain now.');
    expect(c.peakLine, 'Peak is happening now.');
    expect(c.impact, WaterLevel.waist);
  });

  test('peak tomorrow says tomorrow', () {
    final c = build(row(peak: 9, peakAt: DateTime(2026, 10, 26, 4)));
    expect(c.peakLine, 'Peak around 4:00 AM tomorrow.');
  });

  test('a peak that already passed is ignored', () {
    final c = build(row(peak: 12, peakAt: DateTime(2026, 10, 25, 12)));
    expect(c.headline, 'No rain expected in the next 24 hours.');
    expect(c.peakLine, isNull);
    expect(c.impact, isNull);
  });

  test('moderate and light rain', () {
    expect(build(row(peak: 3, peakAt: DateTime(2026, 10, 25, 18))).headline,
        'Moderate rain expected.');
    final light = build(row(peak: 1.8, peakAt: DateTime(2026, 10, 25, 18)));
    expect(light.headline, 'Light rain only in the next 24 hours.');
    expect(light.impact, isNull);
  });

  test('high risk sets at least knee-deep', () {
    expect(build(row(risk: 'high')).impact, WaterLevel.knee);
    expect(build(row(risk: 'medium')).impact, WaterLevel.ankle);
  });

  test('forecast never predicts overhead', () {
    final c = build(row(peak: 80, peakAt: DateTime(2026, 10, 25, 15)));
    expect(c.impact, WaterLevel.chest);
  });

  test('old data is flagged stale', () {
    final c = build(row(updated: now.subtract(const Duration(hours: 5))));
    expect(c.stale, isTrue);
  });

  test('no forecast yet', () {
    expect(
        BahaCountdown.fromRow({'flood_risk': 'low'},
            lang: CountdownLang.en, now: now),
        isNull);
  });

  test('updated text in both languages', () {
    final t = now.subtract(const Duration(minutes: 12)).toIso8601String();
    expect(countdownUpdated(t, CountdownLang.en, now: now),
        'Updated 12 min ago');
    expect(countdownUpdated(t, CountdownLang.fil, now: now),
        'Na-update 12 min ang nakalipas');
  });
}
