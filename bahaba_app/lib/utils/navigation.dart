import 'package:flutter/material.dart';

import '../models/user_model.dart';
import '../screens/admin/admin_selection_screen.dart';
import '../screens/admin/barangay_dashboard_screen.dart';
import '../screens/admin/mdrrmo_dashboard_screen.dart';
import '../screens/login_screen.dart';
import '../screens/resident/main_shell.dart';
import '../services/push_notification_service.dart';

/// Central navigation helper. Routes users to the correct home screen
/// based on their role.
class AppNavigator {
  /// Returns the initial screen for a given user role.
  static Widget homeForRole(UserRole role) {
    switch (role) {
      case UserRole.mdrrmo:
        return const MDRRMOAdminDashboardScreen();
      case UserRole.barangay:
        return const BarangayAdminDashboardScreen();
      case UserRole.resident:
        return const MainShell();
    }
  }

  /// Navigates the user to the appropriate home screen after login.
  static void goHome(BuildContext context, UserRole role) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => homeForRole(role)),
      (route) => false,
    );
    // Opens Alerts if the app was launched from a notification tap.
    PushNotificationService.instance.onHomeShown(role);
  }

  static void goToAdminSelection(BuildContext context) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const AdminSelectionScreen()),
      (route) => false,
    );
  }

  static void goToLogin(BuildContext context) {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  }
}
