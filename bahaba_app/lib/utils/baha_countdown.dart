import 'package:intl/intl.dart';

import '../models/barangay_model.dart';
import '../models/community_report_model.dart';

/// Language for the Baha Countdown card.
enum CountdownLang { en, fil }

/// PAGASA rainfall intensity bands, in mm per hour.
const double moderateRainMmH = 2.5;
const double heavyRainMmH = 7.5;
const double intenseRainMmH = 15;
const double torrentialRainMmH = 30;

/// update-flood-risk runs every 30 minutes; older than this is stale.
const Duration countdownStaleAfter = Duration(hours: 3);

/// Plain-language rain countdown for one barangay row.
class BahaCountdown {
  /// "Heavy rain expected in about 2 hours."
  final String headline;

  /// "Peak around 4:00 PM." or null when there is no peak to show.
  final String? peakLine;

  /// Expected street flooding, or null when none is expected.
  final WaterLevel? impact;

  /// True when the data is older than [countdownStaleAfter].
  final bool stale;

  /// True when heavy rain (>= [heavyRainMmH]) is expected.
  final bool heavy;

  const BahaCountdown({
    required this.headline,
    required this.peakLine,
    required this.impact,
    required this.stale,
    required this.heavy,
  });

  /// Builds the countdown from a `barangays` row. Uses rain_next_3h,
  /// peak_rain_mm_h, peak_rain_at, auto_updated_at and flood_risk.
  /// Returns null when the row has no forecast yet.
  static BahaCountdown? fromRow(
    Map<String, dynamic> row, {
    required CountdownLang lang,
    DateTime? now,
  }) {
    final updated = _time(row['auto_updated_at']);
    if (updated == null) return null;
    final at = (now ?? DateTime.now()).toLocal();
    final fil = lang == CountdownLang.fil;

    final next3h = _num(row['rain_next_3h']) ?? 0;
    var peak = _num(row['peak_rain_mm_h']) ?? 0;
    var peakAt = _time(row['peak_rain_at']);
    // peak_rain_at is the start of the wettest hour. Once that hour is
    // over, the stored peak no longer describes what is coming.
    if (peakAt != null && !at.isBefore(peakAt.add(const Duration(hours: 1)))) {
      peakAt = null;
      peak = 0;
    }

    final stale = at.difference(updated) > countdownStaleAfter;
    // Heavy for the whole next 3 hours on average, even if the peak is later.
    final heavyNext3h = next3h >= heavyRainMmH * 3;
    final heavy = peak >= heavyRainMmH || heavyNext3h;

    final String headline;
    if (peak >= heavyRainMmH && peakAt != null) {
      final minutes = peakAt.difference(at).inMinutes;
      if (minutes <= 0) {
        headline = fil ? 'Malakas na ang ulan ngayon.' : 'Heavy rain now.';
      } else if (minutes < 60) {
        headline = fil
            ? 'Inaasahan ang malakas na ulan sa loob ng isang oras.'
            : 'Heavy rain expected within the hour.';
      } else if (heavyNext3h && minutes > 180) {
        headline = fil
            ? 'Inaasahan ang malakas na ulan sa loob ng 3 oras.'
            : 'Heavy rain expected within 3 hours.';
      } else {
        final hours = (minutes / 60).round();
        headline = fil
            ? 'Inaasahan ang malakas na ulan sa loob ng mga $hours oras.'
            : 'Heavy rain expected in about $hours '
                '${hours == 1 ? 'hour' : 'hours'}.';
      }
    } else if (heavyNext3h) {
      headline = fil
          ? 'Inaasahan ang malakas na ulan sa loob ng 3 oras.'
          : 'Heavy rain expected within 3 hours.';
    } else if (peak >= moderateRainMmH) {
      headline =
          fil ? 'Inaasahan ang katamtamang ulan.' : 'Moderate rain expected.';
    } else if (peak > 0 || next3h > 0) {
      headline = fil
          ? 'Mahinang ulan lang sa susunod na 24 oras.'
          : 'Light rain only in the next 24 hours.';
    } else {
      headline = fil
          ? 'Walang inaasahang ulan sa susunod na 24 oras.'
          : 'No rain expected in the next 24 hours.';
    }

    return BahaCountdown(
      headline: headline,
      peakLine: peakAt == null || peak <= 0
          ? null
          : _peakLine(peakAt, at, peak, fil),
      impact: expectedImpact(
        peakMmH: peak,
        next3hMm: next3h,
        risk: row['flood_risk'] as String?,
      ),
      stale: stale,
      heavy: heavy,
    );
  }

