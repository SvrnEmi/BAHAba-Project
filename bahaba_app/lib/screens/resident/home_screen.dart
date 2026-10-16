import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../models/alert_model.dart';
import '../../models/community_report_model.dart';
import '../../providers/app_state.dart';
import '../../providers/resident_providers.dart';
import '../../repositories/alert_repository.dart';
import '../../repositories/barangay_repository.dart';
import '../../repositories/report_repository.dart';
import '../../services/alerts_seen_store.dart';
import '../../theme/app_theme.dart';
import '../../utils/report_display.dart';
import '../../widgets/alert_card.dart';
import '../../widgets/clay_button.dart';
import '../../widgets/clay_container.dart';
import '../../widgets/profile_avatar_button.dart';
import '../../widgets/risk_badge.dart';
import 'hazard_map_screen.dart';
import 'alerts_screen.dart';
import 'community_reports_screen.dart';

/// Resident home screen: current flood status + quick access.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<AppState>();
    final residentBarangay = appState.currentUser?.barangay;
    debugPrint(
        '[BAHAba] Resident profiles.barangay: "${residentBarangay ?? '<null>'}"');

    void openMap() => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const HomeMapView()),
        );
    void openAlerts() => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const HomeAlertsView()),
        );
    void openReports() => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const HomeReportsView()),
        );

    final fullName = appState.currentUser?.fullName.trim() ?? '';
    final firstName = fullName.isEmpty ? 'there' : fullName.split(' ').first;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header: greeting + bell (+ logout)
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _greeting(),
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Kumusta, $firstName',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppText.heading(
                          size: 18,
                          weight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                // Profile avatar centered; logout now lives in Profile.
                ProfileAvatarButton(name: appState.currentUser?.fullName),
                Expanded(
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: _AlertsBell(
                      barangay: residentBarangay,
                      onTap: openAlerts,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 20),
            _ResidentStatusCard(barangayName: residentBarangay),

            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: ClayButton(
                    label: 'Submit report',
                    icon: Icons.photo_camera_outlined,
                    onPressed: openReports,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ClayButton.secondary(
                    label: 'View map',
                    icon: Icons.map_outlined,
                    onPressed: openMap,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 24),
            // Latest report from the resident's barangay
            _LatestReportCard(
              barangay: residentBarangay,
              onOpen: openReports,
            ),

            const SizedBox(height: 24),
            const _LatestAlert(),
          ],
        ),
      ),
    );
  }

  static String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }
}

