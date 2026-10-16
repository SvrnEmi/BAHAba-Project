import 'package:flutter/material.dart';

import '../models/alert_model.dart';
import '../models/barangay_model.dart';
import '../theme/app_theme.dart';

/// Solid, high-contrast badge: color + icon + text label.
///
/// Flat on purpose: no clay, no gradient, no shadow. A risk or status color
/// is never shown without its text label.
class SolidBadge extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;

  /// Smaller variant for dense tables and lists.
  final bool compact;

  const SolidBadge({
    super.key,
    required this.label,
    required this.color,
    this.icon,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final fg = AppColors.onBadge(color);
    return Container(
      padding: compact
          ? const EdgeInsets.symmetric(horizontal: 8, vertical: 3)
          : const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.badgeFill(color),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: compact ? 12 : 16, color: fg),
            SizedBox(width: compact ? 4 : 6),
          ],
          Text(
            label,
            style: TextStyle(
              color: fg,
              fontSize: compact ? 11 : 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

/// A solid badge showing a flood risk level.
class RiskBadge extends StatelessWidget {
  final FloodRisk? risk;
  final bool compact;

  const RiskBadge({super.key, required this.risk, this.compact = false});

  /// From a raw `flood_risk` value ('low' | 'medium' | 'high'). Anything
  /// else shows a grey "Risk unavailable" badge.
  RiskBadge.fromValue(String? value, {super.key, this.compact = false})
      : risk = switch (value) {
          'low' => FloodRisk.low,
          'medium' => FloodRisk.medium,
          'high' => FloodRisk.high,
          _ => null,
        };

  static Color colorFor(FloodRisk? risk) => switch (risk) {
        FloodRisk.high => AppColors.riskHigh,
        FloodRisk.medium => AppColors.riskMedium,
        FloodRisk.low => AppColors.riskLow,
        null => AppColors.textSecondary,
      };

  static IconData iconFor(FloodRisk? risk) => switch (risk) {
        FloodRisk.high => Icons.warning_rounded,
        FloodRisk.medium => Icons.warning_amber_rounded,
        FloodRisk.low => Icons.check_circle_outline,
        null => Icons.help_outline,
      };

  @override
  Widget build(BuildContext context) {
    return SolidBadge(
      label: risk?.label ?? 'Risk unavailable',
      color: colorFor(risk),
      icon: iconFor(risk),
      compact: compact,
    );
  }
}

/// A solid badge for alert levels (ISO standard).
class AlertLevelBadge extends StatelessWidget {
  final AlertLevel level;
  final bool compact;

  const AlertLevelBadge({super.key, required this.level, this.compact = false});

  static Color colorFor(AlertLevel level) => switch (level) {
        AlertLevel.advisory => AppColors.info,
        AlertLevel.warning => AppColors.warning,
        AlertLevel.critical => AppColors.danger,
      };

  @override
  Widget build(BuildContext context) {
    final icon = switch (level) {
      AlertLevel.advisory => Icons.info_outline,
      AlertLevel.warning => Icons.warning_amber_rounded,
      AlertLevel.critical => Icons.warning_rounded,
    };
    return SolidBadge(
      label: level.label,
      color: colorFor(level),
      icon: icon,
      compact: compact,
    );
  }
}
