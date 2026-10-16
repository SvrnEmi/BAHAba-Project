import 'package:flutter/material.dart';

import 'app_theme.dart';

/// Rounded outline border that makes a text field look pressed into its
/// clay card.
///
/// Fields sit inside clay form cards, and clay is never nested, so instead
/// of raised shadows this paints a thin darker edge along the inner
/// top-left (Flutter has no inset BoxShadow). The outline itself, including
/// the primary-colored focus border, is painted on top by
/// [OutlineInputBorder].
class ClayInputBorder extends OutlineInputBorder {
  const ClayInputBorder({
    super.borderSide,
    super.borderRadius,
    super.gapPadding,
  });

  @override
  ClayInputBorder copyWith({
    BorderSide? borderSide,
    BorderRadius? borderRadius,
    double? gapPadding,
  }) {
    return ClayInputBorder(
      borderSide: borderSide ?? this.borderSide,
      borderRadius: borderRadius ?? this.borderRadius,
      gapPadding: gapPadding ?? this.gapPadding,
    );
  }

  @override
  ClayInputBorder scale(double t) {
    return ClayInputBorder(
      borderSide: borderSide.scale(t),
      borderRadius: borderRadius * t,
      gapPadding: gapPadding * t,
    );
  }

  // Keep the inset edge during the focus animation instead of falling back
  // to a plain OutlineInputBorder mid-lerp.
  @override
  ShapeBorder? lerpFrom(ShapeBorder? a, double t) {
    if (a is OutlineInputBorder) {
      return ClayInputBorder(
        borderRadius: BorderRadius.lerp(a.borderRadius, borderRadius, t)!,
        borderSide: BorderSide.lerp(a.borderSide, borderSide, t),
        gapPadding: a.gapPadding,
      );
    }
    return super.lerpFrom(a, t);
  }

  @override
  ShapeBorder? lerpTo(ShapeBorder? b, double t) {
    if (b is OutlineInputBorder) {
      return ClayInputBorder(
        borderRadius: BorderRadius.lerp(borderRadius, b.borderRadius, t)!,
        borderSide: BorderSide.lerp(borderSide, b.borderSide, t),
        gapPadding: b.gapPadding,
      );
    }
    return super.lerpTo(b, t);
  }

  @override
  void paint(
    Canvas canvas,
    Rect rect, {
    double? gapStart,
    double gapExtent = 0.0,
    double gapPercentage = 0.0,
    TextDirection? textDirection,
  }) {
    // Stroke a copy shifted down-right, clipped to the field: only its
    // top-left side lands inside, giving a ~2px recessed edge there.
    final rrect = borderRadius.toRRect(rect);
    canvas.save();
    canvas.clipRRect(rrect);
    canvas.drawRRect(
      rrect.shift(const Offset(1.5, 1.5)),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..shader = AppClay.insetEdge.createShader(rect),
    );
    canvas.restore();

    super.paint(
      canvas,
      rect,
      gapStart: gapStart,
      gapExtent: gapExtent,
      gapPercentage: gapPercentage,
      textDirection: textDirection,
    );
  }

  @override
  bool operator ==(Object other) => other is ClayInputBorder && super == other;

  @override
  int get hashCode => Object.hash(super.hashCode, ClayInputBorder);
}
