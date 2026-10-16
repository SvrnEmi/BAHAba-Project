import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../theme/app_theme.dart';
import '../utils/simple_markdown.dart';
import '../widgets/clay_container.dart';
import '../widgets/brand_logo.dart';

enum LegalDocument { terms, privacy }

/// Terms of Service / Privacy Policy, reachable without logging in.
/// Text comes from assets/legal/*.md (copies of the repo-root documents the
/// web app shows at /terms and /privacy).
class LegalScreen extends StatelessWidget {
  final LegalDocument document;
  const LegalScreen({super.key, required this.document});

  String get _title =>
      document == LegalDocument.terms ? 'Terms of Service' : 'Privacy Policy';

  String get _asset => document == LegalDocument.terms
      ? 'assets/legal/terms_of_service.md'
      : 'assets/legal/privacy_policy.md';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: BrandAppBarTitle(child: Text(_title))),
      body: SafeArea(
        child: FutureBuilder<String>(
          future: rootBundle.loadString(_asset),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return const Padding(
                padding: EdgeInsets.all(20),
                child: Text(
                  'This document could not be opened. Please try again later.',
                  style: TextStyle(color: AppColors.ink),
                ),
              );
            }
            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final blocks = parseMarkdown(snapshot.data!);
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                ClayContainer(
                  borderRadius: 22,
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [for (final b in blocks) _block(b)],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  static const _body = TextStyle(color: AppColors.ink, fontSize: 15, height: 1.45);

  Widget _rich(String text, {TextStyle style = _body}) {
    return Text.rich(
      TextSpan(
        style: style,
        children: [
          for (final s in parseInline(text))
            TextSpan(
              text: s.text,
              style: TextStyle(
                fontWeight: s.bold ? FontWeight.w700 : null,
                fontStyle: s.italic ? FontStyle.italic : null,
              ),
            ),
        ],
      ),
    );
  }

  Widget _block(MdBlock b) {
    return switch (b) {
      MdHeading(:final level, :final text) => Padding(
          padding: EdgeInsets.only(top: level == 1 ? 0 : 14, bottom: 8),
          child: Semantics(
            header: true,
            child: _rich(text, style: AppText.heading(size: level == 1 ? 22 : level == 2 ? 17 : 15.5)),
          ),
        ),
      MdRule() => const Padding(
          padding: EdgeInsets.symmetric(vertical: 10),
          child: Divider(height: 1),
        ),
      MdList(:final items) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final item in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('•  ', style: _body),
                      Expanded(child: _rich(item)),
                    ],
                  ),
                ),
            ],
          ),
        ),
      // Tables become stacked label/value cards, which read better on a phone.
      MdTable(:final header, :final rows) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final row in rows)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (var k = 0; k < row.length; k++) ...[
                        if (k > 0 && k < header.length)
                          Padding(
                            padding: const EdgeInsets.only(top: 6, bottom: 2),
                            child: Text(
                              header[k],
                              style: const TextStyle(
                                color: AppColors.textSecondary,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        _rich(row[k]),
                      ],
                    ],
                  ),
                ),
            ],
          ),
        ),
      MdParagraph(:final lines) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: _rich(lines.join('\n')),
        ),
    };
  }
}
