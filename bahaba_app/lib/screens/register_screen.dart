import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_state.dart';
import '../repositories/barangay_repository.dart';
import '../theme/app_theme.dart';
import '../utils/auth_errors.dart';
import '../utils/navigation.dart';
import '../widgets/clay_container.dart';
import '../widgets/brand_logo.dart';
import 'login_screen.dart';

/// Registration screen — creates a resident account in the local DB.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _fullNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  String? _selectedBarangay;
  List<String> _barangays = BarangayRepository.currentNames;
  bool _obscurePassword = true;
  bool _agreeTerms = false;
  bool _loading = false;

  /// The email that sign-up reported as taken; shows the "Log in" notice.
  String? _takenEmail;

  @override
  void initState() {
    super.initState();
    // Signed out, RLS hides the table, so this usually stays on the official list.
    BarangayRepository.names().then((names) {
      if (mounted) setState(() => _barangays = names);
    });
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _handleRegister() async {
    if (!_formKey.currentState!.validate()) return;
    if (!_agreeTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please agree to the Terms of Service.'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    final email = _emailController.text.trim();
    setState(() {
      _loading = true;
      _takenEmail = null;
    });
    try {
      final appState = context.read<AppState>();
      await appState.register(
        fullName: _fullNameController.text.trim(),
        email: email,
        password: _passwordController.text,
        phone: _phoneController.text.trim(),
        barangay: _selectedBarangay ?? '',
      );

      if (!mounted) return;
      final role = appState.role;
      if (role == null) {
        // "Confirm email" is on: the account exists but there is no session
        // until the link in the inbox is opened.
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Account created. Please check your email to confirm it, then log in.',
            ),
            backgroundColor: AppColors.success,
          ),
        );
        _goToLogin(email);
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Account created successfully!'),
          backgroundColor: AppColors.success,
        ),
      );
      AppNavigator.goHome(context, role);
    } catch (e) {
      logAuthError('Registration', e);
      if (!mounted) return;
      if (isAlreadyRegistered(e)) {
        setState(() => _takenEmail = email);
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(registerErrorMessage(e)),
          backgroundColor: AppColors.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // Opened from Welcome or Login: always land on Login.
  void _goToLogin([String? email]) {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => LoginScreen(initialEmail: email)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const BrandAppBarTitle(child: Text('Create Account')),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Center(child: BrandLogo(size: 84)),
                const SizedBox(height: 14),
                const Text(
                  'Join the BAHAba community',
                  textAlign: TextAlign.center,
                  style:
                      TextStyle(color: AppColors.textSecondary, fontSize: 15),
                ),
                const SizedBox(height: 24),
                ClayContainer(
                  borderRadius: 28,
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Full name
                      TextFormField(
                        controller: _fullNameController,
                        decoration: const InputDecoration(
                          labelText: 'Full Name',
                          prefixIcon: Icon(Icons.person_outline),
                          hintText: 'Juan Dela Cruz',
                        ),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'Enter your full name'
                            : null,
                      ),
                      const SizedBox(height: 18),

                      // Email
                      TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Email',
                          prefixIcon: Icon(Icons.mail_outline),
                          hintText: 'your.email@example.com',
                        ),
                        onChanged: (_) {
                          if (_takenEmail != null) {
                            setState(() => _takenEmail = null);
                          }
                        },
                        validator: (v) {
                          if (v == null || v.trim().isEmpty) {
                            return 'Enter your email';
                          }
                          if (!v.contains('@')) return 'Enter a valid email';
                          return null;
                        },
                      ),
                      const SizedBox(height: 18),

                      // Phone
                      TextFormField(
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Phone Number',
                          prefixIcon: Icon(Icons.phone_outlined),
                          hintText: '09XX XXX XXXX',
                        ),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'Enter your phone'
                            : null,
                      ),
                      const SizedBox(height: 18),

                      // Barangay
                      DropdownButtonFormField<String>(
                        initialValue: _selectedBarangay,
                        borderRadius: BorderRadius.circular(20),
                        decoration: const InputDecoration(
                          labelText: 'Barangay',
                          prefixIcon: Icon(Icons.location_on_outlined),
                        ),
                        items: _barangays
                            .map((name) => DropdownMenuItem(
                                  value: name,
                                  child: Text('Barangay $name'),
                                ))
                            .toList(),
                        onChanged: (v) => setState(() => _selectedBarangay = v),
                        validator: (v) =>
                            v == null ? 'Select your barangay' : null,
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
                          if (v == null || v.length < 8) {
                            return 'Password must be at least 8 characters';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 18),

                      // Confirm password
                      TextFormField(
                        controller: _confirmPasswordController,
                        obscureText: _obscurePassword,
                        decoration: const InputDecoration(
                          labelText: 'Confirm Password',
                          prefixIcon: Icon(Icons.lock_outline),
                        ),
                        validator: (v) {
                          if (v != _passwordController.text) {
                            return "Passwords don't match";
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 12),

                      // Terms checkbox
                      CheckboxListTile(
                        value: _agreeTerms,
                        onChanged: (v) =>
                            setState(() => _agreeTerms = v ?? false),
                        title: const Text(
                          'I agree to the Terms of Service and Privacy Policy',
                          style: TextStyle(color: AppColors.ink, fontSize: 13),
                        ),
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                      ),
                      const SizedBox(height: 12),

                      if (_takenEmail != null) ...[
                        AlreadyRegisteredNotice(
                          onLogIn: () => _goToLogin(_takenEmail),
                        ),
                        const SizedBox(height: 12),
                      ],

                      ElevatedButton(
                        onPressed: _loading ? null : _handleRegister,
                        child: _loading
                            ? const SizedBox(
                                height: 22,
                                width: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('Create Account'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      'Already have an account?',
                      style: TextStyle(
                          color: AppColors.textSecondary, fontSize: 14),
                    ),
                    TextButton(
                      onPressed: _goToLogin,
                      child: const Text('Sign In'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Stays on screen (unlike a SnackBar) so the "Log in" button can't time out.
class AlreadyRegisteredNotice extends StatelessWidget {
  final VoidCallback onLogIn;

  const AlreadyRegisteredNotice({super.key, required this.onLogIn});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            alreadyRegisteredMessage,
            style: TextStyle(color: AppColors.ink, fontSize: 14),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(onPressed: onLogIn, child: const Text('Log in')),
          ),
        ],
      ),
    );
  }
}
