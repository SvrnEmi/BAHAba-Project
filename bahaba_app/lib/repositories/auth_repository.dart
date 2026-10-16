import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/user_model.dart' as app_user;

/// Authentication repository backed by Supabase Auth and profiles table.
class AuthRepository {
  static const _sessionKey = 'bahaba_session_user_id';
  static const _sessionRoleKey = 'bahaba_session_role';

  final SupabaseClient _client = Supabase.instance.client;

  Future<void> init() async {
    await _client.auth.getSession();
  }

  Future<app_user.User> login(String email, String password) async {
    final response = await _client.auth.signInWithPassword(
      email: email.trim(),
      password: password,
    );

    final authUser = response.user;
    if (authUser == null) {
      throw AuthException('Login failed. Please try again.');
    }

    // Creates the profile on first sign-in after email confirmation
    // (see register()).
    final mappedUser = await _ensureProfile(authUser);
    if (mappedUser == null) {
      throw AuthException('No profile found for this user.');
    }
    if (!_hasAppRole(mappedUser)) {
      await logout();
      throw AuthException('Not authorized. This account cannot use the BAHAba app.');
    }

    await _saveSession(mappedUser);
    return mappedUser;
  }

  /// Registers a new resident account.
  ///
  /// IMPORTANT: this project has "Confirm email" enabled in Supabase Auth.
  /// That means `signUp()` does NOT return an active session until the user
  /// clicks the confirmation link in their inbox — `auth.uid()` is null until
  /// then, so RLS will block any write to `profiles` if we try it here.
  /// Instead, we save the fields locally and let `login()` create the
  /// profile row on the user's first successful (confirmed) sign-in.
  Future<app_user.User?> register({
    required String fullName,
    required String email,
    required String password,
    required String phone,
    required String barangay,
  }) async {
    final response = await _client.auth.signUp(
      email: email.trim(),
      password: password,
      data: {
        'name': fullName.trim(),
        'phone': phone.trim(),
        'barangay': barangay.trim(),
        'role': app_user.UserRole.resident.value,
      },
    );

    if (response.user == null) {
      throw AuthException('Registration failed. Please try again.');
    }

    // If email confirmation is required, there is no session yet.
    // Do NOT try to write to `profiles` now — it will fail RLS.
    if (response.session == null) {
      return null; // caller should show "check your email to confirm"
    }

    // Confirmation-less project (or already confirmed): session exists now,
    // so we can safely create the profile row.
    final profile = await _client
        .from('profiles')
        .upsert({
          'id': response.user!.id,
          'name': fullName.trim(),
          'email': email.trim(),
          'phone': phone.trim(),
          'role': app_user.UserRole.resident.value,
          'barangay': barangay.trim(),
        })
        .select()
        .single();

    final created = app_user.User.fromMap(profile);
    await _saveSession(created);
    return created;
  }

  Future<app_user.User?> getCurrentUser() async {
    final session = _client.auth.currentSession;
    final user = _client.auth.currentUser;
    if (session == null || user == null) return null;

    final profile = await _ensureProfile(user);
    if (profile != null && !_hasAppRole(profile)) {
      // A stored session for an account without a BAHAba role (e.g. a super
      // admin): sign out instead of opening the app.
      await logout();
      return null;
    }
    return profile;
  }

  /// Only these profile roles may use the app. Anything else (for example
  /// "superadmin", which UserRole.fromString would read as resident) is
  /// rejected rather than defaulted.
  static const _appRoles = {'resident', 'barangay', 'mdrrmo'};

  /// True only for the profile roles the app supports.
  static bool isAppRole(String? role) => _appRoles.contains(role?.trim().toLowerCase());

  /// Raw profiles.role per user id, as read by [_ensureProfile].
  final Map<String?, String?> _rawRoles = {};

  bool _hasAppRole(app_user.User user) => isAppRole(_rawRoles[user.id]);

  /// Fetches the profile row for [user], creating it from auth metadata
  /// if it doesn't exist yet (covers users who confirmed their email after
  /// signUp, since we couldn't write the profile at signUp time).
  Future<app_user.User?> _ensureProfile(User user) async {
    final existing =
        await _client.from('profiles').select().eq('id', user.id).maybeSingle();

    if (existing != null) {
      _rawRoles[user.id] = (existing['role'] as String?)?.trim().toLowerCase();
      return app_user.User.fromMap(existing);
    }

    final meta = user.userMetadata ?? {};
    final created = await _client
        .from('profiles')
        .upsert({
          'id': user.id,
          'name': meta['name'] ?? user.email?.split('@').first ?? 'Resident',
          'email': user.email,
          'phone': meta['phone'],
          'role': meta['role'] ?? 'resident',
          'barangay': meta['barangay'],
        })
        .select()
        .single();

    _rawRoles[user.id] = (created['role'] as String?)?.trim().toLowerCase();
    return app_user.User.fromMap(created);
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_sessionKey);
    await prefs.remove(_sessionRoleKey);
    try {
      await _client.auth.signOut();
    } catch (error) {
      // The local session is already cleared; a server error here
      // (e.g. Supabase overloaded) must not block returning to login.
      debugPrint('Sign-out request failed: $error');
    }
  }

  Future<void> _saveSession(app_user.User user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_sessionKey, user.id ?? '');
    await prefs.setString(_sessionRoleKey, user.role.value);
  }
}

class AuthException implements Exception {
  final String message;
  AuthException(this.message);

  @override
  String toString() => message;
}
