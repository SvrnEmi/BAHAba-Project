import 'package:bahaba_app/models/alert_model.dart';
import 'package:bahaba_app/widgets/alert_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Alert _alert({String source = 'barangay'}) => Alert(
      id: 1,
      level: AlertLevel.warning,
      title: 'Flood warning - Riverside',
      message: 'First line of the message.\nSecond line with more detail.',
      targetBarangay: 'Tuburan',
      channels: const [AlertChannel.push],
      sentAt: DateTime.now()
          .subtract(const Duration(minutes: 5))
          .toUtc()
          .toIso8601String(),
      recipients: 0,
      createdBy: 'Tuburan admin',
      source: source,
    );

Widget _wrap(Widget child) => MaterialApp(
      home: Scaffold(body: SizedBox(width: 360, child: child)),
    );

void main() {
  test('PAGASA text for each stored level', () {
    expect(AlertLevel.advisory.pagasaText, 'Yellow - Be Alert');
    expect(AlertLevel.warning.pagasaText, 'Orange - Be Prepared');
    expect(AlertLevel.critical.pagasaText, 'Red - Take Action');
    expect(AlertStatus.fromString('withdrawn'), AlertStatus.withdrawn);
    expect(_alert().previewText, '[Orange - Be Prepared] Flood warning - Riverside');
  });

  testWidgets('collapsed by default, expands to the full message and source',
      (tester) async {
    await tester.pumpWidget(_wrap(AlertCard(alert: _alert())));

    expect(find.text('Orange - Be Prepared'), findsOneWidget);
    expect(find.text('Barangay'), findsOneWidget);
    expect(find.text('First line of the message.'), findsOneWidget);
    expect(find.textContaining('Second line'), findsNothing);
    expect(find.textContaining('Source'), findsNothing);

    await tester.tap(find.text('Flood warning - Riverside'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Second line'), findsOneWidget);
    expect(find.textContaining('Source'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('header exposes its expanded state to screen readers',
      (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(_wrap(AlertCard(alert: _alert(source: 'mdrrmo'))));

    final header = find.bySemanticsLabel(RegExp('Orange - Be Prepared'));
    expect(tester.getSemantics(header), matchesSemantics(
      isButton: true,
      hasExpandedState: true,
      isExpanded: false,
      hasTapAction: true,
      label: 'Orange - Be Prepared: Flood warning - Riverside, Tuburan',
      hint: 'Show details',
    ));
    handle.dispose();
  });
}
