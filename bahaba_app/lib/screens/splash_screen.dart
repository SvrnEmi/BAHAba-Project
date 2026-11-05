import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../utils/navigation.dart';
import '../widgets/brand_logo.dart';
import 'welcome_screen.dart';

/// Brief loading screen (logo only) while the session is restored. Signed-out
/// users go straight to the Welcome screen, as on the web app; signed-in
/// users go home (with the one-time permission onboarding first).
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final appState = context.read<AppState>();
    // Wait for state init if not yet loaded
    if (appState.isLoading) {
      await Future<void>.delayed(const Duration(milliseconds: 1500));
    }

    if (!mounted) return;
    if (appState.isLoggedIn) {
      AppNavigator.goHome(context, appState.role!);
    } else {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const WelcomeScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.background,
      body: Center(child: BrandLogo(size: 132)),
    );
  }
}
