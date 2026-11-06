import 'dart:async';

import 'package:bahaba_app/config/app_strings.dart';
import 'package:bahaba_app/models/community_report_model.dart';
import 'package:bahaba_app/screens/resident/posted_report_screen.dart';
import 'package:bahaba_app/services/posted_reports_service.dart';
import 'package:bahaba_app/services/verified_report_popups.dart';
import 'package:bahaba_app/widgets/posted_reports_section.dart';
import 'package:bahaba_app/widgets/verified_report_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const me = 'user-1';

PostedReport _report(
  int id, {
  String status = 'approved',
  String? barangay = 'Tuburan',
  String? userId = 'user-2',
  String? reason,
}) =>
    PostedReport(
      id: id,
      location: 'Near the bridge $id',
      waterLevel: WaterLevel.knee,
      timestamp: DateTime.now().subtract(const Duration(minutes: 5)),
      barangay: barangay,
      userId: userId,
      status: status,
      rejectionReason: reason,
    );

void main() {
  group('isPopupEvent', () {
    test('approved in my barangay, or my own anywhere', () {
      expect(isPopupEvent(_report(1), 'Tuburan', me), isTrue);
      expect(isPopupEvent(_report(2, barangay: 'Amatong'), 'Tuburan', me), isFalse);
      expect(isPopupEvent(_report(3, barangay: 'Amatong', userId: me), 'Tuburan', me), isTrue);
    });

    test('a rejection is only for its reporter; pending never pops up', () {
      expect(isPopupEvent(_report(1, status: 'rejected'), 'Tuburan', me), isFalse);
      expect(isPopupEvent(_report(2, status: 'rejected', userId: me), 'Tuburan', me), isTrue);
      expect(isPopupEvent(_report(3, status: 'pending', userId: me), 'Tuburan', me), isFalse);
    });
  });

  group('catchUpReports', () {
    test('first launch shows nothing', () {
      expect(catchUpReports([_report(1)], null, {}), isNull);
    });

    test('a report approved after the last visit counts, whatever its time', () {
      final rows = [_report(1), _report(2)];
      expect(catchUpReports(rows, 1, {'1'})!.map((r) => r.id), [2]);
    });
  });

  group('PopupQueue', () {
    late List<List<int>> shownDialogs;
    late Set<String> shown;
    int? viewing;

    PopupQueue<PostedReport> queue() => PopupQueue(
          keyOf: popupKey,
          reportIdOf: (report) => report.id,
          isShown: shown.contains,
          markShown: shown.addAll,
          isViewing: (id) => id == viewing,
          show: (reports, _) => shownDialogs.add(reports.map((r) => r.id).toList()),
        );

    setUp(() {
      shownDialogs = [];
      shown = {};
      viewing = null;
    });

    testWidgets('groups events within 10 seconds into one dialog', (tester) async {
      final q = queue();
      q.add(_report(1));
      await tester.pump(const Duration(seconds: 9));
      q.add(_report(2));
      expect(shownDialogs, isEmpty);
      await tester.pump(const Duration(seconds: 1));
      expect(shownDialogs, [
        [1, 2]
      ]);
    });

    testWidgets('never shows the same id twice', (tester) async {
      final q = queue();
      q.add(_report(1));
      await tester.pump(popupWindow);
      q.closed();
      q.add(_report(1));
      await tester.pump(popupWindow);
      expect(shownDialogs.length, 1);
    });

    testWidgets('skips the report being viewed', (tester) async {
      viewing = 1;
      final q = queue();
      q.add(_report(1));
      await tester.pump(popupWindow);
      expect(shownDialogs, isEmpty);
      expect(shown, contains('1'));
    });

    testWidgets('waits for an open dialog to close', (tester) async {
      final q = queue();
      q.addCatchUp([_report(1)]);
      q.add(_report(2));
      await tester.pump(popupWindow);
      expect(shownDialogs.length, 1);
      q.closed();
      expect(shownDialogs.last, [2]);
    });

    testWidgets('stop cancels what is waiting', (tester) async {
      final q = queue();
      q.add(_report(1));
      q.stop();
      await tester.pump(popupWindow);
      expect(shownDialogs, isEmpty);
    });

    test('a rejected report approved later pops up again', () {
      expect(popupKey(_report(1, status: 'rejected')), isNot(popupKey(_report(1))));
    });
  });

  group('dialog wording', () {
    Future<void> pump(WidgetTester tester, List<PostedReport> reports, {bool catchUp = false}) =>
        tester.pumpWidget(MaterialApp(
          home: VerifiedReportDialog(
            reports: reports,
            catchUp: catchUp,
            barangay: 'Tuburan',
            userId: me,
            onView: (_) {},
          ),
        ));

    testWidgets('someone else\'s report', (tester) async {
      await pump(tester, [_report(1)]);
      expect(find.text('A flood report was verified in Tuburan'), findsOneWidget);
      expect(find.text('Knee-deep'), findsOneWidget);
      expect(find.text('View report'), findsOneWidget);
      expect(find.text('Dismiss'), findsOneWidget);
    });

    testWidgets('my report', (tester) async {
      await pump(tester, [_report(1, userId: me)]);
      expect(find.text('Your report was verified and is now posted.'), findsOneWidget);
    });

    testWidgets('my rejected report has its reason and no View', (tester) async {
      await pump(tester, [_report(1, userId: me, status: 'rejected', reason: 'Not flooded')]);
      expect(find.text('Your report was not accepted'), findsOneWidget);
      expect(find.text('Reason: Not flooded'), findsOneWidget);
      expect(find.text('View report'), findsNothing);
    });

    testWidgets('catch-up counts reports', (tester) async {
      await pump(tester, [_report(1), _report(2)], catchUp: true);
      expect(find.text('2 new verified reports in Tuburan'), findsOneWidget);
      expect(find.text('View'), findsOneWidget);
    });
  });

  group('PostedReportsSection', () {
    Future<void> pump(WidgetTester tester, Future<List<PostedReport>> Function(String) read,
        {Stream<Object?>? changes}) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: PostedReportsSection(
              barangay: 'Tuburan',
              read: read,
              changes: changes ?? const Stream.empty(),
            ),
          ),
        ),
      ));
      await tester.pump();
    }

    testWidgets('the exact empty text', (tester) async {
      await pump(tester, (_) async => const []);
      expect(find.text('No verified reports in your barangay yet.'), findsOneWidget);
    });

    testWidgets('no reporter name, words for the level, age', (tester) async {
      await pump(tester, (_) async => [_report(1)]);
      expect(find.text('Reported by a resident of Tuburan'), findsOneWidget);
      expect(find.text('Knee-deep'), findsOneWidget);
      expect(find.text('5 minutes ago'), findsOneWidget);
    });

    testWidgets('a change re-reads the list', (tester) async {
      var rows = <PostedReport>[];
      final changes = StreamController<Object?>();
      await pump(tester, (_) async => rows, changes: changes.stream);
      rows = [_report(1)];
      changes.add(null);
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump();
      expect(find.text('Near the bridge 1'), findsOneWidget);
      await changes.close();
    });

    testWidgets('a failed read offers Try again', (tester) async {
      await pump(tester, (_) async => throw Exception('offline'));
      expect(find.text(AppStrings.postedRetry), findsOneWidget);
    });
  });

  testWidgets('the open report is known, so no pop-up shows for it', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: PostedReportScreen(reportId: 7, read: (_) async => _report(7)),
    ));
    await tester.pump();
    expect(PostedReportsService.viewingId, 7);
    expect(find.text('Reported by a resident of Tuburan'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    expect(PostedReportsService.viewingId, isNull);
  });
}
