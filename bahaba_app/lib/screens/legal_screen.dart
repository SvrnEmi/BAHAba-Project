import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/clay_container.dart';

enum LegalDocument { terms, privacy }

/// Terms of Service / Privacy Policy, reachable without logging in.
///
/// TODO: the official text has not been provided yet; replace [_body] with
/// the MDRRMO-approved Terms and Privacy Policy.
class LegalScreen extends StatelessWidget {
  final LegalDocument document;
  const LegalScreen({super.key, required this.document});

  String get _title =>
      document == LegalDocument.terms ? 'Terms of Service' : 'Privacy Policy';

  String get _body => document == LegalDocument.terms
      ? 'The Terms of Service will be published here by the Odiongan MDRRMO.'
      : 'The Privacy Policy will be published here by the Odiongan MDRRMO.';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: Text(_title)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            ClayContainer(
              borderRadius: 20,
              padding: const EdgeInsets.all(18),
              child: Text(
                _body,
                style: const TextStyle(color: AppColors.ink, fontSize: 15, height: 1.4),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
