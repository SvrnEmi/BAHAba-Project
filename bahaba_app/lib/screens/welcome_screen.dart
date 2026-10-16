import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../widgets/brand_logo.dart';
import '../widgets/hotline_buttons.dart';
import 'legal_screen.dart';
import 'login_screen.dart';
import 'quick_report_screen.dart';
import 'register_screen.dart';

/// First screen when nobody is signed in (same as the web app's "/").
/// Signed-in users never see it: the splash screen sends them home.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  void _open(BuildContext context, Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: LayoutBuilder(
          // Fits a phone without scrolling; scrolls on very small screens or large text.
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight - 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: BrandLogo(size: 112)),
                  const SizedBox(height: 16),
                  Text(
                    'BAHAba',
                    textAlign: TextAlign.center,
                    style: AppText.heading(size: 32),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Flood early warning and community reports for Odiongan',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 15),
                  ),
                  const SizedBox(height: 20),

                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                    onPressed: () => _open(context, const LoginScreen()),
                    icon: const Icon(Icons.login),
                    label: const Text('Log in'),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                    onPressed: () => _open(context, const RegisterScreen()),
                    icon: const Icon(Icons.person_add_alt),
                    label: const Text('Create an account'),
                  ),
                  const SizedBox(height: 12),
                  _QuickReportButton(onTap: () => _open(context, const QuickReportScreen())),

                  const SizedBox(height: 18),
                  Semantics(
                    header: true,
                    child: const Text(
                      'EMERGENCY',
                      style: TextStyle(
                        color: AppColors.danger,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const HotlineButtons(row: true),

                  const SizedBox(height: 8),
                  Wrap(
                    alignment: WrapAlignment.center,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      TextButton(
                        onPressed: () => _open(context, const LegalScreen(document: LegalDocument.terms)),
                        child: const Text('Terms of Service'),
                      ),
                      const Text('·', style: TextStyle(color: AppColors.textSecondary)),
                      TextButton(
                        onPressed: () => _open(context, const LegalScreen(document: LegalDocument.privacy)),
                        child: const Text('Privacy Policy'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Highlighted teal button (logo colours) with a subtitle.
class _QuickReportButton extends StatelessWidget {
  final VoidCallback onTap;
  const _QuickReportButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      child: Material(
        color: Colors.transparent,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF14B4CF), Color(0xFF0A6B88)],
            ),
            boxShadow: const [
              BoxShadow(color: Color(0x40000000), offset: Offset(0, 6), blurRadius: 14),
            ],
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: const BoxDecoration(color: Color(0x2EFFFFFF), shape: BoxShape.circle),
                    child: const Icon(Icons.water, color: Colors.white),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Quick Report - no account needed',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Report a flood in under a minute',
                          style: TextStyle(color: Color(0xFFE6FBFF), fontSize: 13.5),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right, color: Colors.white),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
