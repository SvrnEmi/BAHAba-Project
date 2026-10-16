import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Flat white card with a 4px left border in a level color.
///
/// Used for alerts, errors and other safety-critical items where
/// readability beats decoration: no clay, no gradient, no shadow. Corners
/// are square so the left border stays a straight bar.
class FlatStatusCard extends StatelessWidget {
  final Color accent;
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final Color background;

  const FlatStatusCard({
    super.key,
    required this.accent,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.margin,
    this.background = AppColors.flat,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: background,
        border: Border(
          left: BorderSide(color: accent, width: 4),
          top: const BorderSide(color: AppColors.border),
          right: const BorderSide(color: AppColors.border),
          bottom: const BorderSide(color: AppColors.border),
        ),
      ),
      child: child,
    );
  }
}

/// Plain flat panel (white, hairline border, no shadow) for dense content:
/// dashboard forms, sections and long lists where clay would hurt
/// readability or scrolling.
class FlatPanel extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final double borderRadius;

  const FlatPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.borderRadius = 16,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.flat,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: child,
    );
  }
}
