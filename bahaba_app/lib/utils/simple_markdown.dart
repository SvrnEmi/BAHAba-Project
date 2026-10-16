/// Parser for the small Markdown subset used by the Terms and Privacy Policy
/// (same rules as the web app's LegalPage): #/##/### headings, "- " lists,
/// tables, "---" rules, paragraphs (line breaks kept), **bold** and *italic*.
sealed class MdBlock {
  const MdBlock();
}

class MdHeading extends MdBlock {
  final int level;
  final String text;
  const MdHeading(this.level, this.text);
}

class MdRule extends MdBlock {
  const MdRule();
}

class MdList extends MdBlock {
  final List<String> items;
  const MdList(this.items);
}

class MdTable extends MdBlock {
  final List<String> header;
  final List<List<String>> rows;
  const MdTable(this.header, this.rows);
}

class MdParagraph extends MdBlock {
  final List<String> lines;
  const MdParagraph(this.lines);
}

/// A run of inline text: plain, bold or italic.
class MdSpan {
  final String text;
  final bool bold;
  final bool italic;
  const MdSpan(this.text, {this.bold = false, this.italic = false});
}

final _heading = RegExp(r'^(#{1,3})\s+(.*)$');
final _rule = RegExp(r'^-{3,}\s*$');
final _bullet = RegExp(r'^\s*-\s+');
final _separatorCell = RegExp(r'^:?-{3,}:?$');
final _blockStart = RegExp(r'^(#{1,3}\s|-{3,}\s*$|\s*-\s+|\s*\|)');

List<String> _cells(String line) {
  var s = line.trim();
  if (s.startsWith('|')) s = s.substring(1);
  if (s.endsWith('|')) s = s.substring(0, s.length - 1);
  return s.split('|').map((c) => c.trim()).toList();
}

List<MdBlock> parseMarkdown(String markdown) {
  final lines = markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  final blocks = <MdBlock>[];
  var i = 0;
  while (i < lines.length) {
    final line = lines[i];
    if (line.trim().isEmpty) {
      i++;
      continue;
    }
    final heading = _heading.firstMatch(line);
    if (heading != null) {
      blocks.add(MdHeading(heading.group(1)!.length, heading.group(2)!.trim()));
      i++;
    } else if (_rule.hasMatch(line)) {
      blocks.add(const MdRule());
      i++;
    } else if (_bullet.hasMatch(line)) {
      final items = <String>[];
      while (i < lines.length && _bullet.hasMatch(lines[i])) {
        items.add(lines[i++].replaceFirst(_bullet, ''));
      }
      blocks.add(MdList(items));
    } else if (line.trim().startsWith('|')) {
      final rows = <List<String>>[];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        final row = _cells(lines[i++]);
        if (!row.every(_separatorCell.hasMatch)) rows.add(row);
      }
      blocks.add(MdTable(rows.isEmpty ? const [] : rows.first, rows.skip(1).toList()));
    } else {
      final para = <String>[];
      while (i < lines.length && lines[i].trim().isNotEmpty && !_blockStart.hasMatch(lines[i])) {
        para.add(lines[i++].trim());
      }
      blocks.add(MdParagraph(para));
    }
  }
  return blocks;
}

final _inline = RegExp(r'\*\*([^*]+)\*\*|\*([^*]+)\*');

List<MdSpan> parseInline(String text) {
  final spans = <MdSpan>[];
  var last = 0;
  for (final m in _inline.allMatches(text)) {
    if (m.start > last) spans.add(MdSpan(text.substring(last, m.start)));
    spans.add(m.group(1) != null ? MdSpan(m.group(1)!, bold: true) : MdSpan(m.group(2)!, italic: true));
    last = m.end;
  }
  if (last < text.length) spans.add(MdSpan(text.substring(last)));
  return spans;
}
