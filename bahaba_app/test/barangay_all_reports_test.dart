import 'package:bahaba_app/screens/admin/barangay_all_reports_tab.dart';
import 'package:bahaba_app/services/all_reports_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

AllReport _row(
  int id, {
  String kind = 'community',
  String source = 'resident',
  String status = 'pending',
  String? level = 'knee',
  String? reason,
}) =>
    AllReport(
      kind: kind,
      id: id,
      source: source,
      location: 'Place $id',
      waterLevel: level,
      status: status,
      reportedAt: DateTime.now().subtract(Duration(minutes: id)),
      reporterName: 'Ana',
      rejectionReason: reason,
    );

void main() {
  group('allReportsSearch', () {
    test('keeps the text inside the quoted value', () {
      expect(allReportsSearch('  a,b(c) '), contains('location.ilike."*a,b(c)*"'));
      expect(allReportsSearch('50%'), contains(r'location.ilike."*50\\%*"'));
      expect(allReportsSearch('a*b'), contains('location.ilike."*a_b*"'));
      expect(allReportsSearch('a_b'), contains(r'location.ilike."*a\\_b*"'));
      expect(allReportsSearch('say "hi"'),
          contains(r'location.ilike."*say \"hi\"*"'));
      expect(allReportsSearch('x').split(',').map((f) => f.split('.').first),
          ['location', 'description', 'reporter_name']);
    });
  });

  group('allReportsDates', () {
    // 00:30 on Nov 7 in Manila.
    final now = DateTime.utc(2026, 11, 6, 16, 30);

    test('today starts at midnight in Manila', () {
      final bounds =
          allReportsDates(const AllReportsFilter(date: 'today'), now);
      expect(bounds.from, DateTime.utc(2026, 11, 6, 16));
      expect(bounds.before, isNull);
    });

    test('a custom range includes the whole last day', () {
      final bounds = allReportsDates(
        AllReportsFilter(
          date: 'custom',
          from: DateTime(2026, 11, 1),
          to: DateTime(2026, 11, 2),
        ),
        now,
      );
      expect(bounds.from, DateTime.utc(2026, 10, 31, 16));
      expect(bounds.before, DateTime.utc(2026, 11, 2, 16));
    });
  });

  test('sorts loaded rows and keeps the server order for ties', () {
    final rows = [
      _row(1),
      _row(2, level: null),
      _row(3, level: 'overhead', status: 'rejected'),
      _row(4, level: 'ankle', status: 'approved'),
      _row(5),
    ];
    List<int> ids(String sort) => sortLoaded(rows, sort).map((r) => r.id).toList();
    expect(ids('highest'), [3, 1, 5, 4, 2]);
    expect(ids('lowest'), [4, 1, 5, 3, 2]);
    expect(ids('status'), [1, 2, 5, 4, 3]);
    expect(ids('newest'), [1, 2, 3, 4, 5]);
  });

  test('source labels', () {
    expect(
      ['resident', 'mdrrmo', 'guest', 'unknown', null].map(sourceLabel),
      [
        'Resident',
        'MDRRMO',
        'Guest (Quick Report)',
        'Unknown (older report)',
        'Unknown (older report)',
      ],
    );
  });

  test('clearing the date also clears a custom range', () {
    final custom = AllReportsFilter(
      date: 'custom',
      from: DateTime(2026, 1, 1),
      to: DateTime(2026, 1, 2),
    );
    final next = custom.copyWith(date: '7d');
    expect(next.from, isNull);
    expect(next.to, isNull);
    expect(const AllReportsFilter(sort: 'oldest').hasFilters, isFalse);
    expect(const AllReportsFilter(source: 'guest').hasFilters, isTrue);
  });

  group('the tab', () {
    late List<({AllReportsFilter filter, int start, int count})> calls;
    late ValueNotifier<int> changes;

    setUp(() {
      calls = [];
      changes = ValueNotifier(0);
    });

    Future<void> pump(WidgetTester tester, AllReportsFetch fetch) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(400, 9000);
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: BarangayAllReportsTab(
            barangay: 'Tuburan',
            changes: changes,
            fetch: (filter, start, count) {
              calls.add((filter: filter, start: start, count: count));
              return fetch(filter, start, count);
            },
          ),
        ),
      ));
    }

    testWidgets('shows a skeleton, then the rows with their badges',
        (tester) async {
      await pump(tester, (_, __, ___) async => (
            rows: [
              _row(1),
              _row(2, kind: 'quick', source: 'guest'),
              _row(3, source: 'mdrrmo', status: 'approved'),
              _row(4,
                  source: 'unknown', status: 'rejected', reason: 'Duplicate'),
            ],
            total: 4,
          ));
      expect(find.byKey(const ValueKey('all-reports-skeleton')), findsWidgets);
      await tester.pumpAndSettle();
      expect(find.text('Showing 4 of 4'), findsOneWidget);
      expect(find.text('Resident'), findsOneWidget);
      expect(find.text('MDRRMO'), findsWidgets);
      expect(find.text('Guest (Quick Report)'), findsOneWidget);
      expect(find.text('Unknown (older report)'), findsOneWidget);
      expect(find.text('Rejection reason: Duplicate'), findsOneWidget);
      expect(find.text('Load more'), findsNothing);
      expect(find.text('Approve'), findsNothing);
      expect(find.text('Reject'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('search waits 300 ms and shows the count', (tester) async {
      await pump(tester, (filter, _, __) async => (
            rows: filter.search.isEmpty ? [_row(1), _row(2)] : [_row(1)],
            total: filter.search.isEmpty ? 2 : 1,
          ));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'pla');
      await tester.pump(const Duration(milliseconds: 200));
      await tester.enterText(find.byType(TextField), 'place');
      await tester.pump(const Duration(milliseconds: 299));
      expect(calls.length, 1);
      await tester.pump(const Duration(milliseconds: 2));
      await tester.pumpAndSettle();
      expect(calls.length, 2);
      expect(calls.last.filter.search, 'place');
      expect(find.text("1 result for 'place'. Showing 1 of 1"), findsOneWidget);
      await tester.tap(find.text('Clear filters'));
      await tester.pumpAndSettle();
      expect(calls.last.filter.search, '');
      expect(find.text('Clear filters'), findsNothing);
    });

    testWidgets('Load more asks for the next rows', (tester) async {
      await pump(tester, (_, start, count) async => (
            rows: [
              for (var i = start; i < start + count && i < 30; i++) _row(i + 1)
            ],
            total: 30,
          ));
      await tester.pumpAndSettle();
      expect(find.text('Showing 25 of 30'), findsOneWidget);
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      expect(calls.last.start, 25);
      expect(find.text('Showing 30 of 30'), findsOneWidget);
      expect(find.text('Load more'), findsNothing);
    });

    testWidgets('a live change keeps the filter and how far Load more went',
        (tester) async {
      var total = 30;
      await pump(tester, (_, start, count) async => (
            rows: [
              for (var i = start; i < start + count && i < total; i++)
                _row(i + 1)
            ],
            total: total,
          ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Load more'));
      await tester.pumpAndSettle();
      total = 31;
      changes.value++;
      await tester.pumpAndSettle();
      expect(calls.last.start, 0);
      expect(calls.last.count, 30);
      expect(find.byKey(const ValueKey('all-reports-skeleton')), findsNothing);
    });

    testWidgets('empty, no match and error states', (tester) async {
      await pump(tester, (filter, _, __) async {
        if (filter.search == 'boom') throw Exception('permission denied');
        return (rows: <AllReport>[], total: 0);
      });
      await tester.pumpAndSettle();
      expect(find.text('No reports in your barangay yet.'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'x');
      await tester.pump(const Duration(milliseconds: 301));
      await tester.pumpAndSettle();
      expect(find.text('No reports match your search'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'boom');
      await tester.pump(const Duration(milliseconds: 301));
      await tester.pumpAndSettle();
      expect(find.textContaining('permission denied'), findsOneWidget);
    });
  });
}
