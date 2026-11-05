import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/barangay_model.dart';
import '../models/community_report_model.dart';
import '../repositories/barangay_repository.dart';
import '../theme/app_theme.dart';
import '../utils/baha_countdown.dart';
import 'clay_container.dart';
import 'info_tip.dart';
import 'risk_badge.dart';
import 'water_level_icon.dart';

/// Home card: when heavy rain is expected in the resident's barangay, when
/// it peaks, and how deep the water may get. Reads only existing columns
/// on `barangays` (filled by update-flood-risk), on the shared channel.
class BahaCountdownCard extends StatefulWidget {
  final String? barangayName;

  const BahaCountdownCard({super.key, required this.barangayName});

  @override
  State<BahaCountdownCard> createState() => _BahaCountdownCardState();
}

class _BahaCountdownCardState extends State<BahaCountdownCard> {
  static const _langKey = 'baha_countdown_lang';

  Stream<Map<String, dynamic>?>? _stream;
  Timer? _tick;
  CountdownLang _lang = CountdownLang.en;

  @override
  void initState() {
    super.initState();
    _stream = _watch();
    // "in about 2 hours" and "Updated 5 min ago" move with the clock.
    _tick = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
    _loadLang();
  }

  @override
  void didUpdateWidget(covariant BahaCountdownCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.barangayName != widget.barangayName) _stream = _watch();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Stream<Map<String, dynamic>?>? _watch() {
    final name = widget.barangayName;
    if (name == null || name.isEmpty) return null;
    return BarangayRepository().watchBarangay(name);
  }

  Future<void> _loadLang() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_langKey);
    if (!mounted || saved == null) return;
    setState(() =>
        _lang = saved == 'fil' ? CountdownLang.fil : CountdownLang.en);
  }

  Future<void> _setLang(CountdownLang lang) async {
    setState(() => _lang = lang);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_langKey, lang.name);
  }

  @override
  Widget build(BuildContext context) {
    if (_stream == null) return const SizedBox.shrink();
    return StreamBuilder<Map<String, dynamic>?>(
      stream: _stream,
      builder: (context, snapshot) {
        final row = snapshot.data;
        // The status card above already explains a missing barangay row.
        if (snapshot.hasError || row == null) return const SizedBox.shrink();
        return ClayContainer(
          padding: const EdgeInsets.all(16),
          child: _content(row),
        );
      },
    );
  }

  Widget _content(Map<String, dynamic> row) {
    final fil = _lang == CountdownLang.fil;
    final countdown = BahaCountdown.fromRow(row, lang: _lang);
    final risk = switch (row['flood_risk']) {
      'low' => FloodRisk.low,
      'medium' => FloodRisk.medium,
      'high' => FloodRisk.high,
      _ => null,
    };

    final header = Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: countdown?.heavy == true
                ? AppColors.peach
                : AppColors.lavender,
            shape: BoxShape.circle,
          ),
          child: Icon(
            Icons.timer_outlined,
            size: 22,
            color: countdown?.heavy == true
                ? AppColors.peachIcon
                : AppColors.lavenderIcon,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text('Baha Countdown', style: AppText.heading(size: 16)),
        ),
        const InfoTip(
          label: 'Baha Countdown',
          text: 'When heavy rain is expected in your barangay, when it peaks '
              'and how deep the water may get. From the Open-Meteo forecast, '
              'checked every 30 minutes. It is an estimate, not a rain gauge.',
        ),
        _LangToggle(lang: _lang, onChanged: _setLang),
      ],
    );

    final status = Wrap(
      spacing: 10,
      runSpacing: 8,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SolidBadge(
          label: countdownRiskLabel(risk, _lang),
          color: RiskBadge.colorFor(risk),
          icon: RiskBadge.iconFor(risk),
        ),
        Text(
          countdownUpdated(row['auto_updated_at'], _lang),
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
        ),
      ],
    );

    if (countdown == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          header,
          const SizedBox(height: 12),
          Text(
            fil
                ? 'Wala pang forecast ng ulan para sa inyong barangay.'
                : 'No rain forecast for your barangay yet.',
            style: const TextStyle(fontSize: 15, color: AppColors.ink),
          ),
          const SizedBox(height: 12),
          status,
        ],
      );
    }

    final impact = countdown.impact;
    final impactText = impact == null
        ? (fil ? 'Walang inaasahang baha' : 'No flooding expected')
        : '${fil ? 'Posibleng baha' : 'Possible flooding'}: '
            '${countdownWaterLabel(impact, _lang)}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        header,
        const SizedBox(height: 12),
        Semantics(
          liveRegion: true,
          child: Text(
            countdown.headline,
            style: AppText.heading(
              size: 19,
              color: countdown.heavy ? AppColors.riskHigh : AppColors.ink,
            ).copyWith(height: 1.3),
          ),
        ),
        if (countdown.peakLine != null) ...[
          const SizedBox(height: 4),
          Text(
            countdown.peakLine!,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.ink,
            ),
          ),
        ],
        const SizedBox(height: 14),
        Text(
          impactText,
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.ink,
          ),
        ),
        const SizedBox(height: 8),
        Semantics(
          label: impactText,
          child: Row(
            children: [
              for (final level in WaterLevel.values)
                Expanded(
                  child: _ScaleStep(
                    level: level,
                    active: level == impact,
                    lang: _lang,
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        status,
        if (countdown.stale) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.history, size: 18, color: AppColors.riskMedium),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  fil
                      ? 'Maaaring luma na ang forecast.'
                      : 'Forecast may be out of date.',
                  style: const TextStyle(fontSize: 13, color: AppColors.ink),
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 6),
        Text(
          fil
              ? 'Awtomatikong tantiya mula sa forecast ng ulan.'
              : 'Automatic estimate from the rain forecast.',
          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
        ),
      ],
    );
  }
}

