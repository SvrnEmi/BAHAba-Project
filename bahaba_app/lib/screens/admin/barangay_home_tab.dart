import 'package:flutter/material.dart';

import '../../models/alert_model.dart';
import '../../theme/app_theme.dart';
import '../../widgets/clay_container.dart';

/// A number on a tile: loading, failed, or known. A failed number only changes
/// its own line, so every tile can always be opened.
class TileValue<T> {
  final T? value;
  final bool loading;
  final bool failed;

  const TileValue(T this.value)
      : loading = false,
        failed = false;
  const TileValue.none()
      : value = null,
        loading = false,
        failed = false;
  const TileValue.loading()
      : value = null,
        loading = true,
        failed = false;
  const TileValue.failed()
      : value = null,
        loading = false,
        failed = true;
}

enum BarangayTile {
  createAlert,
  reports,
  fieldObservations,
  myAlerts,
  overview,
  settings,
}

/// Rows from active_alerts. An all clear is not a danger, and an end time can
/// pass between reads.
int countActiveAlerts(List<Alert> rows, DateTime now) =>
    rows.where((a) => !a.isAllClear && !a.hasEnded(now)).length;

DateTime _manila(DateTime time) =>
    time.toUtc().add(const Duration(hours: 8));

/// Alerts this barangay sent today (Manila calendar). A withdrawn alert was
/// still published.
int countPublishedToday(List<Alert> alerts, String barangay, DateTime now) {
  final today = _manila(now);
  return alerts.where((a) {
    final sent = DateTime.tryParse(a.sentAt);
    if (sent == null) return false;
    final day = _manila(sent);
    return a.source == 'barangay' &&
        a.targetBarangay == barangay &&
        (a.status == AlertStatus.approved ||
            a.status == AlertStatus.withdrawn) &&
        day.year == today.year &&
        day.month == today.month &&
        day.day == today.day;
  }).length;
}

/// "just now", "20 min ago", "3 hr ago", "2 days ago".
String shortAgo(DateTime time, DateTime now) {
  final diff = now.difference(time);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
  if (diff.inHours < 24) return '${diff.inHours} hr ago';
  return '${diff.inDays} ${diff.inDays == 1 ? 'day' : 'days'} ago';
}

/// The barangay Home tab: one tile per section. The tabs stay as they are.
class BarangayHomeTab extends StatelessWidget {
  final String barangay;
  final DateTime now;
  final TileValue<int> activeAlerts;
  final TileValue<int> pendingReports;
  final TileValue<DateTime> latestObservation;
  final TileValue<int> publishedToday;
  final TileValue<String> risk;
  final String riskLabel;
  final Color riskColor;
  final void Function(BarangayTile tile) onOpen;
  final Future<void> Function() onRefresh;

  const BarangayHomeTab({
    super.key,
    required this.barangay,
    required this.now,
    required this.activeAlerts,
    required this.pendingReports,
    required this.latestObservation,
    required this.publishedToday,
    required this.risk,
    required this.riskLabel,
    required this.riskColor,
    required this.onOpen,
    required this.onRefresh,
  });

  /// Below this width the grid has 2 columns.
  static const wideLayout = 840.0;

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.textScalerOf(context).scale(184);
    final observation = latestObservation.value;
    final pending = pendingReports.value;
    final tiles = [
      _Tile(
        icon: Icons.campaign_outlined,
        label: 'Create Alert',
        prefix: 'Publish an alert for $barangay',
        state: activeAlerts,
        line: '${activeAlerts.value} active now',
        onTap: () => onOpen(BarangayTile.createAlert),
      ),
      _Tile(
        icon: Icons.place_outlined,
        label: 'Reports',
        badge: pending ?? 0,
        state: pendingReports,
        line: '$pending waiting for the MDRRMO',
        onTap: () => onOpen(BarangayTile.reports),
      ),
      _Tile(
        icon: Icons.visibility_outlined,
        label: 'Field Observations',
        state: latestObservation,
        line: observation == null
            ? 'None yet'
            : 'Last update ${shortAgo(observation, now)}',
        onTap: () => onOpen(BarangayTile.fieldObservations),
      ),
      _Tile(
        icon: Icons.history,
        label: 'My Alerts',
        state: publishedToday,
        line: '${publishedToday.value} published today',
        onTap: () => onOpen(BarangayTile.myAlerts),
      ),
      _Tile(
        icon: Icons.insights_outlined,
        label: 'Overview',
        state: risk,
        line: riskLabel,
        dot: riskColor,
        onTap: () => onOpen(BarangayTile.overview),
      ),
      _Tile(
        icon: Icons.settings_outlined,
        label: 'Settings',
        line: 'Account and notifications',
        onTap: () => onOpen(BarangayTile.settings),
      ),
    ];

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: LayoutBuilder(
        builder: (context, constraints) => GridView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: constraints.maxWidth >= wideLayout ? 3 : 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            mainAxisExtent: height,
          ),
          children: tiles,
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String prefix;
  final TileValue<Object>? state;
  final String line;
  final int badge;
  final Color? dot;
  final VoidCallback onTap;

  const _Tile({
    required this.icon,
    required this.label,
    required this.line,
    required this.onTap,
    this.prefix = '',
    this.state,
    this.badge = 0,
    this.dot,
  });

  bool get _loading => state?.loading ?? false;
  bool get _failed => state?.failed ?? false;

  String get _spoken {
    final value = _loading
        ? 'Loading'
        : _failed
            ? 'Not available'
            : line;
    return [label, if (prefix.isNotEmpty) prefix, value].join('. ');
  }

  @override
  Widget build(BuildContext context) {
    const lineStyle = TextStyle(fontSize: 12, color: AppColors.textSecondary);
    return ClayContainer(
      borderRadius: 22,
      padding: const EdgeInsets.all(14),
      semanticLabel: _spoken,
      onTap: onTap,
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Icon(icon, size: 24, color: AppColors.primaryShade),
                if (badge > 0)
                  Badge(
                    label: Text('$badge'),
                    backgroundColor: AppColors.riskHigh,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: AppText.heading(size: 14),
            ),
            const SizedBox(height: 4),
            if (prefix.isNotEmpty)
              Text(
                prefix,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: lineStyle,
              ),
            if (_loading)
              const _Skeleton()
            else if (_failed)
              const Text('—', style: lineStyle)
            else
              Row(
                children: [
                  if (dot != null) ...[
                    Container(
                      width: 10,
                      height: 10,
                      decoration:
                          BoxDecoration(color: dot, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 6),
                  ],
                  Expanded(
                    child: Text(
                      line,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: lineStyle,
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey('tile-skeleton'),
      margin: const EdgeInsets.only(top: 3),
      width: 80,
      height: 12,
      decoration: BoxDecoration(
        color: AppColors.border,
        borderRadius: BorderRadius.circular(6),
      ),
    );
  }
}