  /// Expected street flooding on the shared water level scale. Forecasts
  /// never claim overhead; that is left to verified reports.
  static WaterLevel? expectedImpact({
    required double peakMmH,
    required double next3hMm,
    String? risk,
  }) {
    final rate = peakMmH > next3hMm / 3 ? peakMmH : next3hMm / 3;
    var rank = rate >= torrentialRainMmH
        ? 4
        : rate >= intenseRainMmH
            ? 3
            : rate >= heavyRainMmH
                ? 2
                : rate >= moderateRainMmH
                    ? 1
                    : 0;
    // Ground already saturated: the current risk sets a floor.
    final floor = switch (risk) { 'high' => 2, 'medium' => 1, _ => 0 };
    if (rank < floor) rank = floor;
    return switch (rank) {
      1 => WaterLevel.ankle,
      2 => WaterLevel.knee,
      3 => WaterLevel.waist,
      4 => WaterLevel.chest,
      _ => null,
    };
  }

  static String _peakLine(DateTime peakAt, DateTime now, double mm, bool fil) {
    if (!now.isBefore(peakAt)) {
      return fil ? 'Pinakamalakas na ngayon.' : 'Peak is happening now.';
    }
    final time = DateFormat('h:mm a').format(peakAt);
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(peakAt.year, peakAt.month, peakAt.day);
    final tomorrow = day.difference(today).inDays >= 1;
    if (fil) {
      return tomorrow
          ? 'Pinakamalakas bukas bandang $time.'
          : 'Pinakamalakas bandang $time.';
    }
    return tomorrow ? 'Peak around $time tomorrow.' : 'Peak around $time.';
  }

  static double? _num(Object? v) =>
      v is num ? v.toDouble() : double.tryParse('${v ?? ''}');

  static DateTime? _time(Object? v) =>
      v == null ? null : DateTime.tryParse(v.toString())?.toLocal();
}

/// Short water level name, e.g. "Knee-deep" / "Hanggang tuhod".
String countdownWaterLabel(WaterLevel level, CountdownLang lang) {
  if (lang == CountdownLang.en) {
    return switch (level) {
      WaterLevel.ankle => 'Ankle-deep',
      WaterLevel.knee => 'Knee-deep',
      WaterLevel.waist => 'Waist-deep',
      WaterLevel.chest => 'Chest-deep',
      WaterLevel.overhead => 'Over head',
    };
  }
  return switch (level) {
    WaterLevel.ankle => 'Hanggang bukung-bukong',
    WaterLevel.knee => 'Hanggang tuhod',
    WaterLevel.waist => 'Hanggang baywang',
    WaterLevel.chest => 'Hanggang dibdib',
    WaterLevel.overhead => 'Lampas ulo',
  };
}

String countdownRiskLabel(FloodRisk? risk, CountdownLang lang) {
  final fil = lang == CountdownLang.fil;
  return switch (risk) {
    FloodRisk.high => fil ? 'Mataas na panganib' : 'High Risk',
    FloodRisk.medium => fil ? 'Katamtamang panganib' : 'Medium Risk',
    FloodRisk.low => fil ? 'Mababang panganib' : 'Low Risk',
    null => fil ? 'Walang datos' : 'Risk unavailable',
  };
}

/// "Updated 12 min ago" / "Na-update 12 min ang nakalipas".
String countdownUpdated(Object? value, CountdownLang lang, {DateTime? now}) {
  final fil = lang == CountdownLang.fil;
  final parsed = value == null ? null : DateTime.tryParse('$value')?.toLocal();
  if (parsed == null) return fil ? 'Wala pang update' : 'Not yet updated';
  final diff = (now ?? DateTime.now()).difference(parsed);
  final String ago;
  if (diff.isNegative || diff.inMinutes < 1) {
    return fil ? 'Na-update ngayon lang' : 'Updated just now';
  } else if (diff.inMinutes < 60) {
    ago = '${diff.inMinutes} min';
  } else if (diff.inHours < 24) {
    ago = fil
        ? '${diff.inHours} oras'
        : '${diff.inHours} ${diff.inHours == 1 ? 'hr' : 'hrs'}';
  } else {
    final d = diff.inDays;
    ago = fil ? '$d araw' : '$d ${d == 1 ? 'day' : 'days'}';
  }
  return fil ? 'Na-update $ago ang nakalipas' : 'Updated $ago ago';
}
