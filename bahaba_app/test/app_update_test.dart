import 'package:bahaba_app/services/app_update_service.dart';
import 'package:bahaba_app/services/quick_report_service.dart';
import 'package:bahaba_app/widgets/app_release_dialogs.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const _release = AppRelease(
  versionCode: 5,
  versionName: '1.3.0',
  apkUrl: 'https://example.test/bahaba.apk',
  notes: ['First note', 'Second note'],
);

Future<void> _openUpdate(
  WidgetTester tester, {
  required bool required,
  Future<bool> Function(String url)? open,
}) async {
  await tester.pumpWidget(MaterialApp(
    home: Builder(
      builder: (context) => TextButton(
        onPressed: () => showUpdateDialog(
          context,
          _release,
          required: required,
          open: open ?? (_) async => true,
        ),
        child: const Text('go'),
      ),
    ),
  ));
  await tester.tap(find.text('go'));
  await tester.pumpAndSettle();
}

void main() {
  group('offersUpdate', () {
    test('only for a newer build with a link', () {
      expect(offersUpdate(_release, 4), isTrue);
      expect(offersUpdate(_release, 5), isFalse);
      expect(offersUpdate(_release, 6), isFalse);
      expect(offersUpdate(null, 4), isFalse);
      expect(
        offersUpdate(const AppRelease(versionCode: 5, versionName: 'x'), 4),
        isFalse,
      );
    });
  });

  group('AppRelease.fromRow', () {
    test('handles a null link and null notes', () {
      final release = AppRelease.fromRow({
        'version_code': 3,
        'version_name': '1.1.0',
        'apk_url': null,
        'notes': null,
        'required': false,
      });
      expect(release.apkUrl, isEmpty);
      expect(release.notes, isEmpty);
    });
  });

  group('whatsNewStep', () {
    test('first install saves and shows nothing', () {
      expect(whatsNewStep(installedBuild: 3), WhatsNewStep.saveOnly);
    });
    test('shows only when the build is newer than the last seen', () {
      expect(whatsNewStep(installedBuild: 4, lastSeenBuild: 3), WhatsNewStep.show);
      expect(whatsNewStep(installedBuild: 3, lastSeenBuild: 3), WhatsNewStep.none);
      expect(whatsNewStep(installedBuild: 2, lastSeenBuild: 3), WhatsNewStep.none);
    });
  });

  group('checkIsDue', () {
    final now = DateTime(2026, 11, 5, 12);
    test('first check, then at most once per hour', () {
      expect(checkIsDue(null, now), isTrue);
      expect(checkIsDue(now.subtract(const Duration(minutes: 59)), now), isFalse);
      expect(checkIsDue(now.subtract(const Duration(hours: 1)), now), isTrue);
    });
  });

  group('update dialog', () {
    testWidgets('optional: shows notes, Later closes it', (tester) async {
      await _openUpdate(tester, required: false);
      expect(find.text('Update available'), findsOneWidget);
      expect(find.text('Version 1.3.0'), findsOneWidget);
      expect(find.text('First note'), findsOneWidget);
      await tester.tap(find.text('Later'));
      await tester.pumpAndSettle();
      expect(find.text('Update available'), findsNothing);
    });

    testWidgets('Update now opens the link and closes', (tester) async {
      String? opened;
      await _openUpdate(tester, required: false, open: (url) async {
        opened = url;
        return true;
      });
      await tester.tap(find.text('Update now'));
      await tester.pumpAndSettle();
      expect(opened, _release.apkUrl);
      expect(find.text('Update available'), findsNothing);
    });

    testWidgets('required: no Later, barrier and back do not close it', (tester) async {
      await _openUpdate(tester, required: true);
      expect(find.text('Later'), findsNothing);
      await tester.tapAt(const Offset(5, 5));
      await tester.pumpAndSettle();
      expect(find.text('Update available'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Update available'), findsOneWidget);
      await tester.tap(find.text('Update now'));
      await tester.pumpAndSettle();
      expect(find.text('Update available'), findsOneWidget);
    });

    testWidgets('a link that fails to open is explained', (tester) async {
      await _openUpdate(tester, required: false, open: (_) async => false);
      await tester.tap(find.text('Update now'));
      await tester.pumpAndSettle();
      expect(find.text('Update available'), findsOneWidget);
      expect(find.textContaining("didn't open"), findsOneWidget);
    });
  });

  group('Quick Report error text', () {
    QuickReportException? parse(Object? details) =>
        QuickReportService.errorFromDetails(details);

    test('shows the function error, with its code', () {
      final e = parse({'error': 'Unknown barangay'})!;
      expect(e.message, 'Unknown barangay');
      final blocked = parse({'error': 'Not from this network.', 'code': 'blocked'})!;
      expect(blocked.message, 'Not from this network.');
      expect(blocked.code, 'blocked');
    });
    test('shows a gateway message and plain text', () {
      expect(parse({'message': 'Function not found'})!.message, 'Function not found');
      expect(parse('Service unavailable')!.message, 'Service unavailable');
    });
    test('ignores empty bodies and HTML pages', () {
      expect(parse(null), isNull);
      expect(parse(''), isNull);
      expect(parse('<html><body>502</body></html>'), isNull);
      expect(parse(<String, dynamic>{}), isNull);
    });
  });
}
