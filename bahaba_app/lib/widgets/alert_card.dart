import 'package:flutter/material.dart';

import '../models/alert_model.dart';
import '../theme/app_theme.dart';
import 'flat_status_card.dart';
import 'risk_badge.dart';

/// A broadcast alert: flat white card, 4px left border in the alert level
/// color, title 14 w500, body 12 secondary. Never clay.
class AlertCard extends StatelessWidget {
  final Alert alert;
  final EdgeInsetsGeometry? margin;

  /// Show target barangay, time and the level badge under the body.
  final bool showDetails;

  const AlertCard({
    super.key,
    required this.alert,
    this.margin,
    this.showDetails = true,
  });

  @override
  Widget build(BuildContext context) {
    return FlatStatusCard(
      accent: AlertLevelBadge.colorFor(alert.level),
      margin: margin,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            alert.title,
            style: const TextStyle(
              color: AppColors.ink,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            alert.message,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
              height: 1.4,
            ),
          ),
          if (showDetails) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(
                  Icons.location_on,
                  size: 14,
                  color: AppColors.textSecondary,
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    '${alert.targetBarangay} · ${alert.sentAt}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                AlertLevelBadge(level: alert.level, compact: true),
              ],
            ),
          ] else ...[
            const SizedBox(height: 8),
            AlertLevelBadge(level: alert.level, compact: true),
          ],
        ],
      ),
    );
  }
}
