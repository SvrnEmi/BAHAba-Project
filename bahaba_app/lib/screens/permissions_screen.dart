import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme/app_theme.dart';
import '../widgets/clay_container.dart';
import '../widgets/risk_badge.dart';

/// Persists whether the first-launch permission onboarding has been shown.
class PermissionsOnboarding {
  static const String _key = 'permissions_onboarding_done';

  static Future<bool> isDone() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_key) ?? false;
  }

  static Future<void> markDone() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_key, true);
  }
}

enum _PermState { notAsked, allowed, denied, permanentlyDenied }

class _PermItem {
  final Permission permission;
  final IconData icon;
  final String title;
  final String reason;
  _PermState state = _PermState.notAsked;

  _PermItem({
    required this.permission,
    required this.icon,
    required this.title,
    required this.reason,
  });
}

/// First-launch onboarding that explains and requests the runtime
/// permissions BAHAba uses. Nothing here is required: the user can skip,
/// and the app stays fully usable if any permission is denied.
class PermissionsScreen extends StatefulWidget {
  /// Called with this screen's context once onboarding is finished,
  /// so the caller can continue the normal post-splash routing.
  final void Function(BuildContext context) onFinished;

  const PermissionsScreen({super.key, required this.onFinished});

  @override
  State<PermissionsScreen> createState() => _PermissionsScreenState();
}

class _PermissionsScreenState extends State<PermissionsScreen>
    with WidgetsBindingObserver {
  final List<_PermItem> _items = [
    _PermItem(
      permission: Permission.camera,
      icon: Icons.camera_alt_outlined,
      title: 'Camera',
      reason: 'Take photos of flooding to attach to your reports.',
    ),
    _PermItem(
      permission: Permission.locationWhenInUse,
      icon: Icons.location_on_outlined,
      title: 'Location',
      reason: 'Add your GPS location so responders know where flooding is.',
    ),
    _PermItem(
      permission: Permission.notification,
      icon: Icons.notifications_active_outlined,
      title: 'Notifications',
      reason: 'Get flood alerts for your barangay right away.',
    ),
  ];

  bool _busy = false;
  bool _requested = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshGranted();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // The user may have changed a permission in system settings.
    if (state == AppLifecycleState.resumed) _refreshGranted();
  }

  /// Marks permissions that are already granted (e.g. notifications on
  /// Android 12 and below) as Allowed without prompting.
  Future<void> _refreshGranted() async {
    for (final item in _items) {
      final status = await item.permission.status;
      if (status.isGranted || status.isLimited) {
        item.state = _PermState.allowed;
      }
    }
    if (mounted) setState(() {});
  }

  _PermState _toState(PermissionStatus status) {
    if (status.isGranted || status.isLimited) return _PermState.allowed;
    if (status.isPermanentlyDenied || status.isRestricted) {
      return _PermState.permanentlyDenied;
    }
    return _PermState.denied;
  }

  Future<void> _requestAll() async {
    setState(() => _busy = true);
    for (final item in _items) {
      try {
        final status = await item.permission.request();
        if (!mounted) return;
        setState(() => item.state = _toState(status));
      } catch (_) {
        if (!mounted) return;
        setState(() => item.state = _PermState.denied);
      }
    }
    await PermissionsOnboarding.markDone();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _requested = true;
    });

    // Everything granted: nothing more to show, continue straight away.
    if (_items.every((i) => i.state == _PermState.allowed)) {
      widget.onFinished(context);
    }
  }

  Future<void> _finish() async {
    setState(() => _busy = true);
    await PermissionsOnboarding.markDone();
    if (!mounted) return;
    widget.onFinished(context);
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(24, 32, 24, 16),
                children: [
                  const Center(
                    child: ClayIconChip(
                      icon: Icons.shield_outlined,
                      color: AppColors.lavender,
                      iconColor: AppColors.primaryShade,
                      size: 88,
                      iconSize: 42,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Allow permissions to get the most out of BAHAba',
                    textAlign: TextAlign.center,
                    style: textTheme.headlineSmall?.copyWith(
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'You can change these anytime in your phone settings. '
                    'BAHAba still works if you skip them.',
                    textAlign: TextAlign.center,
                    style: textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 24),
                  for (final (i, item) in _items.indexed) ...[
                    _PermissionCard(
                      item: item,
                      chipColor: _chipColors[i % _chipColors.length],
                      onOpenSettings: openAppSettings,
                    ),
                    const SizedBox(height: 16),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ElevatedButton(
                    onPressed:
                        _busy ? null : (_requested ? _finish : _requestAll),
                    child: _busy
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(_requested ? 'Continue' : 'Allow Permissions'),
                  ),
                  if (!_requested) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy ? null : _finish,
                      style: TextButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: const Text('Maybe Later'),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

const _chipColors = [AppColors.peach, AppColors.mint, AppColors.lavender];

class _PermissionCard extends StatelessWidget {
  final _PermItem item;
  final Color chipColor;
  final Future<bool> Function() onOpenSettings;

  const _PermissionCard({
    required this.item,
    required this.chipColor,
    required this.onOpenSettings,
  });

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final (label, color, icon) = switch (item.state) {
      _PermState.notAsked => (
          'Not asked',
          AppColors.textSecondary,
          Icons.help_outline,
        ),
      _PermState.allowed => (
          'Allowed',
          AppColors.success,
          Icons.check_circle,
        ),
      _PermState.denied || _PermState.permanentlyDenied => (
          'Denied',
          AppColors.danger,
          Icons.cancel
        ),
    };

    return ClayContainer(
      borderRadius: 24,
      padding: const EdgeInsets.all(16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClayIconChip(icon: item.icon, color: chipColor),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.title,
                        style: textTheme.titleMedium?.copyWith(
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    SolidBadge(label: label, color: color, icon: icon),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  item.reason,
                  style: textTheme.bodyMedium?.copyWith(
                    color: AppColors.textSecondary,
                  ),
                ),
                if (item.state == _PermState.permanentlyDenied)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: onOpenSettings,
                      icon: const Icon(Icons.settings_outlined, size: 18),
                      label: const Text('Open Settings'),
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
