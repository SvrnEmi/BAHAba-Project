import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

/// User-facing text for Supabase Auth failures on sign-up and password reset.
/// Keep the wording in step with src/lib/authErrors.ts (web app).
const alreadyRegisteredMessage =
    'This email is already registered. Please log in or reset your password.';
const weakPasswordMessage =
    'This password is too weak. Please choose a stronger one.';
const invalidEmailMessage = 'Please enter a valid email address.';
const noInternetMessage =
    'No internet connection. Please check your connection and try again.';
const tooManyAttemptsMessage = 'Too many attempts. Please wait a few minutes.';
const serverBusyMessage =
    'The server is busy right now. Please try again in a minute.';
const registrationFailedMessage = 'Registration failed. Please try again.';
const resetLinkSentMessage =
    'If this email is registered, a reset link has been sent.';
const resetFailedMessage = 'Could not send the reset link. Please try again.';

/// Logs the real error in debug builds only; release builds print nothing.
void logAuthError(String action, Object error) {
  if (!kDebugMode) return;
  if (error is supa.AuthException) {
    debugPrint('$action failed: code=${error.code} '
        'status=${error.statusCode} message=${error.message}');
  } else {
    debugPrint('$action failed: $error');
  }
}

bool isAlreadyRegistered(Object error) {
  if (error is! supa.AuthException) return false;
  return error.code == 'user_already_exists' ||
      error.message.toLowerCase().contains('already registered');
}

bool _isRateLimited(supa.AuthException e) =>
    e.code == 'over_email_send_rate_limit' ||
    e.code == 'over_request_rate_limit' ||
    e.statusCode == '429';

bool _isInvalidEmail(supa.AuthException e) {
  if (e.code == 'email_address_invalid') return true;
  final message = e.message.toLowerCase();
  return message.contains('email') &&
      (message.contains('invalid') || message.contains('validate'));
}

/// No response at all from the server. A failed sign-up write can also reach
/// us as a raw client error, so those are matched by text.
bool _isNoInternet(Object error) {
  if (error is supa.AuthRetryableFetchException) {
    return error.statusCode == null;
  }
  final text = error.toString();
  return text.contains('SocketException') ||
      text.contains('ClientException') ||
      text.contains('Failed host lookup');
}

bool _isServerError(Object error) {
  if (error is! supa.AuthException) return false;
  final status = int.tryParse(error.statusCode ?? '');
  return status != null && status >= 500;
}

String registerErrorMessage(Object error) {
  if (isAlreadyRegistered(error)) return alreadyRegisteredMessage;
  if (_isNoInternet(error)) return noInternetMessage;
  if (_isServerError(error)) return serverBusyMessage;
  if (error is supa.AuthException) {
    if (error.code == 'weak_password') return weakPasswordMessage;
    if (_isRateLimited(error)) return tooManyAttemptsMessage;
    if (_isInvalidEmail(error)) return invalidEmailMessage;
  }
  return registrationFailedMessage;
}

String resetErrorMessage(Object error) {
  if (_isNoInternet(error)) return noInternetMessage;
  if (_isServerError(error)) return serverBusyMessage;
  if (error is supa.AuthException) {
    if (_isRateLimited(error)) return tooManyAttemptsMessage;
    if (_isInvalidEmail(error)) return invalidEmailMessage;
  }
  return resetFailedMessage;
}
