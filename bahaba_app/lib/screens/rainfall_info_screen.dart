import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/barangay_model.dart';
import '../theme/app_theme.dart';
import '../widgets/clay_container.dart';
import '../widgets/risk_badge.dart';

/// "How rainfall risk works": plain-language explanation of the automatic
/// flood level. Thresholds are read from risk_settings (id = 1) and the
/// PAGASA table from pagasa_levels, so the screen shows the live values.
class RainfallInfoScreen extends StatefulWidget {
  const RainfallInfoScreen({super.key});

  @override
  State<RainfallInfoScreen> createState() => _RainfallInfoScreenState();
}

class _RainfallInfoScreenState extends State<RainfallInfoScreen> {
  Map<String, dynamic>? _rules;
  bool _rulesFailed = false;
  List<Map<String, dynamic>>? _pagasa;
  bool _pagasaFailed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final client = Supabase.instance.client;
    try {
      final row = await client
          .from('risk_settings')
          .select(
              'auto_enabled, medium_mm_3h, high_mm_3h, medium_mm_24h, high_mm_24h, override_hours, holddown_hours')
          .eq('id', 1)
          .maybeSingle();
      if (mounted) setState(() => row == null ? _rulesFailed = true : _rules = row);
    } catch (_) {
      if (mounted) setState(() => _rulesFailed = true);
    }
    try {
      final rows = await client
          .from('pagasa_levels')
          .select(
              'code, color, label, alert_level, meaning, hourly_mm_min, hourly_mm_max, advisory_24h_mm_min, advisory_24h_mm_max, sort_order')
          .order('sort_order', ascending: true);
      if (mounted) setState(() => _pagasa = List<Map<String, dynamic>>.from(rows));
    } catch (_) {
      if (mounted) setState(() => _pagasaFailed = true);
    }
  }

  String _mm(String key) {
    final v = _rules?[key];
    return v == null ? '?' : '$v mm';
  }

  String _hrs(String key) {
    final v = _rules?[key];
    if (v == null) return 'a few hours';
    return '$v ${v == 1 ? 'hour' : 'hours'}';
  }

  static String _range(dynamic min, dynamic max) {
    if (min == null && max == null) return '-';
    if (max == null) return '$min mm or more';
    if (min == null || min == 0) return 'below $max mm';
    return '$min to $max mm';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('How rainfall risk works')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            const _Section(
              title: 'Where the numbers come from',
              children: [
                Text(
                    'BAHAba reads the rainfall forecast from Open-Meteo, a free weather-model service. These are model estimates of how much rain will fall, not readings from rain gauges in Odiongan.'),
                SizedBox(height: 6),
                Text(
                    'The forecast is read again every 30 minutes, for one point in each barangay.'),
              ],
            ),
            _Section(
              title: 'How the flood level is chosen',
              children: [
                const Text(
                    'For each barangay BAHAba looks at two numbers: the worst 3-hour burst (the most rain expected in any 3 hours in a row) and the 24-hour total (all the rain expected in the next 24 hours).'),
                const SizedBox(height: 10),
                if (_rules != null) ...[
                  _RuleRow(
                    badge: const RiskBadge(risk: FloodRisk.high, compact: true),
                    text:
                        '${_mm('high_mm_3h')} or more in 3 hours, or ${_mm('high_mm_24h')} or more in 24 hours',
                  ),
                  _RuleRow(
                    badge: const RiskBadge(risk: FloodRisk.medium, compact: true),
                    text:
                        '${_mm('medium_mm_3h')} or more in 3 hours, or ${_mm('medium_mm_24h')} or more in 24 hours',
                  ),
                  const _RuleRow(
                    badge: RiskBadge(risk: FloodRisk.low, compact: true),
                    text: 'Less rain than that',
                  ),
                  if (_rules!['auto_enabled'] == false)
                    const Padding(
                      padding: EdgeInsets.only(top: 6),
                      child: Text(
                          'Automatic updates are currently off; levels are set by hand.',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                ] else
                  Text(
                    _rulesFailed
                        ? 'The current thresholds could not be loaded. Ask the MDRRMO for the current values.'
                        : 'Loading the current thresholds...',
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
              ],
            ),
            _Section(
              title: 'When a level is set by hand',
              children: [
                Text(
                    'A barangay admin or the MDRRMO can set the level themselves. A manual level holds for ${_hrs('override_hours')}; after that, or when they choose "Return to automatic", the forecast takes over again.'),
                const SizedBox(height: 6),
                Text(
                    'Once the level goes up, it stays up for at least ${_hrs('holddown_hours')} so it does not flicker between levels.'),
              ],
            ),
            _Section(
              title: 'PAGASA alert colors',
              children: [
                const Text(
                    'Alerts use the PAGASA colors, always with their label: Yellow - Be Alert, Orange - Be Prepared, Red - Take Action.'),
                const SizedBox(height: 10),
                if (_pagasa != null)
                  for (final row in _pagasa!)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${_cap(row['color'] as String? ?? row['code'] as String? ?? '')} - ${row['label'] ?? ''}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          Text(
                            'Per hour: ${_range(row['hourly_mm_min'], row['hourly_mm_max'])} · In 24 h: ${_range(row['advisory_24h_mm_min'], row['advisory_24h_mm_max'])}',
                            style: const TextStyle(fontSize: 12),
                          ),
                          if ((row['meaning'] as String?)?.isNotEmpty ?? false)
                            Text(row['meaning'] as String,
                                style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary)),
                        ],
                      ),
                    )
                else
                  Text(
                    _pagasaFailed
                        ? 'The PAGASA table could not be loaded.'
                        : 'Loading the PAGASA table...',
                    style: const TextStyle(color: AppColors.textSecondary),
                  ),
              ],
            ),
            const _Section(
              title: 'Limitations',
              children: [
                Text(
                    '• Forecasts are model estimates and can be wrong, especially for short, heavy thunderstorms.\n'
                    '• Each barangay uses one approximate point; nearby barangays often show the same numbers.\n'
                    '• Rainfall is not the same as flooding: drainage, rivers and tides also matter.\n'
                    '• BAHAba does not replace official PAGASA bulletins or MDRRMO instructions. In an emergency, call 911 or the MDRRMO at +63 919 079 8427.'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _cap(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}

class _Section extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _Section({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      child: DefaultTextStyle.merge(
        style: const TextStyle(fontSize: 13, height: 1.4, color: AppColors.ink),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              header: true,
              child: Text(title, style: AppText.heading(size: 16)),
            ),
            const SizedBox(height: 8),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _RuleRow extends StatelessWidget {
  final Widget badge;
  final String text;
  const _RuleRow({required this.badge, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Wrap(
        spacing: 8,
        runSpacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [badge, Text(text)],
      ),
    );
  }
}

/// Short version for the resident Home screen, linking to the full screen.
class RainfallInfoShortCard extends StatelessWidget {
  const RainfallInfoShortCard({super.key});

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.cloud_outlined, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text('How rainfall risk works',
                      style: AppText.heading(size: 15)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Every 30 minutes BAHAba checks the Open-Meteo rain forecast for your barangay. Heavy rain in 3 hours or a lot of rain in 24 hours raises the level. It is a forecast, not a rain gauge, and does not replace official PAGASA bulletins.',
            style: TextStyle(
                fontSize: 13, height: 1.4, color: AppColors.textSecondary),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                  builder: (_) => const RainfallInfoScreen())),
              child: const Text('Learn more'),
            ),
          ),
        ],
      ),
    );
  }
}
