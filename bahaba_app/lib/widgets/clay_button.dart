import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'clay_container.dart';

enum ClayButtonVariant { primary, secondary }

/// Pill clay button (radius 28, 13px vertical padding, Nunito 14 w600).
///
/// - [ClayButtonVariant.primary]: blue gradient, white label.
/// - [ClayButtonVariant.secondary]: clay surface, dark label, primary icon.
///
/// Built on the themed ElevatedButton / OutlinedButton, so it keeps their
/// focus, disabled and semantics behavior and shares [ClayButtonSurface]
/// with every other button in the app.
class ClayButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final ClayButtonVariant variant;

  const ClayButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.variant = ClayButtonVariant.primary,
  });

  const ClayButton.secondary({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  }) : variant = ClayButtonVariant.secondary;

  @override
  Widget build(BuildContext context) {
    final text = Text(label, maxLines: 1, overflow: TextOverflow.ellipsis);
    final iconWidget = icon == null ? null : Icon(icon, size: 20);
    if (variant == ClayButtonVariant.primary) {
      return iconWidget == null
          ? ElevatedButton(onPressed: onPressed, child: text)
          : ElevatedButton.icon(
              onPressed: onPressed,
              icon: iconWidget,
              label: text,
            );
    }
    return iconWidget == null
        ? OutlinedButton(onPressed: onPressed, child: text)
        : OutlinedButton.icon(
            onPressed: onPressed,
            icon: iconWidget,
            label: text,
          );
  }
}

typedef ClayButtonBuilder = Widget Function(
  BuildContext context,
  Set<WidgetState> states,
  Widget? child,
);

/// Clay background for Material buttons, wired in through
/// `ButtonStyle.backgroundBuilder` so every button inherits it from the theme.
///
/// The button's own Material stays transparent; this widget paints the pill,
/// gradient and two shadows and squishes on press.
class ClayButtonSurface extends StatelessWidget {
  static const double radius = 28;

  final Set<WidgetState> states;
  final Widget? child;
  final Gradient gradient;
  final List<BoxShadow> shadows;
  final List<BoxShadow> pressedShadows;
  final bool isLight;
  final Color? borderColor;

  const ClayButtonSurface({
    super.key,
    required this.states,
    required this.child,
    required this.gradient,
    required this.shadows,
    required this.pressedShadows,
    this.isLight = false,
    this.borderColor,
  });

  /// Blue gradient pill for primary actions.
  static ClayButtonBuilder primary() =>
      (context, states, child) => ClayButtonSurface(
            states: states,
            gradient: AppClay.primaryGradient,
            shadows: AppClay.primaryShadows,
            pressedShadows: AppClay.primaryPressedShadows,
            child: child,
          );

  /// Saturated solid pill (e.g. green Approve). [base] must carry white
  /// text at AA.
  static ClayButtonBuilder filled(Color base) =>
      (context, states, child) => ClayButtonSurface(
            states: states,
            gradient: AppClay.solidGradient(base),
            shadows: AppClay.primaryShadows,
            pressedShadows: AppClay.primaryPressedShadows,
            child: child,
          );

  /// Light clay pill for secondary actions, optionally outlined in
  /// [borderColor] (e.g. red for a destructive action).
  static ClayButtonBuilder secondary({Color? borderColor}) =>
      (context, states, child) => ClayButtonSurface(
            states: states,
            gradient: AppClay.surfaceGradient,
            shadows: AppClay.shadows,
            pressedShadows: AppClay.pressedShadows,
            isLight: true,
            borderColor: borderColor,
            child: child,
          );

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final disabled = states.contains(WidgetState.disabled);
    final pressed =
        states.contains(WidgetState.pressed) && !disabled && !reduceMotion;
    final focused = states.contains(WidgetState.focused);

    // A light pill inside a clay card would be nested clay: keep it flat
    // with a hairline so it still reads as a button.
    final flat = isLight && ClayContainer.isNested(context);

    Border? border;
    if (focused) {
      border = Border.all(color: AppColors.ink, width: 2);
    } else if (borderColor != null) {
      border = Border.all(
        color: disabled ? AppColors.border : borderColor!,
        width: 1.5,
      );
    } else if (flat) {
      border = Border.all(color: AppColors.border);
    }

    final duration = reduceMotion ? Duration.zero : AppClay.pressDuration;
    return AnimatedOpacity(
      opacity: disabled ? 0.55 : 1,
      duration: duration,
      child: AnimatedContainer(
        duration: duration,
        curve: Curves.easeOut,
        transform: pressed
            ? Matrix4.diagonal3Values(
                AppClay.pressedScale,
                AppClay.pressedScale,
                1,
              )
            : Matrix4.identity(),
        transformAlignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          gradient: gradient,
          boxShadow:
              flat || disabled ? null : (pressed ? pressedShadows : shadows),
          border: border,
        ),
        child: child,
      ),
    );
  }
}
