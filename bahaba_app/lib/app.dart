import 'package:flutter/material.dart';

import 'services/push_notification_service.dart';
import 'theme/app_theme.dart';
import 'screens/splash_screen.dart';

class BAHAbaApp extends StatelessWidget {
  const BAHAbaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BAHAba',
      navigatorKey: PushNotificationService.instance.navigatorKey,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const SplashScreen(),
    );
  }
}
