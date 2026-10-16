import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'clay_container.dart';

class ClayNavItem {
  final IconData icon;
  final IconData selectedIcon;
  final String label;

  const ClayNavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });
}

/// Floating clay bottom bar of 48x48 circular icon buttons.
///
/// The selected item sits in a pressed-in well. Flutter's BoxShadow has no
/// inset option, so the well is faked with a reversed gradient (darker
/// top-left) over a 1px ring that is dark only on its top-left edge.
/// Same contract as NavigationBar: [selectedIndex] + [onDestinationSelected].
class ClayBottomNav extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final List<ClayNavItem> items;

  const ClayBottomNav({
    super.key,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 4, 22, 22),
        child: ClayContainer(
          borderRadius: 28,
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              for (var i = 0; i < items.length; i++)
                _NavButton(
                  item: items[i],
                  selected: i == selectedIndex,
                  onTap: () => onDestinationSelected(i),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  static const double size = 48;

  final ClayNavItem item;
  final bool selected;
  final VoidCallback onTap;

  const _NavButton({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final icon = Icon(
      selected ? item.selectedIcon : item.icon,
      color: selected ? AppColors.primary : AppColors.textSecondary,
      size: 24,
    );

    return Tooltip(
      message: item.label,
      child: Semantics(
        button: true,
        selected: selected,
        label: item.label,
        excludeSemantics: true,
        child: Material(
          type: MaterialType.transparency,
          shape: const CircleBorder(),
          child: InkWell(
            onTap: onTap,
            customBorder: const CircleBorder(),
            splashFactory: NoSplash.splashFactory,
            overlayColor: WidgetStateProperty.all(Colors.transparent),
            child: SizedBox(
              width: size,
              height: size,
              child: selected
                  ? DecoratedBox(
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: AppClay.insetEdge,
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(1),
                        child: DecoratedBox(
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: AppClay.insetGradient,
                          ),
                          child: Center(child: icon),
                        ),
                      ),
                    )
                  : Center(child: icon),
            ),
          ),
        ),
      ),
    );
  }
}