/// One step of the water level scale; the expected level is outlined.
class _ScaleStep extends StatelessWidget {
  final WaterLevel level;
  final bool active;
  final CountdownLang lang;

  const _ScaleStep({
    required this.level,
    required this.active,
    required this.lang,
  });

  @override
  Widget build(BuildContext context) {
    final color = WaterLevelIcon.colorFor(level);
    final short = switch (level) {
      WaterLevel.ankle => lang == CountdownLang.fil ? 'Bukong' : 'Ankle',
      WaterLevel.knee => lang == CountdownLang.fil ? 'Tuhod' : 'Knee',
      WaterLevel.waist => lang == CountdownLang.fil ? 'Baywang' : 'Waist',
      WaterLevel.chest => lang == CountdownLang.fil ? 'Dibdib' : 'Chest',
      WaterLevel.overhead => lang == CountdownLang.fil ? 'Ulo' : 'Head',
    };
    return ExcludeSemantics(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        padding: const EdgeInsets.symmetric(vertical: 6),
        decoration: BoxDecoration(
          color: active ? color.withValues(alpha: 0.12) : Colors.transparent,
          border: Border.all(
            color: active ? color : Colors.transparent,
            width: 2,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            WaterLevelIcon(level: level, size: 36, active: active),
            const SizedBox(height: 4),
            Text(
              short,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                color: active ? AppColors.ink : AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// EN | FIL switch with 48px tap targets.
class _LangToggle extends StatelessWidget {
  final CountdownLang lang;
  final ValueChanged<CountdownLang> onChanged;

  const _LangToggle({required this.lang, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    Widget option(CountdownLang value, String label, String semantic) {
      final selected = lang == value;
      return Semantics(
        button: true,
        selected: selected,
        label: semantic,
        child: InkWell(
          onTap: () => onChanged(value),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
            alignment: Alignment.center,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: selected ? AppColors.primaryShade : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: ExcludeSemantics(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: selected ? Colors.white : AppColors.primaryShade,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        option(CountdownLang.en, 'EN', 'English'),
        option(CountdownLang.fil, 'FIL', 'Filipino'),
      ],
    );
  }
}
