import 'package:bahaba_app/repositories/auth_repository.dart';
import 'package:bahaba_app/screens/welcome_screen.dart';
import 'package:bahaba_app/widgets/brand_logo.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

void main() {
  setUpAll(() => GoogleFonts.config.allowRuntimeFetching = false);

  group('AuthRepository.isAppRole', () {
    test('allows only resident, barangay and mdrrmo', () {
      for (final role in ['resident', 'barangay', 'mdrrmo', ' MDRRMO ']) {
        expect(AuthRepository.isAppRole(role), isTrue, reason: role);
      }
      for (final role in ['superadmin', 'admin', '', null]) {
        expect(AuthRepository.isAppRole(role), isFalse, reason: '$role');
      }
    });
  });

  testWidgets('Welcome screen shows logo, name, buttons, hotlines and legal links', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(const MaterialApp(home: WelcomeScreen()));
    await tester.pump();

    expect(find.byType(BrandLogo), findsOneWidget);
    expect(find.text('BAHAba'), findsOneWidget);
    expect(find.text('Flood early warning and community reports for Odiongan'), findsOneWidget);
    expect(find.text('Log in'), findsOneWidget);
    expect(find.text('Create an account'), findsOneWidget);
    expect(find.text('Quick Report - no account needed'), findsOneWidget);
    expect(find.text('Report a flood in under a minute'), findsOneWidget);
    expect(find.text('Call MDRRMO'), findsOneWidget);
    expect(find.text('+63 919 079 8427'), findsOneWidget);
    expect(find.text('Call 911'), findsOneWidget);
    expect(find.text('Terms of Service'), findsOneWidget);
    expect(find.text('Privacy Policy'), findsOneWidget);

    // Everything fits on a phone screen without scrolling.
    final scrollable = tester.state<ScrollableState>(find.byType(Scrollable).first);
    expect(scrollable.position.maxScrollExtent, 0);
  });
}
