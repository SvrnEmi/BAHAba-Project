import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/user_model.dart';
import '../repositories/auth_repository.dart';
import '../services/push_notification_service.dart';

/// Global app state: current user session + navigation context.
class AppState extends ChangeNotifier {
  final AuthRepository _authRepository = AuthRepository();

  User? _currentUser;
  bool _isLoading = true;

  User? get currentUser => _currentUser;
  bool get isLoading => _isLoading;
  bool get isLoggedIn => _currentUser != null;
  UserRole? get role => _currentUser?.role;

  Future<void> init() async {
    _isLoading = true;
    notifyListeners();

    await _authRepository.init();
    _currentUser = await _authRepository.getCurrentUser();

    _isLoading = false;
    notifyListeners();

    // Existing session: refresh this device's push token in the background.
    if (_currentUser != null) {
      unawaited(PushNotificationService.instance.registerDevice());
    }
  }

  Future<void> login(String email, String password) async {
    _currentUser = await _authRepository.login(email, password);
    notifyListeners();
    unawaited(PushNotificationService.instance.registerDevice());
  }

  Future<void> register({
    required String fullName,
    required String email,
    required String password,
    required String phone,
    required String barangay,
  }) async {
    _currentUser = await _authRepository.register(
      fullName: fullName,
      email: email,
      password: password,
      phone: phone,
      barangay: barangay,
    );
    notifyListeners();
    if (_currentUser != null) {
      unawaited(PushNotificationService.instance.registerDevice());
    }
  }

  /// Applies saved profile edits to the in-memory user so screens (e.g. the
  /// Home greeting) update immediately.
  void applyProfileChanges(
      {String? fullName, String? phone, String? barangay}) {
    final user = _currentUser;
    if (user == null) return;
    _currentUser = user.copyWith(
      fullName: fullName,
      phone: phone,
      barangay: barangay,
    );
    notifyListeners();
  }

  Future<void> logout() async {
    // Remove this device's token while still signed in (time-limited).
    await PushNotificationService.instance.unregisterDevice();
    await _authRepository.logout();
    _currentUser = null;
    notifyListeners();
  }
}
