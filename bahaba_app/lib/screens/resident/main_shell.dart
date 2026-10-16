import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/resident_providers.dart';
import '../../services/alerts_seen_store.dart';
import '../../services/push_notification_service.dart';
import '../../widgets/clay_bottom_nav.dart';
import 'home_screen.dart';
import 'hazard_map_screen.dart';
import 'alerts_screen.dart';
import 'community_reports_screen.dart';

/// Main shell for the resident app with bottom navigation.
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  // Order matches the nav items below: Home, Alerts, Reports, Map.
  final _screens = const [
    HomeScreen(),
    AlertsScreen(),
    CommunityReportsScreen(),
    HazardMapScreen(),
  ];

  // Held so dispose() can stop their live subscriptions without a context.
  late final AlertProvider _alertProvider;
  late final ReportProvider _reportProvider;

  @override
  void initState() {
    super.initState();
    _alertProvider = context.read<AlertProvider>();
    _reportProvider = context.read<ReportProvider>();
    // Notification taps switch to the Alerts tab (index 1).
    PushNotificationService.instance.attachResidentAlertsTab(_openAlertsTab);
    // Preload resident data
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<BarangayProvider>().load();
      _alertProvider.load();
      _reportProvider.load();
    });
  }

  static const int _alertsTab = 1;

  void _openAlertsTab() => _selectTab(_alertsTab);

  /// Entering or leaving the Alerts tab marks alerts as seen, which resets
  /// the Home bell badge.
  void _selectTab(int index) {
    if (!mounted || index == _currentIndex) return;
    if (index == _alertsTab || _currentIndex == _alertsTab) {
      AlertsSeenStore.instance.markSeen();
    }
    setState(() => _currentIndex = index);
  }

  @override
  void dispose() {
    PushNotificationService.instance.detachResidentAlertsTab(_openAlertsTab);
    _alertProvider.stop();
    _reportProvider.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: ClayBottomNav(
        selectedIndex: _currentIndex,
        onDestinationSelected: _selectTab,
        items: const [
          ClayNavItem(
            icon: Icons.home_outlined,
            selectedIcon: Icons.home,
            label: 'Home',
          ),
          ClayNavItem(
            icon: Icons.notifications_outlined,
            selectedIcon: Icons.notifications,
            label: 'Alerts',
          ),
          ClayNavItem(
            icon: Icons.description_outlined,
            selectedIcon: Icons.description,
            label: 'Reports',
          ),
          ClayNavItem(
            icon: Icons.map_outlined,
            selectedIcon: Icons.map,
            label: 'Map',
          ),
        ],
      ),
    );
  }
}
