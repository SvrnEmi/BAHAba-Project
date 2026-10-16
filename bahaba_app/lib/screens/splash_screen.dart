import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_state.dart';
import '../theme/app_theme.dart';
import '../utils/navigation.dart';
import '../widgets/clay_container.dart';
import 'login_screen.dart';
import 'permissions_screen.dart';

/// Splash / onboarding screen. Shows the BAHAba branding, then routes
/// based on whether a session exists.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  bool _navigating = false;

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
    await _continue();
  }

  /// Shows first-launch permission onboarding if it hasn't been done yet,
  /// otherwise goes straight to the normal post-splash route.
  Future<void> _continue() async {
    if (_navigating) return;
    _navigating = true;

    final onboardingDone = await PermissionsOnboarding.isDone();
    if (!mounted) return;

    if (onboardingDone) {
      _routeAfterSplash(context);
    } else {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => const PermissionsScreen(
            onFinished: _routeAfterSplash,
          ),
        ),
      );
    }
  }

  /// Existing post-splash routing: home if a session exists, else login.
  static void _routeAfterSplash(BuildContext context) {
    final appState = context.read<AppState>();
    if (appState.isLoggedIn) {
      AppNavigator.goHome(context, appState.role!);
    } else {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo
                  const ClayLogoBadge(size: 132, iconSize: 64),
                  const SizedBox(height: 28),
                  Text('BAHAba', style: AppText.heading(size: 40)),
                  const SizedBox(height: 8),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 32),
                    child: Text(
                      'Community-Centered Flood Communication System',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 16,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: 32),
              child: ElevatedButton(
                onPressed: _continue,
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(280, 56),
                ),
                child: const Text('Get Started'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
