import 'package:bahaba_app/config/app_strings.dart';
import 'package:bahaba_app/services/advisory_popups.dart';
import 'package:bahaba_app/services/report_advisories_service.dart';
import 'package:bahaba_app/services/verified_report_popups.dart';
import 'package:bahaba_app/widgets/advisory_dialog.dart';
import 'package:bahaba_app/widgets/report_advisories_section.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

ReportAdvisory _advisory(int id, {int reportId = 1, String? name = 'Kap Reyes'}) =>
    ReportAdvisory(
      id: id,
      reportId: reportId,
      authorId: 'official',
      authorRole: 'barangay',
      authorName: name,
      body: 'Avoid the bridge',
      createdAt: DateTime(2026, 11, 6, 9),
    );

void main() {
  group('postableAdvisory', () {
    test('needs 3 to 300 trimmed characters', () {
      expect(postableAdvisory('  ab '), isNull);
      expect(postableAdvisory('  abc '), 'abc');
      expect(postableAdvisory('x' * 300), isNotNull);
      expect(postableAdvisory('x' * 301), isNull);
    });
  });

  group('ReportAdvisory', () {
    test('reads a row and falls back to the role without a name', () {
      final advisory = ReportAdvisory.fromRow({
        'id': 7,
        'report_id': 3,
        'author_id': 'u',
        'author_role': 'mdrrmo',
        'author_name': ' ',
        'body': 'Stay away',
        'created_at': '2026-11-06T01:00:00Z',
      });
      expect(advisory.id, 7);
      expect(advisory.reportId, 3);
      expect(advisory.author, 'MDRRMO');
      expect(_advisory(1).author, 'Kap Reyes');
      expect(_advisory(1, name: null).author, 'Barangay');
    });
  });

  group('advisory pop-up rules', () {
    test('first launch shows nothing; later ones skip what was shown', () {
      final rows = [_advisory(1), _advisory(2)];
      expect(catchUpAdvisories(rows, null, {}), isNull);
      expect(
        catchUpAdvisories(rows, 1, {'advisory:1'})!.map((a) => a.id),
        [2],
      );
    });

    late List<List<int>> dialogs;
    late Set<String> shown;
    int? viewing;

    PopupQueue<ReportAdvisory> queue() => PopupQueue(
          keyOf: advisoryPopupKey,
          reportIdOf: (advisory) => advisory.reportId,
          isShown: shown.contains,
          markShown: shown.addAll,
          isViewing: (id) => id == viewing,
          show: (rows, _) => dialogs.add(rows.map((a) => a.id).toList()),
        );

    setUp(() {
      dialogs = [];
      shown = {};
      viewing = null;
    });

    testWidgets('groups within 10 seconds and shows each id once',
        (tester) async {
      final q = queue();
      q.add(_advisory(1));
      await tester.pump(const Duration(seconds: 9));
      q.add(_advisory(2));
      await tester.pump(const Duration(seconds: 1));
      expect(dialogs, [
        [1, 2]
      ]);
      q.closed();
      q.add(_advisory(1));
      await tester.pump(popupWindow);
      expect(dialogs.length, 1);
    });

    testWidgets('skips the report being viewed, by report id', (tester) async {
      viewing = 5;
      final q = queue();
      q.add(_advisory(1, reportId: 5));
      await tester.pump(popupWindow);
      expect(dialogs, isEmpty);
      expect(shown, {'advisory:1'});
    });
  });

  group('AdvisoryDialog', () {
    testWidgets('one advisory: the exact title, the text and View report',
        (tester) async {
      int? opened;
      await tester.pumpWidget(MaterialApp(
        home: AdvisoryDialog(
          advisories: [_advisory(1, reportId: 9)],
          onView: (id) => opened = id,
        ),
      ));
      expect(find.text('Your barangay posted an advisory on your report'),
          findsOneWidget);
      expect(find.text('Avoid the bridge'), findsOneWidget);
      await tester.tap(find.text(AppStrings.popupViewReport));
      expect(opened, 9);
    });

    testWidgets('several advisories: a count and one View report each',
        (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: AdvisoryDialog(
          advisories: [_advisory(1), _advisory(2, reportId: 2)],
          onView: (_) {},
        ),
      ));
      expect(find.text('Your barangay posted 2 advisories on your reports'),
          findsOneWidget);
      expect(find.text(AppStrings.popupViewReport), findsNWidgets(2));
    });
  });

  testWidgets('the staff panel explains comment and advisory, and needs 3 characters',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(child: ReportAdvisoryPanel(reportId: 1)),
      ),
    ));
    expect(find.textContaining('private, between you and the reporter'),
        findsOneWidget);
    expect(find.textContaining('public, shown on the posted report'),
        findsOneWidget);

    ElevatedButton post() => tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, AppStrings.advisoryPost));
    expect(post().onPressed, isNull);
    await tester.enterText(find.byType(TextField), 'ab');
    await tester.pump();
    expect(post().onPressed, isNull);
    await tester.enterText(find.byType(TextField), 'abc');
    await tester.pump();
    expect(post().onPressed, isNotNull);
  });
}
