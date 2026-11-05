import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/alert_model.dart';
import '../models/barangay_model.dart';
import '../models/community_report_model.dart';
import '../repositories/alert_repository.dart';
import '../repositories/barangay_repository.dart';
import '../repositories/report_repository.dart';

/// Provides barangay data to the resident screens.
class BarangayProvider extends ChangeNotifier {
  final BarangayRepository _repo = BarangayRepository();

  List<Barangay> _barangays = [];
  bool _loading = true;

  // Zones (names, coordinates, live flood_risk) come from the Supabase
  // barangays table, as on the web map. The local cache (seeded with the
  // official list) shows them until the table arrives, and when offline.
  StreamSubscription<List<Map<String, dynamic>>>? _liveSub;
  String? _cachedNames;

  List<Barangay> get barangays => _barangays;
  bool get loading => _loading;

  Future<void> load() async {
    _loading = true;
    notifyListeners();
    _barangays = await _repo.getAll();
    _loading = false;
    notifyListeners();
    _liveSub ??= _repo.watchAll().listen(
      (rows) {
        final live = rows.map(Barangay.tryFromMap).whereType<Barangay>().toList()
          ..sort((a, b) => a.name.compareTo(b.name));
        if (live.isEmpty) return;
        _barangays = live;
        notifyListeners();
        // Refresh the offline cache when the list itself changes.
        final key = live.map((b) => '${b.name}@${b.lat},${b.lng}').join('|');
        if (key != _cachedNames) {
          _cachedNames = key;
          unawaited(_repo.cacheAll(live));
        }
      },
      onError: (Object error) =>
          debugPrint('Barangays: live risk unavailable: $error'),
    );
  }

  /// Stops the live subscription (on sign-out).
  void stop() {
    _liveSub?.cancel();
    _liveSub = null;
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}

/// Provides current alerts to the resident Alerts, Home and Map screens.
///
/// Reads the view active_alerts for the resident's barangay plus "All
/// Barangays" (explicit columns), and re-reads it when the shared
/// alerts channel reports a change, so a barangay alert appears at once.
/// Row-level security hides a withdrawn alert from residents, so Realtime
/// never delivers that change to them: the list is also re-read every
/// minute while it is in use and on [refresh] (pull to refresh, app resume),
/// so withdrawn alerts drop off within a minute.
class AlertProvider extends ChangeNotifier {
  final AlertRepository _repo = AlertRepository();
  StreamSubscription<List<Alert>>? _sub;
  Timer? _timer;
  Timer? _debounce;
  bool _cancelled = false;

  String? _barangay;
  List<Alert> _alerts = [];
  bool _loading = true;
  String? _error;

  static const _refreshEvery = Duration(minutes: 1);

  List<Alert> get alerts => _alerts;
  bool get loading => _loading;
  String? get error => _error;
  String? get barangay => _barangay;

  Future<void> load({String? barangay}) async {
    stop();
    _cancelled = false;
    _barangay = barangay?.trim();
    _loading = true;
    notifyListeners();

    await refresh();
    if (_cancelled) return;
    _sub = _repo.watchAll().listen(
      (_) {
        _debounce?.cancel();
        _debounce = Timer(const Duration(milliseconds: 400), refresh);
      },
      onError: (Object error) => debugPrint('Alerts channel: $error'),
    );
    _timer = Timer.periodic(_refreshEvery, (_) => refresh());
  }

  /// Re-reads the list from Supabase.
  Future<void> refresh() async {
    final barangay = _barangay ?? '';
    try {
      final rows = await _repo.fetchResidentAlerts(barangay);
      if (_cancelled) return;
      _alerts = rows;
      _error = null;
    } catch (e) {
      if (_cancelled) return;
      _error = e.toString();
    }
    _loading = false;
    notifyListeners();
  }

  /// Cancels the live subscription and timers. Call from the owning
  /// screen's dispose so the Realtime channel closes when the screen does.
  void stop() {
    _cancelled = true;
    _sub?.cancel();
    _sub = null;
    _timer?.cancel();
    _timer = null;
    _debounce?.cancel();
    _debounce = null;
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}

/// Provides community reports for the resident Reports screen.
///
/// Subscribes to a live Supabase Realtime stream, scoped to the current
/// resident's own reports when [userName] is provided, so status changes
/// and deletions made by MDRRMO appear immediately.
class ReportProvider extends ChangeNotifier {
  final ReportRepository _repo = ReportRepository();
  StreamSubscription<List<CommunityReport>>? _sub;

  List<CommunityReport> _reports = [];
  bool _loading = true;
  String? _error;

  List<CommunityReport> get reports => _reports;
  bool get loading => _loading;
  String? get error => _error;

  /// Starts (or restarts) the live subscription.
  /// Pass [userName] to scope to just that resident's own reports;
  /// omit it to watch only approved reports for the public feed.
  Future<void> load({String? userName}) async {
    _loading = true;
    _error = null;
    notifyListeners();

    _sub?.cancel();
    final stream = (userName != null && userName.isNotEmpty)
        ? _repo.watchByUserName(userName)
        : _repo.watchApproved();

    _sub = stream.listen(
      (reports) {
        _reports = reports;
        _loading = false;
        notifyListeners();
      },
      onError: (e) {
        _error = e.toString();
        _loading = false;
        notifyListeners();
      },
    );
  }

  void loadMyReports(String userName) => load(userName: userName);

  Future<void> submit({
    required String userName,
    required String location,
    double? lat,
    double? lng,
    required WaterLevel waterLevel,
    required String description,
    String? photoPath,
  }) async {
    await _repo.submit(
      userName: userName,
      location: location,
      lat: lat,
      lng: lng,
      waterLevel: waterLevel,
      description: description,
      photoPath: photoPath,
    );
  }

  /// Cancels the live subscription. Call from the owning screen's dispose
  /// so the Realtime channel closes when the screen does.
  void stop() {
    _sub?.cancel();
    _sub = null;
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
