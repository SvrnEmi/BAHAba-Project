import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'clay_container.dart';

/// Title block for resident tabs: pastel clay icon chip, Nunito title,
/// secondary subtitle, optional trailing widget. Sits on the page background.
class ScreenHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color chipColor;
  final Widget? trailing;

  const ScreenHeader({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    this.chipColor = AppColors.lavender,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
      child: Row(
        children: [
          ClayIconChip(icon: icon, color: chipColor, size: 48),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.heading(size: 22)),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
