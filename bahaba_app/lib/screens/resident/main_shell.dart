import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_strings.dart';
import '../../providers/app_state.dart';
import '../../providers/resident_providers.dart';
import '../../services/alerts_seen_store.dart';
import '../../services/app_update_service.dart';
import '../../services/push_notification_service.dart';
import '../../widgets/clay_bottom_nav.dart';
import '../emergency_contacts_screen.dart';
import 'home_screen.dart';
import 'hazard_map_screen.dart';
import 'alerts_screen.dart';
import 'community_reports_screen.dart';

/// Main shell for the resident app with bottom navigation.
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  // Tab indexes, in the order of the nav items below.
  static const int alertsTab = 1;
  static const int reportsTab = 2;
  static const int mapTab = 3;

  /// Switches to [index] exactly as tapping the bottom nav does. Screens
  /// inside the shell use this instead of pushing a second copy of a tab,
  /// which would have no Scaffold behind it.
  static void selectTab(BuildContext context, int index) =>
      context.findAncestorStateOfType<_MainShellState>()?._selectTab(index);

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  // Order matches the nav items below: Home, Alerts, Reports, Map, Contacts.
  final _screens = const [
    HomeScreen(),
    AlertsScreen(),
    CommunityReportsScreen(),
    HazardMapScreen(),
    EmergencyContactsScreen(),
  ];

  // Held so dispose() can stop their live subscriptions without a context.
  late final AlertProvider _alertProvider;
  late final ReportProvider _reportProvider;
  late final BarangayProvider _barangayProvider;

  @override
  void initState() {
    super.initState();
    _alertProvider = context.read<AlertProvider>();
    _reportProvider = context.read<ReportProvider>();
    _barangayProvider = context.read<BarangayProvider>();
    // Notification taps switch to the Alerts tab (index 1).
    PushNotificationService.instance.attachResidentAlertsTab(_openAlertsTab);
    AppUpdateService.instance.attachHome();
    // Preload resident data
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _barangayProvider.load();
      _alertProvider.load(
          barangay: context.read<AppState>().currentUser?.barangay);
      _reportProvider.load();
    });
  }

  static const int _alertsTab = MainShell.alertsTab;

  void _openAlertsTab() => _selectTab(_alertsTab);

  /// Entering or leaving the Alerts tab marks alerts as seen, which resets
  /// the Home bell badge.
  void _selectTab(int index) {
    if (!mounted || index == _currentIndex) return;
    if (index == _alertsTab || _currentIndex == _alertsTab) {
      AlertsSeenStore.instance.markSeen();
    }
    // Withdrawn alerts never reach residents over Realtime: re-read on open.
    if (index == _alertsTab) _alertProvider.refresh();
    setState(() => _currentIndex = index);
  }

  @override
  void dispose() {
    AppUpdateService.instance.detachHome();
    PushNotificationService.instance.detachResidentAlertsTab(_openAlertsTab);
    _alertProvider.stop();
    _reportProvider.stop();
    _barangayProvider.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Back on any other tab returns to Home; back on Home leaves the app.
    return PopScope(
      canPop: _currentIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _selectTab(0);
      },
      child: _buildScaffold(),
    );
  }

  Widget _buildScaffold() {
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
            label: AppStrings.navHome,
          ),
          ClayNavItem(
            icon: Icons.notifications_outlined,
            selectedIcon: Icons.notifications,
            label: AppStrings.navAlerts,
          ),
          ClayNavItem(
            icon: Icons.description_outlined,
            selectedIcon: Icons.description,
            label: AppStrings.navReports,
          ),
          ClayNavItem(
            icon: Icons.map_outlined,
            selectedIcon: Icons.map,
            label: AppStrings.navMap,
          ),
          ClayNavItem(
            icon: Icons.phone_outlined,
            selectedIcon: Icons.phone,
            label: AppStrings.navContacts,
          ),
        ],
      ),
    );
  }
}
