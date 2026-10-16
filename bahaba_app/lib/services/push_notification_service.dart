import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/user_model.dart';
import '../providers/resident_providers.dart';
import 'alerts_seen_store.dart';
import '../screens/resident/alerts_screen.dart';

/// Background/terminated FCM handler. Must be top-level. The system already
/// shows "notification" messages on its own; this only needs Firebase ready.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (error) {
    debugPrint('Push: background Firebase init failed: $error');
  }
  debugPrint('Push: background message ${message.messageId}');
}

/// Firebase Cloud Messaging for flood alerts.
///
/// Every method is safe to call when Firebase failed to start: it logs with
/// debugPrint and returns, so push problems never block the app.
class PushNotificationService {
  PushNotificationService._();
  static final PushNotificationService instance = PushNotificationService._();

  static const AndroidNotificationChannel floodAlertsChannel =
      AndroidNotificationChannel(
    'flood_alerts',
    'Flood Alerts',
    description: 'Flood warnings and critical alerts for your barangay.',
    // Max so critical alerts get full priority; warnings still heads-up.
    importance: Importance.max,
  );

  static const String _deviceTokensTable = 'device_tokens';

  /// Lets notification taps open the Alerts screen from anywhere.
  final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  bool _enabled = false;
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;
  StreamSubscription<RemoteMessage>? _openedSub;

  // Tap routing: a tap waits until a signed-in home screen is showing.
  bool _pendingOpenAlerts = false;
  UserRole? _homeRole;
  VoidCallback? _residentAlertsTab;

  /// Call once from main() after Firebase.initializeApp() succeeded.
  Future<void> init() async {
    try {
      await _local.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        ),
        onDidReceiveNotificationResponse: (_) => _openAlerts(),
      );
      await _local
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(floodAlertsChannel);

      _foregroundSub = FirebaseMessaging.onMessage.listen(_showForeground);
      _openedSub =
          FirebaseMessaging.onMessageOpenedApp.listen((_) => _openAlerts());

      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) _pendingOpenAlerts = true;

      _enabled = true;
    } catch (error, stack) {
      debugPrint('Push: init failed, continuing without push. $error\n$stack');
    }
  }

  // ---------------------------------------------------------------------------
  // Token registration
  // ---------------------------------------------------------------------------

  /// After login (or app start with a session): ask for permission, then
  /// register this device's token and keep it fresh.
  Future<void> registerDevice() async {
    if (!_enabled) return;
    try {
      final settings = await FirebaseMessaging.instance.requestPermission();
      debugPrint('Push: permission ${settings.authorizationStatus}');

      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await _upsertToken(token);

      _tokenRefreshSub ??=
          FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
        unawaited(_upsertToken(newToken));
      });
    } catch (error) {
      debugPrint('Push: device registration failed: $error');
    }
  }

  Future<void> _upsertToken(String token) async {
    final userId = Supabase.instance.client.auth.currentUser?.id;
    if (userId == null) {
      debugPrint('Push: no signed-in Supabase user, token not saved.');
      return;
    }
    try {
      await Supabase.instance.client.from(_deviceTokensTable).upsert(
        {
          'token': token,
          'user_id': userId,
          'platform': 'android',
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        },
        onConflict: 'token',
      );
    } catch (error) {
      debugPrint('Push: saving token failed: $error');
    }
  }

  /// Before sign-out: remove this device's row (while still authenticated),
  /// then delete the FCM token. Gives up after a few seconds so logout is
  /// never blocked.
  Future<void> unregisterDevice() async {
    _homeRole = null;
    _pendingOpenAlerts = false;
    if (!_enabled) return;
    await _tokenRefreshSub?.cancel();
    _tokenRefreshSub = null;
    try {
      await () async {
        final token = await FirebaseMessaging.instance.getToken();
        if (token != null) {
          await Supabase.instance.client
              .from(_deviceTokensTable)
              .delete()
              .eq('token', token);
        }
        await FirebaseMessaging.instance.deleteToken();
      }()
          .timeout(const Duration(seconds: 5));
    } catch (error) {
      debugPrint('Push: unregistering device failed: $error');
    }
  }

  // ---------------------------------------------------------------------------
  // Display
  // ---------------------------------------------------------------------------

  Future<void> _showForeground(RemoteMessage message) async {
    final title = message.notification?.title ?? message.data['title'];
    final body = message.notification?.body ?? message.data['body'];
    if (title == null && body == null) return;

    final critical = message.data['level'] == 'critical';
    try {
      await _local.show(
        id: message.messageId?.hashCode ??
            DateTime.now().millisecondsSinceEpoch.remainder(1 << 31),
        title: title?.toString(),
        body: body?.toString(),
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            floodAlertsChannel.id,
            floodAlertsChannel.name,
            channelDescription: floodAlertsChannel.description,
            importance: critical ? Importance.max : Importance.high,
            priority: critical ? Priority.max : Priority.high,
            category: AndroidNotificationCategory.alarm,
          ),
        ),
      );
    } catch (error) {
      debugPrint('Push: showing foreground notification failed: $error');
    }
  }

  // ---------------------------------------------------------------------------
  // Opening the Alerts screen from a tap
  // ---------------------------------------------------------------------------

  /// MainShell registers a callback that switches to its Alerts tab.
  void attachResidentAlertsTab(VoidCallback openTab) {
    _residentAlertsTab = openTab;
    if (_pendingOpenAlerts) {
      _pendingOpenAlerts = false;
      // Called from initState: switch tabs after the first frame.
      WidgetsBinding.instance.addPostFrameCallback((_) => openTab());
    }
  }

  void detachResidentAlertsTab(VoidCallback openTab) {
    if (_residentAlertsTab == openTab) _residentAlertsTab = null;
  }

  /// Called by AppNavigator.goHome once a signed-in home screen is shown.
  void onHomeShown(UserRole role) {
    _homeRole = role;
    if (_pendingOpenAlerts && role != UserRole.resident) {
      _pendingOpenAlerts = false;
      _pushAlertsRoute();
    }
    // Residents: MainShell consumes the pending tap in attachResidentAlertsTab.
  }

  void _openAlerts() {
    final tab = _residentAlertsTab;
    if (tab != null) {
      tab();
    } else if (_homeRole != null && _homeRole != UserRole.resident) {
      _pushAlertsRoute();
    } else {
      // Not signed in yet (or still on splash): open after home is shown.
      _pendingOpenAlerts = true;
    }
  }

  void _pushAlertsRoute() {
    final navigator = navigatorKey.currentState;
    if (navigator == null) {
      _pendingOpenAlerts = true;
      return;
    }
    navigator.push(MaterialPageRoute(builder: (_) => const _AlertsRoute()));
  }

  @visibleForTesting
  Future<void> dispose() async {
    await _foregroundSub?.cancel();
    await _openedSub?.cancel();
    await _tokenRefreshSub?.cancel();
  }
}

/// Alerts screen opened from a notification outside the resident shell
/// (e.g. admins). Loads the alert feed itself and stops it on close.
class _AlertsRoute extends StatefulWidget {
  const _AlertsRoute();

  @override
  State<_AlertsRoute> createState() => _AlertsRouteState();
}

class _AlertsRouteState extends State<_AlertsRoute> {
  late final AlertProvider _alerts;

  @override
  void initState() {
    super.initState();
    _alerts = context.read<AlertProvider>();
    AlertsSeenStore.instance.markSeen();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _alerts.load();
    });
  }

  @override
  void dispose() {
    AlertsSeenStore.instance.markSeen();
    _alerts.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Alerts')),
      body: const AlertsScreen(),
    );
  }
}
