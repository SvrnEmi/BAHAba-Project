import 'package:bahaba_app/config/app_strings.dart';
import 'package:bahaba_app/models/alert_model.dart';
import 'package:bahaba_app/services/field_observations_service.dart';
import 'package:bahaba_app/widgets/alert_card.dart';
import 'package:bahaba_app/widgets/ground_reports_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Alert _alert({bool allClear = false, String? expiresAt}) => Alert(
      id: 1,
      level: AlertLevel.warning,
      title: 'Flood notice',
      message: 'Message',
      targetBarangay: 'Tuburan',
      channels: const [AlertChannel.push],
      sentAt: DateTime.now().toUtc().toIso8601String(),
      recipients: 0,
      createdBy: 'x',
      isAllClear: allClear,
      expiresAt: expiresAt,
    );

FieldObservation _obs(int id, String location, String status, Duration age,
        {String kind = 'waterway', String? note}) =>
    FieldObservation(
      id: id,
      barangay: 'Tuburan',
      kind: kind,
      location: location,
      status: status,
      note: note,
      observedAt: DateTime.now().subtract(age),
    );

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  group('AlertCard', () {
    testWidgets('an all clear replaces the PAGASA label', (tester) async {
      await tester.pumpWidget(_wrap(AlertCard(alert: _alert(allClear: true))));
      expect(find.text(AppStrings.alertAllClear), findsOneWidget);
      expect(find.textContaining('Orange'), findsNothing);
    });

    testWidgets('an active alert keeps its PAGASA label', (tester) async {
      await tester.pumpWidget(_wrap(AlertCard(alert: _alert())));
      expect(find.textContaining('Orange'), findsOneWidget);
      expect(find.text(AppStrings.alertAllClear), findsNothing);
      expect(find.text(AppStrings.alertEnded), findsNothing);
    });

    testWidgets('a past end time shows Ended', (tester) async {
      final past =
          DateTime.now().subtract(const Duration(hours: 1)).toUtc().toIso8601String();
      await tester.pumpWidget(_wrap(AlertCard(alert: _alert(expiresAt: past))));
      expect(find.text(AppStrings.alertEnded), findsOneWidget);
    });

    testWidgets('a future end time does not', (tester) async {
      final future =
          DateTime.now().add(const Duration(hours: 1)).toUtc().toIso8601String();
      await tester.pumpWidget(_wrap(AlertCard(alert: _alert(expiresAt: future))));
      expect(find.text(AppStrings.alertEnded), findsNothing);
    });
  });

  group('latestPerLocation', () {
    test('keeps the newest of each place, ignoring case and kind clashes', () {
      final rows = [
        _obs(3, 'Tuburan creek', 'rising', const Duration(minutes: 5)),
        _obs(2, 'tuburan creek ', 'normal', const Duration(hours: 2)),
        _obs(1, 'Tuburan creek', 'passable', const Duration(hours: 3), kind: 'road'),
      ];
      expect(latestPerLocation(rows).map((r) => r.id), [3, 1]);
    });
  });

  test('a reading is stale only after 6 hours', () {
    final now = DateTime.now();
    expect(_obs(1, 'a', 'normal', const Duration(hours: 5, minutes: 59)).isStale(now), isFalse);
    expect(_obs(1, 'a', 'normal', const Duration(hours: 6, minutes: 1)).isStale(now), isTrue);
  });

  test('status words and time wording', () {
    expect(AppStrings.groundStatus('impassable'), 'Not passable');
    expect(AppStrings.groundStatus('overflowing'), 'Overflowing');
    final now = DateTime(2026, 11, 5, 12);
    expect(AppStrings.timeAgo(now.subtract(const Duration(minutes: 1)), now), '1 minute ago');
    expect(AppStrings.timeAgo(now.subtract(const Duration(minutes: 5)), now), '5 minutes ago');
    expect(AppStrings.timeAgo(now.subtract(const Duration(hours: 2)), now), '2 hours ago');
  });

  group('GroundReportsCard', () {
    Future<void> pump(WidgetTester tester, List<FieldObservation> rows, {bool own = true}) async {
      await tester.pumpWidget(_wrap(GroundReportsCard(
        barangay: 'Tuburan',
        ownBarangay: own,
        read: (_) async => rows,
      )));
      await tester.pump();
    }

    testWidgets('empty text depends on whose barangay it is', (tester) async {
      await pump(tester, const []);
      expect(find.text(AppStrings.groundNone), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await pump(tester, const [], own: false);
      expect(find.text('No on-the-ground reports from Tuburan yet.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('shows words, note and age; marks old readings', (tester) async {
      await pump(tester, [
        _obs(1, 'Main road', 'impassable', const Duration(minutes: 5), kind: 'road', note: 'Fallen tree'),
        _obs(2, 'Tuburan creek', 'normal', const Duration(hours: 7)),
      ]);
      expect(find.text('Not passable'), findsOneWidget);
      expect(find.text('Fallen tree'), findsOneWidget);
      expect(find.text('5 minutes ago'), findsOneWidget);
      expect(find.text('7 hours ago · may be out of date'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('fits a small phone with large text', (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MediaQuery(
        data: const MediaQueryData(size: Size(320, 640), textScaler: TextScaler.linear(1.6)),
        child: _wrap(GroundReportsCard(
          barangay: 'Progreso Weste',
          read: (_) async => [
            _obs(1, 'A very long place name beside the old bridge near the market', 'overflowing',
                const Duration(hours: 8), note: 'Water is over the road and still rising'),
          ],
        )),
      ));
      await tester.pump();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('a failed read offers Try again', (tester) async {
      await tester.pumpWidget(_wrap(GroundReportsCard(
        barangay: 'Tuburan',
        read: (_) async => throw Exception('offline'),
      )));
      await tester.pump();
      expect(find.text(AppStrings.groundRetry), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    });
  });
}
