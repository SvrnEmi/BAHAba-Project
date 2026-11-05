import 'package:flutter/material.dart';

import '../models/community_report_model.dart';
import '../theme/app_theme.dart';

/// A standing person with water drawn up to [level]. Shared picture for the
/// ankle / knee / waist / chest / overhead scale.
class WaterLevelIcon extends StatelessWidget {
  final WaterLevel level;
  final double size;

  /// Dimmed when false, so a row of icons can highlight one level.
  final bool active;

  const WaterLevelIcon({
    super.key,
    required this.level,
    this.size = 40,
    this.active = true,
  });

  /// Water height as a fraction of the icon, from the feet.
  static double fillFor(WaterLevel level) => switch (level) {
        WaterLevel.ankle => 0.14,
        WaterLevel.knee => 0.32,
        WaterLevel.waist => 0.5,
        WaterLevel.chest => 0.68,
        WaterLevel.overhead => 0.96,
      };

  /// Deeper water reads warmer, matching the risk colors.
  static Color colorFor(WaterLevel level) => switch (level) {
        WaterLevel.ankle => AppColors.primary,
        WaterLevel.knee => AppColors.primaryShade,
        WaterLevel.waist => AppColors.riskMedium,
        WaterLevel.chest => AppColors.riskHigh,
        WaterLevel.overhead => const Color(0xFF7B1F16),
      };

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: CustomPaint(
        size: Size.square(size),
        painter: _WaterLevelPainter(
          fill: fillFor(level),
          water: active ? colorFor(level) : AppColors.border,
          person: active ? AppColors.ink : AppColors.textSecondary,
        ),
      ),
    );
  }
}

class _WaterLevelPainter extends CustomPainter {
  final double fill;
  final Color water;
  final Color person;

  _WaterLevelPainter({
    required this.fill,
    required this.water,
    required this.person,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final body = Paint()..color = person;

    // Head, torso and legs.
    canvas.drawCircle(Offset(w * 0.5, h * 0.14), h * 0.1, body);
    canvas.drawRRect(
      RRect.fromLTRBR(w * 0.36, h * 0.27, w * 0.64, h * 0.6,
          Radius.circular(w * 0.08)),
      body,
    );
    canvas.drawRRect(
      RRect.fromLTRBR(w * 0.38, h * 0.55, w * 0.48, h * 0.98,
          Radius.circular(w * 0.04)),
      body,
    );
    canvas.drawRRect(
      RRect.fromLTRBR(w * 0.52, h * 0.55, w * 0.62, h * 0.98,
          Radius.circular(w * 0.04)),
      body,
    );

    // Water from the feet up, slightly see-through so the person shows.
    final top = h * (1 - fill);
    canvas.drawRRect(
      RRect.fromLTRBR(0, top, w, h, Radius.circular(w * 0.1)),
      Paint()..color = water.withValues(alpha: 0.75),
    );
  }

  @override
  bool shouldRepaint(_WaterLevelPainter old) =>
      old.fill != fill || old.water != water || old.person != person;
}
