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

  List<Barangay> get barangays => _barangays;
  bool get loading => _loading;

  Future<void> load() async {
    _loading = true;
    notifyListeners();
    _barangays = await _repo.getAll();
    _loading = false;
    notifyListeners();
  }
}

/// Provides broadcast alerts to the resident Alerts screen.
///
/// Subscribes to Realtime so a newly broadcast alert from MDRRMO appears
/// immediately without the resident needing to refresh or re-navigate.
class AlertProvider extends ChangeNotifier {
  final AlertRepository _repo = AlertRepository();
  StreamSubscription<List<Alert>>? _sub;

  List<Alert> _alerts = [];
  bool _loading = true;

  List<Alert> get alerts => _alerts;
  bool get loading => _loading;

  Future<void> load() async {
    _loading = true;
    notifyListeners();

    _sub?.cancel();
    _sub = _repo.watchBroadcastAlerts().listen((alerts) {
      _alerts = alerts;
      _loading = false;
      notifyListeners();
    });
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