/// 44px clay circle with a primary icon, inside a 48x48 tap target.
class _HeaderCircle extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  /// Unread count shown as a red badge at the top-right; hidden when 0.
  final int badge;

  const _HeaderCircle({
    required this.icon,
    required this.label,
    required this.onTap,
    this.badge = 0,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          ClayContainer(
            circle: true,
            width: 44,
            height: 44,
            padding: EdgeInsets.zero,
            onTap: onTap,
            semanticLabel: label,
            child: Icon(icon, color: AppColors.primary, size: 22),
          ),
          if (badge > 0)
            Positioned(
              top: 0,
              right: 0,
              child: ExcludeSemantics(
                child: IgnorePointer(
                  child: Container(
                    constraints:
                        const BoxConstraints(minWidth: 20, minHeight: 20),
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: const Color(0xFFC0392B),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.background, width: 2),
                    ),
                    child: Text(
                      badge > 99 ? '99+' : '$badge',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        height: 1,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Header bell with a live unread count: approved alerts for this barangay
/// (or all barangays) sent after the user last opened Alerts. Uses the
/// shared alerts channel, so no extra Realtime connection is opened.
class _AlertsBell extends StatefulWidget {
  final String? barangay;
  final VoidCallback onTap;

  const _AlertsBell({required this.barangay, required this.onTap});

  @override
  State<_AlertsBell> createState() => _AlertsBellState();
}

class _AlertsBellState extends State<_AlertsBell> {
  StreamSubscription<List<Alert>>? _sub;
  List<Alert> _alerts = const [];
  DateTime? _lastSeen;
  int _loadGeneration = 0;

  @override
  void initState() {
    super.initState();
    AlertsSeenStore.instance.addListener(_loadLastSeen);
    _loadLastSeen();
    _sub = AlertRepository().watchAll().listen(
      (alerts) {
        if (mounted) setState(() => _alerts = alerts);
      },
      onError: (Object error) => debugPrint('Unread alerts stream: $error'),
    );
  }

  @override
  void dispose() {
    AlertsSeenStore.instance.removeListener(_loadLastSeen);
    _sub?.cancel();
    super.dispose();
  }

  /// Async read guarded by a generation counter (the "cancelled" flag): an
  /// older read never overwrites a newer one, and nothing runs after dispose.
  Future<void> _loadLastSeen() async {
    final generation = ++_loadGeneration;
    final userId = AlertsSeenStore.currentUserId;
    if (userId == null) return;
    final lastSeen = await AlertsSeenStore.instance.lastSeen(userId);
    if (!mounted || generation != _loadGeneration) return;
    setState(() => _lastSeen = lastSeen);
  }

  int get _unread {
    final barangay = widget.barangay;
    final lastSeen = _lastSeen;
    if (barangay == null || barangay.isEmpty || lastSeen == null) return 0;
    return _alerts.where((alert) {
      if (alert.status != AlertStatus.approved) return false;
      if (!AlertsSeenStore.targetsBarangay(alert.targetBarangay, barangay)) {
        return false;
      }
      final sent = DateTime.tryParse(alert.sentAt);
      return sent != null && sent.isAfter(lastSeen);
    }).length;
  }

  @override
  Widget build(BuildContext context) {
    final unread = _unread;
    return _HeaderCircle(
      icon: Icons.notifications_outlined,
      label: unread > 0 ? 'Alerts, $unread unread' : 'Alerts',
      badge: unread,
      onTap: widget.onTap,
    );
  }
}

/// Compact teal card with the newest approved report from the resident's
/// barangay. Uses the shared community_reports stream (see RealtimeHub), so
/// no extra Realtime connection is opened. Hidden if the stream fails.
class _LatestReportCard extends StatefulWidget {
  final String? barangay;
  final VoidCallback onOpen;

  const _LatestReportCard({required this.barangay, required this.onOpen});

  @override
  State<_LatestReportCard> createState() => _LatestReportCardState();
}

class _LatestReportCardState extends State<_LatestReportCard> {
  static const double _height = 92;

  StreamSubscription<List<CommunityReport>>? _sub;
  List<CommunityReport>? _recent; // null while loading
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _sub = ReportRepository().watchApproved().listen(
      (reports) {
        // Same window as the web app: newest 30 approved reports.
        if (mounted) setState(() => _recent = reports.take(30).toList());
      },
      onError: (Object error) {
        debugPrint('Latest report stream failed: $error');
        if (mounted) setState(() => _failed = true);
      },
    );
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final barangay = widget.barangay;
    if (barangay == null || barangay.isEmpty || _failed) {
      return const SizedBox.shrink();
    }

    final recent = _recent;
    if (recent == null) {
      return ExcludeSemantics(
        child: Container(
          height: _height,
          decoration: BoxDecoration(
            color: AppColors.reportTeal.withValues(alpha: 0.35),
            borderRadius: BorderRadius.circular(20),
          ),
        ),
      );
    }

    // Selection re-runs on every stream event and when barangays load.
    final barangays = context.watch<BarangayProvider>().barangays;
    CommunityReport? latest;
    for (final report in recent) {
      if (reportBelongsToBarangay(report, barangay, barangays)) {
        latest = report;
        break;
      }
    }

    const white = Colors.white;
    final tag = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: white,
        borderRadius: BorderRadius.circular(999),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.description_outlined,
              size: 12, color: AppColors.reportTeal),
          SizedBox(width: 4),
          Text(
            'Reports',
            style: TextStyle(
              color: AppColors.reportTeal,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              height: 1.3,
            ),
          ),
        ],
      ),
    );
    const chevron = Icon(Icons.chevron_right, color: white, size: 20);

    if (latest == null) {
      return ClayContainer(
        color: AppColors.reportTeal,
        borderRadius: 20,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        onTap: widget.onOpen,
        semanticLabel: 'No reports in $barangay yet. Be the first to report.',
        child: Row(
          children: [
            tag,
            const SizedBox(width: 10),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: 'No reports in $barangay yet',
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    const TextSpan(text: ' · Be the first to report'),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: white, fontSize: 13),
              ),
            ),
            chevron,
          ],
        ),
      );
    }

    final detail = [
      waterLevelLabel(latest.waterLevel),
      if (latest.location.trim().isNotEmpty) latest.location.trim(),
    ].join(' - ');
    final reporter = displayReporterName(latest.userName);
    final when = relativeTime(latest.timestamp);

    return ClayContainer(
      color: AppColors.reportTeal,
      borderRadius: 20,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      onTap: widget.onOpen,
      semanticLabel: 'Latest report in $barangay: $detail, by $reporter, '
          '$when. Open community reports.',
      child: ExcludeSemantics(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  tag,
                  const SizedBox(height: 4),
                  Text(
                    'Latest report - $barangay',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.heading(
                      size: 14,
                      weight: FontWeight.w600,
                      color: white,
                    ).copyWith(height: 1.25),
                  ),
                  Text(
                    detail,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: white, fontSize: 12, height: 1.3),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          reporter,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: white, fontSize: 11, height: 1.3),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        when,
                        style: const TextStyle(
                            color: white, fontSize: 11, height: 1.3),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            chevron,
          ],
        ),
      ),
    );
  }
}

/// Most recent critical or warning alert, as a flat [AlertCard].
class _LatestAlert extends StatelessWidget {
  const _LatestAlert();

