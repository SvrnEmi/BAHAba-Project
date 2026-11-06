import 'package:bahaba_app/models/alert_model.dart';
import 'package:bahaba_app/screens/admin/barangay_home_tab.dart';
import 'package:bahaba_app/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Alert _alert({
  String source = 'barangay',
  AlertStatus status = AlertStatus.approved,
  String target = 'Tuburan',
  String sentAt = '2026-11-06T16:10:00Z',
  String? expiresAt,
  bool allClear = false,
}) =>
    Alert(
      level: AlertLevel.advisory,
      title: 'Title',
      message: 'Message',
      targetBarangay: target,
      channels: const [],
      sentAt: sentAt,
      recipients: 1,
      createdBy: 'x',
      status: status,
      source: source,
      expiresAt: expiresAt,
      isAllClear: allClear,
    );

Widget _home({
  TileValue<int> active = const TileValue(2),
  TileValue<int> pending = const TileValue(3),
  TileValue<DateTime>? latest,
  TileValue<int> today = const TileValue(1),
  TileValue<String> risk = const TileValue.none(),
  void Function(BarangayTile)? onOpen,
}) {
  final now = DateTime(2026, 11, 6, 12);
  return MaterialApp(
    home: Scaffold(
      body: BarangayHomeTab(
        barangay: 'Tuburan',
        now: now,
        activeAlerts: active,
        pendingReports: pending,
        latestObservation:
            latest ?? TileValue(now.subtract(const Duration(minutes: 20))),
        publishedToday: today,
        risk: risk,
        riskLabel: 'High Risk',
        riskColor: AppColors.danger,
        onOpen: onOpen ?? (_) {},
        onRefresh: () async {},
      ),
    ),
  );
}

void main() {
  group('tile rules', () {
    test('active leaves out all clears and passed end times', () {
      final now = DateTime.utc(2026, 11, 6, 12);
      expect(
        countActiveAlerts([
          _alert(),
          _alert(allClear: true),
          _alert(expiresAt: '2026-11-06T11:00:00Z'),
          _alert(expiresAt: '2026-11-06T13:00:00Z'),
        ], now),
        2,
      );
    });

    test('published today: this barangay, Manila calendar, sent alerts only',
        () {
      // 00:30 on Nov 7 in Manila.
      final now = DateTime.utc(2026, 11, 6, 16, 30);
      expect(
        countPublishedToday([
          _alert(),
          _alert(status: AlertStatus.withdrawn),
          _alert(status: AlertStatus.rejected),
          _alert(source: 'mdrrmo'),
          _alert(target: 'All Barangays'),
          _alert(sentAt: '2026-11-06T15:50:00Z'), // still Nov 6 in Manila
        ], 'Tuburan', now),
        2,
      );
    });

    test('short times', () {
      final now = DateTime(2026, 11, 6, 12);
      Duration m(int n) => Duration(minutes: n);
      expect(shortAgo(now, now), 'just now');
      expect(shortAgo(now.subtract(m(20)), now), '20 min ago');
      expect(shortAgo(now.subtract(m(180)), now), '3 hr ago');
      expect(shortAgo(now.subtract(m(1440)), now), '1 day ago');
    });
  });

  testWidgets('shows the six tiles with their lines', (tester) async {
    await tester.pumpWidget(_home());
    for (final text in [
      'Create Alert',
      'Reports',
      'Field Observations',
      'My Alerts',
      'Overview',
      'Settings',
      '2 active now',
      '3 waiting for the MDRRMO',
      'Last update 20 min ago',
      '1 published today',
      'High Risk',
      'Account and notifications',
    ]) {
      expect(find.text(text), findsOneWidget, reason: text);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('no observations reads None yet', (tester) async {
    await tester.pumpWidget(_home(latest: const TileValue.none()));
    expect(find.text('None yet'), findsOneWidget);
  });

  testWidgets('a failed number shows a dash and the tile still opens',
      (tester) async {
    BarangayTile? opened;
    await tester.pumpWidget(_home(
      pending: const TileValue.failed(),
      onOpen: (tile) => opened = tile,
    ));
    expect(find.text('—'), findsOneWidget);
    await tester.tap(find.text('Reports'));
    expect(opened, BarangayTile.reports);
  });

  testWidgets('shows a skeleton while loading', (tester) async {
    await tester.pumpWidget(_home(today: const TileValue.loading()));
    expect(find.byKey(const ValueKey('tile-skeleton')), findsOneWidget);
    expect(find.textContaining('published today'), findsNothing);
  });

  testWidgets('2 columns on a phone, 3 when wide, no overflow', (tester) async {
    double columns() {
      final grid = tester.widget<GridView>(find.byType(GridView));
      final delegate =
          grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount;
      return delegate.crossAxisCount.toDouble();
    }

    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    tester.view.physicalSize = const Size(320, 700);
    await tester.pumpWidget(_home());
    expect(columns(), 2);
    expect(tester.takeException(), isNull);

    tester.view.physicalSize = const Size(1000, 700);
    await tester.pumpWidget(_home());
    await tester.pump();
    expect(columns(), 3);
  });
}
