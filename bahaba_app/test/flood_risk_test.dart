import 'package:flutter_test/flutter_test.dart';

import 'package:bahaba_app/models/barangay_model.dart';
import 'package:bahaba_app/models/user_model.dart';
import 'package:bahaba_app/repositories/barangay_repository.dart';
import 'package:bahaba_app/screens/admin/barangay_dashboard_screen.dart';
import 'package:bahaba_app/screens/admin/mdrrmo_dashboard_screen.dart';
import 'package:bahaba_app/screens/resident/main_shell.dart';
import 'package:bahaba_app/utils/navigation.dart';

void main() {
  group('flood risk values', () {
    test('accepts only low, medium, and high risk levels', () async {
      final repository = BarangayRepository();

      expect(
        repository.updateFloodRisk('Test Barangay', 'warning'),
        throwsArgumentError,
      );
    });

    test('maps risk levels to the shared display colors', () {
      expect(FloodRisk.low.colorHex, '#22C55E');
      expect(FloodRisk.medium.colorHex, '#EAB308');
      expect(FloodRisk.high.colorHex, '#EF4444');
    });
  });

  group('role navigation', () {
    test('routes barangay admins to the barangay dashboard', () {
      expect(
        AppNavigator.homeForRole(UserRole.barangay),
        isA<BarangayAdminDashboardScreen>(),
      );
    });

    test('keeps the other role destinations intact', () {
      expect(
        AppNavigator.homeForRole(UserRole.mdrrmo),
        isA<MDRRMOAdminDashboardScreen>(),
      );
      expect(
        AppNavigator.homeForRole(UserRole.resident),
        isA<MainShell>(),
      );
    });
  });
}
