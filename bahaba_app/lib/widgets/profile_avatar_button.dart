import 'package:flutter/material.dart';

import '../screens/profile_screen.dart';
import '../theme/app_theme.dart';
import 'clay_container.dart';

/// "Juan Dela Cruz" -> "JC"; emails use the part before "@".
String profileInitials(String? name) {
  final base = (name ?? '').split('@').first.trim();
  final words = base.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
  if (words.isEmpty) return '?';
  final first = words.first[0];
  final last = words.length > 1 ? words.last[0] : '';
  return (first + last).toUpperCase();
}

/// Round clay avatar with the user's initials; opens the Profile screen.
/// 44px visual inside a 48x48 tap target.
class ProfileAvatarButton extends StatelessWidget {
  final String? name;
  final double size;

  const ProfileAvatarButton({super.key, required this.name, this.size = 44});

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Profile',
      child: ClayContainer(
        circle: true,
        width: size,
        height: size,
        padding: EdgeInsets.zero,
        color: AppColors.lavender,
        semanticLabel: 'Open your profile',
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const ProfileScreen()),
        ),
        child: Center(
          child: Text(
            profileInitials(name),
            style: AppText.heading(
              size: size * 0.34,
              weight: FontWeight.w700,
              color: AppColors.lavenderIcon,
            ),
          ),
        ),
      ),
    );
  }
}
