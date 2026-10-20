import 'package:bahaba_app/services/report_messages_service.dart';
import 'package:bahaba_app/widgets/report_messages_section.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// In-memory stand-in for report_messages that mirrors the server rule:
/// a resident may send at most 3 in a row until staff reply.
class _FakeService extends ReportMessagesService {
  final List<ReportMessage> rows = [];
  final List<Map<String, dynamic>> inserts = [];
  int _id = 0;

  @override
  Future<List<ReportMessage>> fetchThread(int reportId) async =>
      List.of(rows);

  @override
  Future<ReportMessage?> fetchLatest(int reportId) async =>
      rows.isEmpty ? null : rows.last;

  @override
  Future<ReportMessage?> send(int reportId, String draft) async {
    final body = sendableBody(draft)!;
    final run = rows.reversed
        .takeWhile((m) => m.senderRole == SenderRole.resident)
        .length;
    if (run >= 3) {
      throw const PostgrestException(
          message: 'Please wait for a reply before sending more messages.');
    }
    inserts.add({'report_id': reportId, 'body': body});
    final message = ReportMessage(
      id: ++_id,
      senderRole: SenderRole.resident,
      body: body,
      createdAt: DateTime.now().toUtc().add(Duration(seconds: _id)),
    );
    rows.add(message);
    return message;
  }

  @override
  RealtimeChannel subscribe(int reportId, void Function(ReportMessage) onInsert) =>
      throw UnsupportedError('no realtime in tests');
}

void main() {
  group('helpers', () {
    test('sendableBody trims and enforces 1-1000 characters', () {
      expect(sendableBody('   '), isNull);
      expect(sendableBody('  hi  '), 'hi');
      expect(sendableBody('a' * 1000), hasLength(1000));
      expect(sendableBody('a' * 1001), isNull);
    });

    test('counter shows only near the limit', () {
      expect(counterText('a' * 799), isNull);
      expect(counterText('a' * 800), '800/1000');
    });

    test('New dot: latest from someone else and newer than last seen', () {
      final t = DateTime.utc(2026, 10, 20, 8);
      final staff = ReportMessage(
          id: 1, senderRole: SenderRole.barangay, body: 'x', createdAt: t);
      final mine = ReportMessage(
          id: 2, senderRole: SenderRole.resident, body: 'x', createdAt: t);
      expect(hasNewMessage(staff, SenderRole.resident, null), isTrue);
      expect(hasNewMessage(staff, SenderRole.resident, t), isFalse);
      expect(
          hasNewMessage(staff, SenderRole.resident,
              t.subtract(const Duration(minutes: 1))),
          isTrue);
      expect(hasNewMessage(mine, SenderRole.resident, null), isFalse);
      expect(hasNewMessage(null, SenderRole.resident, null), isFalse);
    });

    test('sender roles parse and label as text', () {
      expect(parseSenderRole('mdrrmo'), SenderRole.mdrrmo);
      expect(parseSenderRole('admin'), isNull);
      expect(senderLabel(SenderRole.barangay), 'Barangay');
      expect(senderLabel(SenderRole.mdrrmo), 'MDRRMO');
    });

    test('server error text is shown as is', () {
      expect(
        sendErrorText(const PostgrestException(message: 'Please wait for a reply...')),
        'Please wait for a reply...',
      );
      expect(sendErrorText(Exception('x')), contains('Unable to send'));
    });
  });

  group('ReportThread', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    Future<_FakeService> pumpThread(WidgetTester tester,
        {String? legacy}) async {
      final service = _FakeService();
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ReportMessagesSection(
              reportId: 7,
              service: service,
              legacyReply: legacy,
            ),
          ),
        ),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Messages'));
      await tester.pumpAndSettle();
      return service;
    }

    testWidgets('empty state, Send disabled until there is text',
        (tester) async {
      await pumpThread(tester);
      expect(find.text(kEmptyThreadText), findsOneWidget);
      ElevatedButton send() =>
          tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Send'));
      expect(send().onPressed, isNull);
      await tester.enterText(find.byType(TextField), '   ');
      await tester.pump();
      expect(send().onPressed, isNull);
      await tester.enterText(find.byType(TextField), 'Tubig na sa tuhod');
      await tester.pump();
      expect(send().onPressed, isNotNull);
    });

    testWidgets('3 messages send; the 4th is blocked with the server message',
        (tester) async {
      final service = await pumpThread(tester);
      for (var i = 1; i <= 4; i++) {
        await tester.enterText(find.byType(TextField), ' message $i ');
        await tester.pump();
        await tester.tap(find.widgetWithText(ElevatedButton, 'Send'));
        await tester.pumpAndSettle();
      }
      // Only report_id and body are ever sent, trimmed.
      expect(service.inserts, [
        {'report_id': 7, 'body': 'message 1'},
        {'report_id': 7, 'body': 'message 2'},
        {'report_id': 7, 'body': 'message 3'},
      ]);
      expect(find.text('message 3'), findsOneWidget);
      expect(find.text(' message 4 '), findsOneWidget); // still in the input
      expect(find.text('Please wait for a reply before sending more messages.'),
          findsOneWidget);
      expect(find.text('YOU'), findsNWidgets(3));
    });

    testWidgets('old admin reply shows first, labelled MDRRMO', (tester) async {
      await pumpThread(tester, legacy: 'Team is on the way.');
      expect(find.text('Team is on the way.'), findsOneWidget);
      expect(find.text('MDRRMO · Earlier reply'), findsOneWidget);
      expect(find.text(kEmptyThreadText), findsNothing);
    });
  });
}
