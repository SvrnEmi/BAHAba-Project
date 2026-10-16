import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// A puffy "clay" surface.
///
/// An [AnimatedContainer] with the clay gradient (or a solid [color]
/// override such as a pastel) and exactly two outer shadows: a blue-grey
/// shade bottom-right and a white highlight top-left. When [onTap] is set
/// it squishes to 0.97 and flattens its shadows while pressed, unless the
/// platform asks for reduced motion.
///
/// Clay is never nested: a ClayContainer placed inside another one keeps
/// its fill but drops its shadows, so it reads as part of the parent.
///
/// Do not use for alerts, risk badges or status badges: those stay flat.
class ClayContainer extends StatefulWidget {
  final Widget child;
  final double borderRadius;
  final EdgeInsetsGeometry? padding;
  final Color? color;
  final VoidCallback? onTap;

  final EdgeInsetsGeometry? margin;
  final bool circle;
  final double? width;
  final double? height;
  final String? semanticLabel;

  const ClayContainer({
    super.key,
    required this.child,
    this.borderRadius = 24,
    this.padding = const EdgeInsets.all(16),
    this.color,
    this.onTap,
    this.margin,
    this.circle = false,
    this.width,
    this.height,
    this.semanticLabel,
  });

  /// Whether [context] is already inside a clay surface.
  static bool isNested(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_ClayScope>() != null;

  @override
  State<ClayContainer> createState() => _ClayContainerState();
}

class _ClayContainerState extends State<ClayContainer> {
  bool _pressed = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final interactive = widget.onTap != null;
    final pressed = interactive && _pressed && !reduceMotion;
    final nested = ClayContainer.isNested(context);

    final decoration = BoxDecoration(
      shape: widget.circle ? BoxShape.circle : BoxShape.rectangle,
      borderRadius:
          widget.circle ? null : BorderRadius.circular(widget.borderRadius),
      color: widget.color,
      gradient: widget.color == null ? AppClay.surfaceGradient : null,
      boxShadow:
          nested ? null : (pressed ? AppClay.pressedShadows : AppClay.shadows),
      border:
          _focused ? Border.all(color: AppColors.primaryShade, width: 2) : null,
    );

    Widget box = AnimatedContainer(
      duration: reduceMotion ? Duration.zero : AppClay.pressDuration,
      curve: Curves.easeOut,
      width: widget.width,
      height: widget.height,
      padding: widget.padding,
      decoration: decoration,
      transform: pressed
          ? Matrix4.diagonal3Values(
              AppClay.pressedScale,
              AppClay.pressedScale,
              1,
            )
          : Matrix4.identity(),
      transformAlignment: Alignment.center,
      child: _ClayScope(child: widget.child),
    );

    if (interactive) {
      // A fixed-size box smaller than 48 (e.g. a 44px icon circle) keeps
      // its visual size, centered in a 48x48 hit area.
      if (widget.width != null || widget.height != null) {
        box = Center(widthFactor: 1, heightFactor: 1, child: box);
      }
      box = Semantics(
        button: true,
        label: widget.semanticLabel,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              onTap: widget.onTap,
              onHighlightChanged: (value) => setState(() => _pressed = value),
              onFocusChange: (value) => setState(() => _focused = value),
              splashFactory: NoSplash.splashFactory,
              overlayColor: WidgetStateProperty.all(Colors.transparent),
              customBorder: widget.circle
                  ? const CircleBorder()
                  : RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(widget.borderRadius),
                    ),
              child: box,
            ),
          ),
        ),
      );
    }

    if (widget.margin != null) {
      box = Padding(padding: widget.margin!, child: box);
    }
    return box;
  }
}

class _ClayScope extends InheritedWidget {
  const _ClayScope({required super.child});

  @override
  bool updateShouldNotify(_ClayScope oldWidget) => false;
}

/// BAHAba logo: a raised clay disc around a flat primary-gradient core.
class ClayLogoBadge extends StatelessWidget {
  final double size;
  final double iconSize;

  const ClayLogoBadge({super.key, this.size = 104, this.iconSize = 48});

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      circle: true,
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.14),
      child: DecoratedBox(
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          gradient: AppClay.primaryGradient,
        ),
        child: Center(
          child: Icon(Icons.waves, size: iconSize, color: Colors.white),
        ),
      ),
    );
  }
}

/// Round pastel clay chip with an icon in the matching dark color and an
/// optional 12px [label] underneath. Inside another clay surface it renders
/// as a flat pastel circle (see [ClayContainer]).
class ClayIconChip extends StatelessWidget {
  final IconData icon;
  final Color color;
  final Color? iconColor;
  final String? label;
  final VoidCallback? onTap;
  final double size;
  final double iconSize;

  const ClayIconChip({
    super.key,
    required this.icon,
    this.color = AppColors.lavender,
    this.iconColor,
    this.label,
    this.onTap,
    this.size = 54,
    this.iconSize = 24,
  });

  static Color iconColorFor(Color pastel) {
    if (pastel == AppColors.peach) return AppColors.peachIcon;
    if (pastel == AppColors.mint) return AppColors.mintIcon;
    if (pastel == AppColors.lavender) return AppColors.lavenderIcon;
    return AppColors.ink;
  }

  @override
  Widget build(BuildContext context) {
    final circle = ClayContainer(
      circle: true,
      color: color,
      width: size,
      height: size,
      padding: EdgeInsets.zero,
      onTap: onTap,
      semanticLabel: label,
      child: Center(
        child: Icon(
          icon,
          color: iconColor ?? iconColorFor(color),
          size: iconSize,
        ),
      ),
    );
    if (label == null) return circle;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        circle,
        const SizedBox(height: 8),
        ExcludeSemantics(
          child: GestureDetector(
            onTap: onTap,
            child: Text(
              label!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.ink,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