  @override
  Widget build(BuildContext context) {
    final alerts = context.watch<AlertProvider>().alerts;
    Alert? latest;
    for (final alert in alerts) {
      if (alert.level == AlertLevel.critical ||
          alert.level == AlertLevel.warning) {
        latest = alert;
        break;
      }
    }
    if (latest == null) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Latest alert', style: AppText.heading(size: 16)),
        const SizedBox(height: 10),
        AlertCard(alert: latest, showDetails: false),
      ],
    );
  }
}

class _ResidentStatusCard extends StatefulWidget {
  final String? barangayName;

  const _ResidentStatusCard({required this.barangayName});

  @override
  State<_ResidentStatusCard> createState() => _ResidentStatusCardState();
}

class _ResidentStatusCardState extends State<_ResidentStatusCard> {
  String? _lastRisk;
  bool _highlighted = false;

  // Created once per barangay, not in build(): every rebuild would
  // otherwise open a new Supabase Realtime subscription.
  Stream<Map<String, dynamic>?>? _barangayStream;

  @override
  void initState() {
    super.initState();
    _barangayStream = _watchBarangay();
  }

  @override
  void didUpdateWidget(covariant _ResidentStatusCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.barangayName != widget.barangayName) {
      _lastRisk = null;
      _barangayStream = _watchBarangay();
    }
  }

  Stream<Map<String, dynamic>?>? _watchBarangay() {
    final name = widget.barangayName;
    if (name == null || name.isEmpty) return null;
    return BarangayRepository().watchBarangay(name);
  }

  static const _label = Text(
    'Your barangay',
    style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
  );

  @override
  Widget build(BuildContext context) {
    if (widget.barangayName == null || widget.barangayName!.isEmpty) {
      return const ClayContainer(
        child: Row(
          children: [
            Icon(Icons.location_off, color: AppColors.textSecondary),
            SizedBox(width: 12),
            Text('No barangay set'),
          ],
        ),
      );
    }

    return ClayContainer(
      padding: const EdgeInsets.all(16),
      child: StreamBuilder<Map<String, dynamic>?>(
        stream: _barangayStream,
        builder: (context, snapshot) {
          if (!mounted) return const SizedBox.shrink();
          final row = snapshot.data;
          if (snapshot.hasError || row == null) {
            return const Row(
              children: [
                Icon(Icons.info_outline, color: AppColors.textSecondary),
                SizedBox(width: 12),
                Text('Status unavailable'),
              ],
            );
          }
          final risk = row['flood_risk'] as String?;
          if (_lastRisk != null && risk != _lastRisk && !_highlighted) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              setState(() => _highlighted = true);
              Future<void>.delayed(const Duration(milliseconds: 700), () {
                if (mounted) setState(() => _highlighted = false);
              });
            });
          }
          _lastRisk = risk;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            decoration: BoxDecoration(
              color: _highlighted
                  ? RiskBadge.colorFor(RiskBadge.fromValue(risk).risk)
                      .withValues(alpha: 0.08)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _label,
                const SizedBox(height: 4),
                Text(
                  widget.barangayName!,
                  style: AppText.heading(size: 20),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    RiskBadge.fromValue(risk),
                    Text(
                      _residentLastUpdate(row['last_update']),
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

String _residentLastUpdate(Object? value) {
  if (value == null) return 'Updated: not available';
  final parsed = DateTime.tryParse(value.toString())?.toLocal();
  if (parsed == null) return 'Updated: not available';
  final diff = DateTime.now().difference(parsed);
  if (diff.isNegative || diff.inMinutes < 1) return 'Updated just now';
  if (diff.inMinutes < 60) return 'Updated ${diff.inMinutes} min ago';
  if (diff.inHours < 24) {
    return 'Updated ${diff.inHours} ${diff.inHours == 1 ? 'hr' : 'hrs'} ago';
  }
  if (diff.inDays < 7) {
    return 'Updated ${diff.inDays} ${diff.inDays == 1 ? 'day' : 'days'} ago';
  }
  return 'Updated ${DateFormat('MMM d, y').format(parsed)}';
}

// Simple wrappers that reuse the full screens for deep links from Home.
// These allow the Home quick-access cards to open full screens.

class HomeMapView extends StatelessWidget {
  const HomeMapView({super.key});
  @override
  Widget build(BuildContext context) => const HazardMapScreen();
}

class HomeAlertsView extends StatefulWidget {
  const HomeAlertsView({super.key});

  @override
  State<HomeAlertsView> createState() => _HomeAlertsViewState();
}

class _HomeAlertsViewState extends State<HomeAlertsView> {
  // Opening Alerts clears the bell badge; marked again on leave so alerts
  // that arrived while it was open are not counted as unread.
  @override
  void initState() {
    super.initState();
    AlertsSeenStore.instance.markSeen();
  }

  @override
  void dispose() {
    AlertsSeenStore.instance.markSeen();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const AlertsScreen();
}

class HomeReportsView extends StatelessWidget {
  const HomeReportsView({super.key});
  @override
  Widget build(BuildContext context) => const CommunityReportsScreen();
}
