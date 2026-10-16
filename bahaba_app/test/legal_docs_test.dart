import 'dart:io';

import 'package:bahaba_app/utils/simple_markdown.dart';
import 'package:flutter_test/flutter_test.dart';

/// The app ships copies of the repo-root Terms and Privacy Policy (Flutter
/// assets must live inside bahaba_app). This fails when they drift apart:
/// copy the root files into assets/legal/ again.
void main() {
  for (final name in ['terms_of_service.md', 'privacy_policy.md']) {
    test('$name asset matches the repo-root document', () {
      final root = File('../$name');
      if (!root.existsSync()) return; // app checked out on its own
      final asset = File('assets/legal/$name').readAsStringSync().replaceAll('\r\n', '\n');
      expect(asset, root.readAsStringSync().replaceAll('\r\n', '\n'));
    });

    test('$name parses into headings, lists and paragraphs', () {
      final blocks = parseMarkdown(File('assets/legal/$name').readAsStringSync());
      expect(blocks.first, isA<MdHeading>());
      expect(blocks.whereType<MdList>(), isNotEmpty);
      expect(blocks.whereType<MdParagraph>(), isNotEmpty);
    });
  }

  test('table separator row is skipped and cells are split', () {
    final blocks = parseMarkdown('| A | B |\n|---|---|\n| **x** | y |');
    final table = blocks.single as MdTable;
    expect(table.header, ['A', 'B']);
    expect(table.rows, [
      ['**x**', 'y'],
    ]);
  });

  test('contact lines stay one paragraph with line breaks', () {
    final blocks = parseMarkdown('Phone: 1\nEmail: x');
    expect((blocks.single as MdParagraph).lines, ['Phone: 1', 'Email: x']);
  });

  test('inline bold and italic', () {
    final spans = parseInline('a **b** c *d*');
    expect(spans.map((s) => '${s.text}|${s.bold}|${s.italic}'), [
      'a |false|false',
      'b|true|false',
      ' c |false|false',
      'd|false|true',
    ]);
  });
}
