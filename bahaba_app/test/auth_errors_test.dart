import 'package:bahaba_app/repositories/auth_repository.dart';
import 'package:bahaba_app/screens/login_screen.dart';
import 'package:bahaba_app/screens/register_screen.dart';
import 'package:bahaba_app/utils/auth_errors.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

supa.AuthException authError(String message, {String? code, String? status}) =>
    supa.AuthException(message, code: code, statusCode: status);

supa.User signUpUser(List<dynamic>? identities) => supa.User.fromJson({
      'id': '00000000-0000-4000-8000-000000000001',
      'app_metadata': <String, dynamic>{},
      'user_metadata': <String, dynamic>{},
      'aud': 'authenticated',
      'created_at': '2026-11-05T00:00:00Z',
      if (identities != null) 'identities': identities,
    })!;

void main() {
  group('registerErrorMessage', () {
    test('already registered, by code or by message', () {
      expect(registerErrorMessage(authError('x', code: 'user_already_exists')),
          alreadyRegisteredMessage);
      expect(registerErrorMessage(authError('User already registered')),
          alreadyRegisteredMessage);
    });

    test('specific cases', () {
      expect(registerErrorMessage(authError('x', code: 'weak_password')),
          weakPasswordMessage);
      expect(
          registerErrorMessage(authError('x', code: 'email_address_invalid')),
          invalidEmailMessage);
      expect(
          registerErrorMessage(
              authError('Unable to validate email address: invalid format')),
          invalidEmailMessage);
      expect(
          registerErrorMessage(
              authError('x', code: 'over_email_send_rate_limit')),
          'Too many attempts. Please wait a few minutes.');
    });

    test('no internet versus a server error', () {
      expect(registerErrorMessage(supa.AuthRetryableFetchException()),
          noInternetMessage);
      expect(
          registerErrorMessage(
              supa.AuthRetryableFetchException(statusCode: '503')),
          serverBusyMessage);
    });

    test('generic text only when nothing else matches', () {
      expect(registerErrorMessage(authError('x', code: 'something_new')),
          registrationFailedMessage);
      expect(registerErrorMessage(StateError('boom')),
          registrationFailedMessage);
    });
  });

  test('resetErrorMessage never claims the link was sent', () {
    expect(resetErrorMessage(authError('x', code: 'over_email_send_rate_limit')),
        tooManyAttemptsMessage);
    expect(resetErrorMessage(supa.AuthRetryableFetchException()),
        noInternetMessage);
    expect(resetErrorMessage(authError('x')), resetFailedMessage);
  });

  group('isDuplicateSignUp', () {
    test('placeholder user with no identities and no session', () {
      expect(AuthRepository.isDuplicateSignUp(null, signUpUser([])), isTrue);
    });

    test('a genuine new user is not a duplicate', () {
      final identity = {
        'id': '1',
        'user_id': '00000000-0000-4000-8000-000000000001',
        'identity_data': <String, dynamic>{},
        'identity_id': '1',
        'provider': 'email',
      };
      expect(AuthRepository.isDuplicateSignUp(null, signUpUser([identity])),
          isFalse);
      expect(AuthRepository.isDuplicateSignUp(null, signUpUser(null)), isFalse);
    });
  });

  testWidgets('AlreadyRegisteredNotice shows the message and Log in',
      (tester) async {
    var tapped = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: AlreadyRegisteredNotice(onLogIn: () => tapped = true),
      ),
    ));

    expect(find.text(alreadyRegisteredMessage), findsOneWidget);
    await tester.tap(find.text('Log in'));
    expect(tapped, isTrue);
  });

  testWidgets('LoginScreen pre-fills the email it is given', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: LoginScreen(initialEmail: 'juan@example.com'),
    ));

    expect(find.text('juan@example.com'), findsOneWidget);
    expect(find.text('Forgot password?'), findsOneWidget);
  });
}
