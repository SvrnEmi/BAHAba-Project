import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app.dart';
import 'providers/admin_providers.dart';
import 'providers/app_state.dart';
import 'providers/resident_providers.dart';
import 'repositories/auth_repository.dart';
import 'services/push_notification_service.dart';
import 'services/sync_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Push notifications. Any Firebase failure is logged and the app
  // continues without push.
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    await PushNotificationService.instance.init();
  } catch (error, stack) {
    debugPrint('Firebase init failed, continuing without push: $error\n$stack');
  }

  await dotenv.load(fileName: '.env');

  final supabaseUrl = dotenv.env['SUPABASE_URL'];
  final supabasePublishableKey = dotenv.env['SUPABASE_PUBLISHABLE_KEY'];

  if (supabaseUrl == null || supabasePublishableKey == null) {
    throw StateError(
        'Missing Supabase environment values. Check the app .env file.');
  }

  await Supabase.initialize(
    url: supabaseUrl,
    publishableKey: supabasePublishableKey,
  );

  final authRepository = AuthRepository();
  await authRepository.init();

  final appState = AppState();
  await appState.init();

  // Sync in the background so a network or Supabase failure
  // can't keep the app stuck on the splash screen.
  unawaited(
    SyncService.instance.init().catchError((Object error, StackTrace stack) {
      debugPrint('Startup sync failed: $error\n$stack');
    }),
  );

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AppState>.value(value: appState),
        ChangeNotifierProvider<BarangayProvider>(
          create: (_) => BarangayProvider(),
        ),
        ChangeNotifierProvider<AlertProvider>(
          create: (_) => AlertProvider(),
        ),
        ChangeNotifierProvider<ReportProvider>(
          create: (_) => ReportProvider(),
        ),
        ChangeNotifierProvider<AdminAlertProvider>(
          create: (_) => AdminAlertProvider(),
        ),
        ChangeNotifierProvider<AdminReportProvider>(
          create: (_) => AdminReportProvider(),
        ),
        ChangeNotifierProvider<AuditProvider>(
          create: (_) => AuditProvider(),
        ),
      ],
      child: const BAHAbaApp(),
    ),
  );
}
