import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../providers/app_state.dart';
import '../repositories/auth_repository.dart';
import '../theme/app_theme.dart';
import '../utils/navigation.dart';
import '../widgets/clay_container.dart';
import '../widgets/brand_logo.dart';
import 'admin/admin_selection_screen.dart';
import 'register_screen.dart';

/// Login screen with local DB authentication.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _loading = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _loading = true);
    try {
      final appState = context.read<AppState>();
      await appState.login(
        _emailController.text.trim(),
        _passwordController.text,
      );

      if (!mounted) return;
      AppNavigator.goHome(context, appState.role!);
    } on AuthException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: AppColors.danger),
      );
    } on supa.AuthException catch (e) {
      debugPrint('Login failed: ${e.statusCode} ${e.code} ${e.message}');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_supabaseLoginMessage(e)),
          backgroundColor: AppColors.danger,
        ),
      );
    } catch (e) {
      debugPrint('Login failed: $e');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Login failed. Please try again.'),
          backgroundColor: AppColors.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _supabaseLoginMessage(supa.AuthException e) {
    if (e.code == 'invalid_credentials') {
      return 'Wrong email or password.';
    }
    if (e.code == 'email_not_confirmed') {
      return 'Please confirm your email first. Check your inbox.';
    }
    final status = int.tryParse(e.statusCode ?? '');
    if (status != null && status >= 500) {
      return 'The server is busy right now. Please try again in a minute.';
    }
    if (e is supa.AuthRetryableFetchException) {
      return 'Could not reach the server. Check your internet connection.';
    }
    return 'Login failed: ${e.message}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Back to the Welcome screen
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => AppNavigator.backToWelcome(context),
                    icon: const Icon(Icons.arrow_back),
                    label: const Text('Back'),
                  ),
                ),
                const SizedBox(height: 4),
                // Logo + header
                const Center(child: BrandLogo(size: 104)),
                const SizedBox(height: 20),
                Text(
                  'Welcome Back',
                  textAlign: TextAlign.center,
                  style: AppText.heading(size: 28),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Sign in to access BAHAba',
                  textAlign: TextAlign.center,
                  style:
                      TextStyle(color: AppColors.textSecondary, fontSize: 15),
                ),
                const SizedBox(height: 28),

                // Clay form card
                ClayContainer(
                  borderRadius: 28,
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Email
                      TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Email',
                          prefixIcon: Icon(Icons.mail_outline),
                          hintText: 'your.email@example.com',
                        ),
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) {
                            return 'Please enter your email';
                          }
                          if (!v.contains('@')) {
                            return 'Enter a valid email';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 18),

                      // Password
                      TextFormField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        decoration: InputDecoration(
                          labelText: 'Password',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscurePassword
                                  ? Icons.visibility_off
                                  : Icons.visibility,
                            ),
                            onPressed: () => setState(
                                () => _obscurePassword = !_obscurePassword),
                          ),
                        ),
                        validator: (v) {
                          if (v == null || v.isEmpty) {
                            return 'Please enter your password';
                          }
                          return null;
                        },
                        onFieldSubmitted: (_) => _handleLogin(),
                      ),
                      const SizedBox(height: 8),

                      // Remember me + forgot password
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.check_box,
                                  size: 18, color: AppColors.primaryShade),
                              SizedBox(width: 6),
                              Text(
                                'Remember me',
                                style: TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                          TextButton(
                            onPressed: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Password reset coming soon.'),
                                ),
                              );
                            },
                            child: const Text('Forgot password?'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      // Sign in button
                      ElevatedButton(
                        onPressed: _loading ? null : _handleLogin,
                        child: _loading
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Sign In'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // Divider
                const Row(
                  children: [
                    Expanded(child: Divider()),
                    Padding(
                      padding: EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        'or',
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                    ),
                    Expanded(child: Divider()),
                  ],
                ),
                const SizedBox(height: 16),

                // Register link
                const Text(
                  "Don't have an account?",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textSecondary),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const RegisterScreen(),
                      ),
                    );
                  },
                  child: const Text('Create Account'),
                ),
                const SizedBox(height: 24),

                // Demo credentials helper
                ClayContainer(
                  borderRadius: 20,
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    children: [
                      Text('Demo Accounts', style: AppText.heading(size: 15)),
                      const SizedBox(height: 6),
                      _DemoRow(
                        label: 'Resident',
                        onTap: () {
                          _emailController.text = 'resident@bahaba.app';
                          _passwordController.text = 'resident123';
                        },
                      ),
                      _DemoRow(
                        label: 'MDRRMO Admin',
                        onTap: () {
                          _emailController.text = 'mdrrmo@bahaba.app';
                          _passwordController.text = 'mdrrmo123';
                        },
                      ),
                      _DemoRow(
                        label: 'Barangay Admin',
                        onTap: () {
                          _emailController.text = 'barangay@bahaba.app';
                          _passwordController.text = 'barangay123';
                        },
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const AdminSelectionScreen(),
                      ),
                    );
                  },
                  child: const Text('Go to Admin Selection'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DemoRow extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _DemoRow({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        child: Row(
          children: [
            const Icon(Icons.person_outline,
                size: 18, color: AppColors.textSecondary),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(color: AppColors.ink, fontSize: 14),
              ),
            ),
            const Icon(
              Icons.chevron_right,
              size: 20,
              color: AppColors.textSecondary,
            ),
          ],
        ),
      ),
    );
  }
}
