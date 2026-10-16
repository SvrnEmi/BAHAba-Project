import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/alert_model.dart';
import '../../models/community_report_model.dart';
import '../../models/user_model.dart';
import '../../providers/admin_providers.dart';
import '../../providers/app_state.dart';
import '../../repositories/report_repository.dart';
import '../../theme/app_theme.dart';
import '../../widgets/clay_button.dart';
import '../../widgets/clay_container.dart';
import '../../widgets/profile_avatar_button.dart';
import '../../widgets/flat_status_card.dart';
import '../../widgets/report_status_badge.dart';
import '../../widgets/risk_badge.dart';
import '../../widgets/brand_logo.dart';

Color _alertLevelColor(AlertLevel level) {
  switch (level) {
    case AlertLevel.advisory:
      return AppColors.secondary;
    case AlertLevel.warning:
      return AppColors.riskMedium;
    case AlertLevel.critical:
      return AppColors.riskHigh;
  }
}

/// MDRRMO Admin Dashboard — system oversight, analytics, alert broadcast,
/// barangay alert verification, report verification, and audit trail.
class MDRRMOAdminDashboardScreen extends StatefulWidget {
  const MDRRMOAdminDashboardScreen({super.key});

  @override
  State<MDRRMOAdminDashboardScreen> createState() =>
      _MDRRMOAdminDashboardScreenState();
}

class _MDRRMOAdminDashboardScreenState extends State<MDRRMOAdminDashboardScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  bool _hasShownPendingSummary = false;
  bool _hasSeededObservedPendingIds = false;
  final Set<int> _seenReportIds = <int>{};
  final Set<int> _seenAlertIds = <int>{};

  // Alert form state
  AlertLevel _alertLevel = AlertLevel.warning;
  String _targetBarangay = 'All Barangays';
  final _messageController = TextEditingController();
  final Map<AlertChannel, bool> _channels = {
    AlertChannel.push: true,
    AlertChannel.sms: false,
    AlertChannel.facebook: true,
    AlertChannel.twitter: false,
  };

  // Held so dispose() can stop their live subscriptions without a context.
  late final AdminAlertProvider _alertProvider;
  late final AdminReportProvider _reportProvider;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this);
    _alertProvider = context.read<AdminAlertProvider>();
    _reportProvider = context.read<AdminReportProvider>();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _alertProvider.load();
      _reportProvider.load();
      context.read<AuditProvider>().load();
    });
  }

  void _showPendingSummaryIfNeeded({
    required int pendingReportsCount,
    required int pendingAlertsCount,
  }) {
    if (_hasShownPendingSummary ||
        (pendingReportsCount == 0 && pendingAlertsCount == 0)) {
      return;
    }

    _hasShownPendingSummary = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Pending review'),
          content: Text(
            'You have $pendingReportsCount pending report(s) and $pendingAlertsCount pending alert(s) awaiting review.',
          ),
          actions: [
            if (pendingReportsCount > 0)
              TextButton(
                onPressed: () {
                  _tabController.animateTo(4);
                  Navigator.of(dialogContext).pop();
                },
                child: const Text('Review Reports'),
              ),
            if (pendingAlertsCount > 0)
              TextButton(
                onPressed: () {
                  _tabController.animateTo(1);
                  Navigator.of(dialogContext).pop();
                },
                child: const Text('Review Alerts'),
              ),
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Dismiss'),
            ),
          ],
        ),
      );
    });
  }

  void _registerInitialSeenIds(
    List<CommunityReport> reports,
    List<Alert> alerts,
  ) {
    if (_hasSeededObservedPendingIds) return;

    for (final report in reports) {
      if (report.id != null) {
        _seenReportIds.add(report.id!);
      }
    }

    for (final alert in alerts) {
      if (alert.id != null) {
        _seenAlertIds.add(alert.id!);
      }
    }

    _hasSeededObservedPendingIds = true;
  }

  void _notifyForNewPendingReports(List<CommunityReport> reports) {
    final newlyPendingReports = reports
        .where((report) =>
            report.status == ReportStatus.pending &&
            report.id != null &&
            !_seenReportIds.contains(report.id!))
        .toList();

    for (final report in newlyPendingReports) {
      if (report.id == null) continue;
      _seenReportIds.add(report.id!);

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'New flood report submitted by ${report.userName} — awaiting review.',
            ),
            action: SnackBarAction(
              label: 'Review',
              onPressed: () => _tabController.animateTo(4),
            ),
            duration: const Duration(seconds: 8),
          ),
        );
      });
    }
  }

  void _notifyForNewPendingAlerts(List<Alert> alerts) {
    final newlyPendingAlerts = alerts
        .where((alert) =>
            alert.status == AlertStatus.pending &&
            alert.id != null &&
            !_seenAlertIds.contains(alert.id!))
        .toList();

    for (final alert in newlyPendingAlerts) {
      if (alert.id == null) continue;
      _seenAlertIds.add(alert.id!);

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'New alert submitted by Barangay ${alert.targetBarangay} — awaiting review.',
            ),
            action: SnackBarAction(
              label: 'Review',
              onPressed: () => _tabController.animateTo(1),
            ),
            duration: const Duration(seconds: 8),
          ),
        );
      });
    }
  }

  @override
  void dispose() {
    _alertProvider.stop();
    _reportProvider.stop();
    _tabController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _sendAlert() async {
    if (_messageController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter an alert message.'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }
    final selectedChannels =
        _channels.entries.where((e) => e.value).map((e) => e.key).toList();
    if (selectedChannels.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Select at least one channel.'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    final appState = context.read<AppState>();
    await context.read<AdminAlertProvider>().createAlert(
          level: _alertLevel,
          title: '${_alertLevel.label} - $_targetBarangay',
          message: _messageController.text.trim(),
          targetBarangay: _targetBarangay,
          channels: selectedChannels,
          createdBy: appState.currentUser?.fullName ?? 'Admin',
        );

    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Alert broadcast successfully!'),
        backgroundColor: AppColors.success,
      ),
    );
    _messageController.clear();
    setState(() {
      _channels.updateAll((_, __) => false);
      _channels[AlertChannel.push] = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final alertProvider = context.watch<AdminAlertProvider>();
    final reportProvider = context.watch<AdminReportProvider>();

    final pendingAlerts = alertProvider.pendingAlerts.length;
    final pendingReports = reportProvider.pendingCount;

    if (!alertProvider.loading &&
        !reportProvider.loading &&
        !_hasSeededObservedPendingIds) {
      _registerInitialSeenIds(reportProvider.reports, alertProvider.alerts);
    }

    if (!alertProvider.loading && !reportProvider.loading) {
      _notifyForNewPendingReports(reportProvider.reports);
      _notifyForNewPendingAlerts(alertProvider.alerts);
      _showPendingSummaryIfNeeded(
        pendingReportsCount: pendingReports,
        pendingAlertsCount: pendingAlerts,
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: BrandAppBarTitle(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('MDRRMO Admin', style: AppText.heading(size: 18)),
              const Text(
                'Municipal Disaster Risk Reduction & Management Office',
                style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
              ),
            ],
          ),
        ),
        actions: [
          // Profile (logout lives there now).
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: ProfileAvatarButton(
              name: context.watch<AppState>().currentUser?.fullName,
              size: 40,
            ),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          indicatorPadding: const EdgeInsets.symmetric(vertical: 6),
          tabs: const [
            Tab(text: 'Overview'),
            Tab(text: 'Verify Alerts'),
            Tab(text: 'Analytics'),
            Tab(text: 'Broadcast'),
            Tab(text: 'Verify Reports'),
            Tab(text: 'Audit Trail'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _OverviewTab(
            pendingAlerts: pendingAlerts,
            pendingReports: pendingReports,
            onVerifyAlerts: () => _tabController.animateTo(1),
            onVerifyReports: () => _tabController.animateTo(4),
            onBroadcast: () => _tabController.animateTo(3),
          ),
          _VerifyAlertsTab(),
          const _AnalyticsTab(),
          _BroadcastTab(
            level: _alertLevel,
            onLevelChanged: (l) => setState(() => _alertLevel = l),
            targetBarangay: _targetBarangay,
            onTargetChanged: (v) => setState(() => _targetBarangay = v),
            messageController: _messageController,
            channels: _channels,
            onChannelChanged: (channel, value) =>
                setState(() => _channels[channel] = value),
            onSend: _sendAlert,
          ),
          const _VerifyReportsTab(),
          const _AuditTrailTab(),
        ],
      ),
    );
  }
}

// ---------------- Overview Tab ----------------

class _OverviewTab extends StatelessWidget {
  final int pendingAlerts;
  final int pendingReports;
  final VoidCallback onVerifyAlerts;
  final VoidCallback onVerifyReports;
  final VoidCallback onBroadcast;

  const _OverviewTab({
    required this.pendingAlerts,
    required this.pendingReports,
    required this.onVerifyAlerts,
    required this.onVerifyReports,
    required this.onBroadcast,
  });

  @override
  Widget build(BuildContext context) {
    final alertProvider = context.watch<AdminAlertProvider>();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Stats grid
        Row(
          children: [
            const Expanded(
              child: _StatTile(
                icon: Icons.people_outline,
                color: AppColors.mint,
                label: 'Active Users',
                value: '1,234',
                change: '+12.5%',
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: _StatTile(
                icon: Icons.notifications,
                color: AppColors.peach,
                label: 'Alerts Sent (24h)',
                value: '${alertProvider.alerts.length}',
                change: '+15',
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _StatTile(
                icon: Icons.report,
                color: AppColors.lavender,
                label: 'Pending Reports',
                value: '$pendingReports',
                change: '-8',
              ),
            ),
            const SizedBox(width: 16),
            const Expanded(
              child: _StatTile(
                icon: Icons.monitor_heart,
                color: AppColors.mint,
                label: 'System Uptime',
                value: '99.9%',
                change: 'Excellent',
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),

        // Pending alerts banner: flat, strong left border, bold text.
        if (pendingAlerts > 0)
          FlatStatusCard(
            accent: AppColors.warning,
            margin: const EdgeInsets.only(bottom: 20),
            padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
            child: Row(
              children: [
                const Icon(Icons.notifications_active, color: AppColors.ink),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    '$pendingAlerts pending barangay alerts awaiting your verification',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: onVerifyAlerts,
                  child: const Text('Review →'),
                ),
              ],
            ),
          ),

        // Recent activity + quick actions
        _SectionCard(
          title: 'Quick Actions',
          child: Column(
            children: [
              _QuickActionTile(
                icon: Icons.verified_outlined,
                color: AppColors.peach,
                title: 'Verify Barangay Alerts',
                subtitle: '$pendingAlerts pending verifications',
                onTap: onVerifyAlerts,
              ),
              _QuickActionTile(
                icon: Icons.report_outlined,
                color: AppColors.lavender,
                title: 'Verify Community Reports',
                subtitle: '$pendingReports pending reports',
                onTap: onVerifyReports,
              ),
              _QuickActionTile(
                icon: Icons.send_outlined,
                color: AppColors.mint,
                title: 'Create System Alert',
                subtitle: 'Send alert to all barangays',
                onTap: onBroadcast,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ---------------- Verify Alerts Tab ----------------

class _VerifyAlertsTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AdminAlertProvider>();
    final appState = context.read<AppState>();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const FlatPanel(
          padding: EdgeInsets.all(14),
          child: Text(
            'MDRRMO Responsibility: Review and verify alerts created by Barangay Officials before broadcasting to residents.',
            style: TextStyle(color: AppColors.ink, fontSize: 13),
          ),
        ),
        const SizedBox(height: 16),
        if (provider.loading)
          const Center(child: Text('Checking pending alerts...'))
        else if (provider.pendingAlerts.isEmpty)
          const Padding(
            padding: EdgeInsets.all(32),
            child: Center(
              child: Text(
                'No pending alerts to verify.',
                style: TextStyle(color: AppColors.textSecondary),
              ),
            ),
          )
        else
          for (final alert in provider.pendingAlerts)
            // Alert items: flat card, strong left border in the level color.
            FlatStatusCard(
              accent: _alertLevelColor(alert.level),
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      AlertLevelBadge(level: alert.level),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.background,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          alert.targetBarangay,
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    alert.title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    alert.message,
                    style: const TextStyle(fontSize: 13, height: 1.4),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Created by: ${alert.createdBy} • ${alert.sentAt}',
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            minimumSize: const Size.fromHeight(48),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            backgroundBuilder:
                                ClayButtonSurface.filled(AppColors.riskLowFill),
                          ),
                          onPressed: () async {
                            await provider.approve(
                              alert.id!,
                              appState.currentUser?.fullName ?? 'Admin',
                            );
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text(
                                    'Alert approved and broadcast!',
                                  ),
                                  backgroundColor: AppColors.success,
                                ),
                              );
                            }
                          },
                          icon: const Icon(Icons.check_circle, size: 18),
                          label: const Text('Approve & Broadcast'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.danger,
                            minimumSize: const Size.fromHeight(48),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            backgroundBuilder: ClayButtonSurface.secondary(
                              borderColor: AppColors.danger,
                            ),
                          ),
                          onPressed: () async {
                            final reason = await _askRejectReason(context);
                            if (reason == null || reason.isEmpty) return;
                            await provider.reject(
                              alert.id!,
                              reason,
                              appState.currentUser?.fullName ?? 'Admin',
                            );
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Alert rejected.'),
                                  backgroundColor: AppColors.warning,
                                ),
                              );
                            }
                          },
                          icon: const Icon(Icons.cancel, size: 18),
                          label: const Text('Reject'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
      ],
    );
  }

  Future<String?> _askRejectReason(BuildContext context) {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rejection Reason'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Enter reason for rejection...',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
  }
}

// ---------------- Analytics Tab ----------------

class _AnalyticsTab extends StatelessWidget {
  const _AnalyticsTab();

  @override
  Widget build(BuildContext context) {
    final reportProvider = context.watch<AdminReportProvider>();

    final lineData = <FlSpot>[
      const FlSpot(0, 12),
      const FlSpot(1, 18),
      const FlSpot(2, 25),
      const FlSpot(3, 32),
      const FlSpot(4, 28),
    ];

    final pieData = <({String label, double value, Color color})>[
      (label: 'Advisory', value: 45.0, color: AppColors.info),
      (label: 'Warning', value: 67.0, color: AppColors.warning),
      (label: 'Critical', value: 23.0, color: AppColors.danger),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'System Analytics & Performance Metrics',
          style: AppText.heading(size: 18),
        ),
        const SizedBox(height: 16),

        // Report trends line chart
        _SectionCard(
          title: 'Report Submission Trends (Last 5 Days)',
          child: SizedBox(
            height: 220,
            child: LineChart(
              LineChartData(
                gridData: const FlGridData(show: true),
                titlesData: FlTitlesData(
                  leftTitles: const AxisTitles(
                    sideTitles: SideTitles(showTitles: true, reservedSize: 34),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      interval: 1,
                      getTitlesWidget: (v, _) => Text(
                        '${v.toInt() + 1}',
                        style: const TextStyle(fontSize: 10),
                      ),
                    ),
                  ),
                ),
                borderData: FlBorderData(show: false),
                lineBarsData: [
                  LineChartBarData(
                    spots: lineData,
                    isCurved: true,
                    color: AppColors.primaryBlue,
                    barWidth: 3,
                    dotData: const FlDotData(show: true),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),

        // Alert distribution pie chart + report status
        Row(
          children: [
            Expanded(
              child: _SectionCard(
                title: 'Alert Level Distribution',
                child: SizedBox(
                  height: 180,
                  child: PieChart(
                    PieChartData(
                      sectionsSpace: 2,
                      centerSpaceRadius: 32,
                      sections: pieData
                          .map((d) => PieChartSectionData(
                                value: d.value,
                                color: AppColors.badgeFill(d.color),
                                title: d.label,
                                radius: 42,
                                titleStyle: TextStyle(
                                  fontSize: 10,
                                  color: AppColors.onBadge(d.color),
                                  fontWeight: FontWeight.bold,
                                ),
                              ))
                          .toList(),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _SectionCard(
                title: 'Report Status',
                child: Column(
                  children: [
                    _StatusRow(
                      label: 'Pending',
                      count: reportProvider.pendingCount,
                      color: AppColors.warning,
                    ),
                    const SizedBox(height: 8),
                    _StatusRow(
                      label: 'Approved',
                      count: reportProvider.verifiedCount,
                      color: AppColors.success,
                    ),
                    const SizedBox(height: 8),
                    _StatusRow(
                      label: 'Rejected',
                      count: reportProvider.rejectedCount,
                      color: AppColors.danger,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Key metrics
        const Row(
          children: [
            Expanded(
              child: _MetricTile(
                label: 'Avg Response Time',
                value: '8.5 min',
                color: AppColors.info,
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: _MetricTile(
                label: 'Comm. Reach',
                value: '4,567',
                color: AppColors.success,
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: _MetricTile(
                label: 'Report Accuracy',
                value: '92%',
                color: AppColors.primary,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ---------------- Broadcast Tab ----------------

class _BroadcastTab extends StatelessWidget {
  final AlertLevel level;
  final ValueChanged<AlertLevel> onLevelChanged;
  final String targetBarangay;
  final ValueChanged<String> onTargetChanged;
  final TextEditingController messageController;
  final Map<AlertChannel, bool> channels;
  final void Function(AlertChannel, bool) onChannelChanged;
  final VoidCallback onSend;

  const _BroadcastTab({
    required this.level,
    required this.onLevelChanged,
    required this.targetBarangay,
    required this.onTargetChanged,
    required this.messageController,
    required this.channels,
    required this.onChannelChanged,
    required this.onSend,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Create Standardized Alert',
          style: AppText.heading(size: 18),
        ),
        const SizedBox(height: 16),

        // Level selection
        const Text('Alert Level (ISO Standard) *',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        const SizedBox(height: 8),
        for (final lvl in AlertLevel.values)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _LevelOption(
              level: lvl,
              selected: level == lvl,
              onTap: () => onLevelChanged(lvl),
            ),
          ),
        const SizedBox(height: 12),

        // Target barangay
        const Text('Target Barangay *',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: targetBarangay,
          items: const [
            'All Barangays',
            'Tuburan',
            'Poctoy',
            'Gabawan',
            'Batiano',
            'Panique',
            'Libertad',
            'Canjalon',
            'Liwayway',
            'Pit-os',
          ].map((b) => DropdownMenuItem(value: b, child: Text(b))).toList(),
          onChanged: (v) => onTargetChanged(v ?? 'All Barangays'),
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.location_on_outlined),
          ),
        ),
        const SizedBox(height: 16),

        // Channels
        const Text('Communication Channels *',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        const SizedBox(height: 8),
        for (final entry in channels.entries)
          CheckboxListTile(
            value: entry.value,
            onChanged: (v) => onChannelChanged(entry.key, v ?? false),
            title: Row(
              children: [
                Icon(
                  _channelIcon(entry.key),
                  color: _channelColor(entry.key),
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  entry.key.label,
                  style: const TextStyle(fontSize: 14),
                ),
              ],
            ),
            dense: true,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
          ),
        const SizedBox(height: 8),

        // Message
        const Text('Alert Message *',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        const SizedBox(height: 8),
        TextField(
          controller: messageController,
          maxLines: 4,
          decoration: const InputDecoration(
            hintText: 'Enter detailed alert message for residents...',
          ),
        ),
        const SizedBox(height: 16),

        ElevatedButton.icon(
          onPressed: onSend,
          icon: const Icon(Icons.send),
          label: const Text('Broadcast Alert Now'),
        ),
      ],
    );
  }

  IconData _channelIcon(AlertChannel channel) {
    switch (channel) {
      case AlertChannel.push:
        return Icons.smartphone;
      case AlertChannel.sms:
        return Icons.sms_outlined;
      case AlertChannel.facebook:
        return Icons.facebook;
      case AlertChannel.twitter:
        return Icons.alternate_email;
    }
  }

  Color _channelColor(AlertChannel channel) {
    switch (channel) {
      case AlertChannel.push:
        return AppColors.info;
      case AlertChannel.sms:
        return AppColors.success;
      case AlertChannel.facebook:
        return const Color(0xFF1877F2);
      case AlertChannel.twitter:
        return const Color(0xFF0EA5E9);
    }
  }
}

// ---------------- Verify Reports Tab ----------------

class _VerifyReportsTab extends StatefulWidget {
  const _VerifyReportsTab();

  @override
  State<_VerifyReportsTab> createState() => _VerifyReportsTabState();
}

class _VerifyReportsTabState extends State<_VerifyReportsTab> {
  final Map<int, TextEditingController> _replyControllers = {};
  final Set<int> _editingReply = {};
  final ReportRepository _reportRepo = ReportRepository();

  TextEditingController _getReplyController(int reportId,
      {String? initialText}) {
    final controller = _replyControllers.putIfAbsent(
      reportId,
      () => TextEditingController(text: initialText ?? ''),
    );
    if (initialText != null && controller.text != initialText) {
      controller.text = initialText;
      controller.selection = TextSelection.fromPosition(
          TextPosition(offset: controller.text.length));
    }
    return controller;
  }

  Future<void> _sendReply(int reportId, {String? currentReply}) async {
    final controller =
        _getReplyController(reportId, initialText: currentReply ?? '');
    final text = controller.text.trim();

    if (text.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Reply cannot be empty.'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    try {
      await _reportRepo.sendReportReply(reportId, text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Reply sent successfully.'),
          backgroundColor: AppColors.success,
        ),
      );
      setState(() {
        _editingReply.remove(reportId);
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Unable to send reply: $e'),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  @override
  void dispose() {
    for (final controller in _replyControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AdminReportProvider>();
    final appState = context.read<AppState>();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Community Reports Management',
                style: AppText.heading(size: 18),
              ),
            ),
            TextButton.icon(
              onPressed: () async {
                await provider.load();
              },
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Refresh'),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (provider.loading)
          const Center(child: Text('Checking community reports...'))
        else if (provider.reports.isEmpty)
          const Padding(
            padding: EdgeInsets.all(32),
            child: Center(
              child: Text(
                'No community reports.',
                style: TextStyle(color: AppColors.textSecondary),
              ),
            ),
          )
        else
          for (final report in provider.reports)
            FlatPanel(
              margin: const EdgeInsets.only(bottom: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 16,
                        backgroundColor: AppColors.lavender,
                        child: Text(
                          report.userName.isNotEmpty ? report.userName[0] : 'R',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: AppColors.ink,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              report.userName,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              '${report.location} • ${report.timestamp}',
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      ReportStatusBadge(status: report.status.value),
                      if (appState.currentUser?.role == UserRole.mdrrmo) ...[
                        const SizedBox(width: 8),
                        IconButton(
                          onPressed: () async {
                            try {
                              final appState = context.read<AppState>();
                              final confirmed = await showDialog<bool>(
                                context: context,
                                builder: (ctx) => AlertDialog(
                                  title: const Text('Delete report?'),
                                  content: const Text(
                                    'This will permanently remove this report. This cannot be undone.',
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () =>
                                          Navigator.pop(ctx, false),
                                      child: const Text('Cancel'),
                                    ),
                                    TextButton(
                                      onPressed: () => Navigator.pop(ctx, true),
                                      child: const Text(
                                        'Delete',
                                        style:
                                            TextStyle(color: AppColors.danger),
                                      ),
                                    ),
                                  ],
                                ),
                              );

                              if (confirmed != true || report.id == null) {
                                return;
                              }
                              await provider.delete(
                                report.id!,
                                appState.currentUser?.fullName ?? 'Admin',
                              );
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Report deleted.'),
                                    backgroundColor: AppColors.danger,
                                  ),
                                );
                              }
                            } catch (e) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content:
                                        Text('Delete failed: ${e.toString()}'),
                                    backgroundColor: AppColors.danger,
                                  ),
                                );
                              }
                            }
                          },
                          icon: const Icon(Icons.delete_outline,
                              color: AppColors.danger),
                          tooltip: 'Delete report',
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    report.description,
                    style: const TextStyle(fontSize: 13, height: 1.4),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Water level: ${report.waterLevel.label}',
                    style: const TextStyle(fontSize: 12),
                  ),
                  if (report.status == ReportStatus.rejected &&
                      report.rejectionReason != null)
                    Container(
                      margin: const EdgeInsets.only(top: 8),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.danger.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'Rejected: ${report.rejectionReason}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.danger,
                        ),
                      ),
                    ),
                  if (report.status == ReportStatus.approved) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.background,
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Reply to Reporter',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.4,
                            ),
                          ),
                          const SizedBox(height: 8),
                          if ((report.adminReply ?? '').trim().isNotEmpty &&
                              !_editingReply.contains(report.id)) ...[
                            Text(
                              report.adminReply ?? '',
                              style: const TextStyle(fontSize: 13, height: 1.4),
                            ),
                            if (report.adminReplyAt != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text(
                                  'Sent ${_formatReplyTimestamp(report.adminReplyAt!)}',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ),
                            const SizedBox(height: 8),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: TextButton(
                                onPressed: () {
                                  final controller = _getReplyController(
                                    report.id!,
                                    initialText: report.adminReply ?? '',
                                  );
                                  setState(() {
                                    _editingReply.add(report.id!);
                                    controller.text = report.adminReply ?? '';
                                  });
                                },
                                child: const Text('Edit Reply'),
                              ),
                            ),
                          ] else ...[
                            TextField(
                              controller: _getReplyController(
                                report.id!,
                                initialText: report.adminReply ?? '',
                              ),
                              minLines: 2,
                              maxLines: 4,
                              decoration: InputDecoration(
                                hintText:
                                    (report.adminReply ?? '').trim().isEmpty
                                        ? 'Write a reply to the reporter'
                                        : 'Update the reply to the reporter',
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 10,
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: ElevatedButton(
                                    onPressed: () async {
                                      await _sendReply(report.id!,
                                          currentReply: report.adminReply);
                                    },
                                    style: ElevatedButton.styleFrom(
                                      minimumSize: const Size.fromHeight(48),
                                    ),
                                    child: Text(
                                      (report.adminReply ?? '').trim().isEmpty
                                          ? 'Send Reply'
                                          : 'Update Reply',
                                    ),
                                  ),
                                ),
                                if (_editingReply.contains(report.id)) ...[
                                  const SizedBox(width: 8),
                                  TextButton(
                                    onPressed: () {
                                      setState(() {
                                        _editingReply.remove(report.id!);
                                      });
                                    },
                                    child: const Text('Cancel'),
                                  ),
                                ],
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                  if (report.status == ReportStatus.pending) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              minimumSize: const Size.fromHeight(48),
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 12),
                              backgroundBuilder: ClayButtonSurface.filled(
                                  AppColors.riskLowFill),
                            ),
                            onPressed: () async {
                              try {
                                await provider.approve(
                                  report.id!,
                                  appState.currentUser?.fullName ?? 'Admin',
                                );
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Report approved!'),
                                      backgroundColor: AppColors.success,
                                    ),
                                  );
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(
                                          'Approval failed: ${e.toString()}'),
                                      backgroundColor: AppColors.danger,
                                    ),
                                  );
                                }
                              }
                            },
                            icon: const Icon(Icons.check_circle, size: 16),
                            label: const Text('Approve'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.danger,
                              minimumSize: const Size.fromHeight(48),
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 12),
                              backgroundBuilder: ClayButtonSurface.secondary(
                                borderColor: AppColors.danger,
                              ),
                            ),
                            onPressed: () async {
                              try {
                                final reason = await _askRejectReason(context);
                                if (reason == null || reason.isEmpty) return;
                                await provider.reject(
                                  report.id!,
                                  reason,
                                  appState.currentUser?.fullName ?? 'Admin',
                                );
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Report rejected.'),
                                      backgroundColor: AppColors.warning,
                                    ),
                                  );
                                }
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text(
                                          'Rejection failed: ${e.toString()}'),
                                      backgroundColor: AppColors.danger,
                                    ),
                                  );
                                }
                              }
                            },
                            icon: const Icon(Icons.cancel, size: 16),
                            label: const Text('Reject'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
      ],
    );
  }

  static String _formatReplyTimestamp(String value) {
    final parsed = DateTime.tryParse(value);
    if (parsed == null) return value;
    return parsed.toLocal().toString().replaceFirst('.000', '');
  }

  Future<String?> _askRejectReason(BuildContext context) {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rejection Reason'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Enter reason for rejection...',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
  }
}

// ---------------- Audit Trail Tab ----------------

class _AuditTrailTab extends StatelessWidget {
  const _AuditTrailTab();

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AuditProvider>();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'System Audit Trail & Message Traceability',
          style: AppText.heading(size: 18),
        ),
        const SizedBox(height: 12),
        const FlatPanel(
          padding: EdgeInsets.all(14),
          child: Text(
            'Purpose: Complete audit trail of all system actions for accountability, traceability, and compliance. All administrative actions are logged with timestamp, user, and details.',
            style: TextStyle(fontSize: 13, height: 1.4),
          ),
        ),
        const SizedBox(height: 16),
        if (provider.loading)
          const Center(child: Text('Loading audit trail...'))
        else
          for (final log in provider.logs)
            // Audit logs can be long: flat rows, no shadows.
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    _iconFor(log.action),
                    size: 20,
                    color: _colorFor(log.action),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.background,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                log.action,
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontFamily: 'monospace',
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              log.timestamp,
                              style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          log.details,
                          style: const TextStyle(fontSize: 13),
                        ),
                        Text(
                          'User: ${log.user}',
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
      ],
    );
  }

  IconData _iconFor(String action) {
    if (action.contains('ALERT')) return Icons.notifications;
    if (action.contains('REPORT')) return Icons.report;
    if (action.contains('LOGIN')) return Icons.login;
    return Icons.history;
  }

  Color _colorFor(String action) {
    if (action.contains('ALERT')) return AppColors.warning;
    if (action.contains('REPORT')) return AppColors.info;
    if (action.contains('LOGIN')) return AppColors.success;
    return AppColors.textSecondary;
  }
}

/// ---------------- Shared widgets ----------------

class _StatTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final String value;
  final String change;

  const _StatTile({
    required this.icon,
    required this.color,
    required this.label,
    required this.value,
    required this.change,
  });

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ClayIconChip(icon: icon, color: color, size: 40, iconSize: 20),
              const Spacer(),
              Text(
                change,
                style: TextStyle(
                  // riskLowFill: plain riskLow is under 4.5:1 on surface.
                  color: change.startsWith('-')
                      ? AppColors.danger
                      : AppColors.riskLowFill,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            value,
            style: AppText.heading(size: 24),
          ),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return FlatPanel(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: AppText.heading(size: 15),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _QuickActionTile({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      onTap: onTap,
      semanticLabel: title,
      borderRadius: 20,
      color: AppColors.background,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          ClayIconChip(icon: icon, color: color, size: 40, iconSize: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppText.heading(size: 14, weight: FontWeight.w700),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AppColors.textSecondary),
        ],
      ),
    );
  }
}

/// Alert level picker row. Alert levels stay flat: white card, solid level
/// badge, level-colored border that thickens when selected.
class _LevelOption extends StatelessWidget {
  final AlertLevel level;
  final bool selected;
  final VoidCallback onTap;

  const _LevelOption({
    required this.level,
    required this.selected,
    required this.onTap,
  });

  Color get _color {
    switch (level) {
      case AlertLevel.advisory:
        return AppColors.info;
      case AlertLevel.warning:
        return AppColors.warning;
      case AlertLevel.critical:
        return AppColors.danger;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      selected: selected,
      child: Material(
        color: AppColors.flat,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: selected ? _color : AppColors.border,
            width: selected ? 2.5 : 1,
          ),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                AlertLevelBadge(level: level),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    level.description,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                if (selected)
                  const Icon(Icons.check_circle,
                      color: AppColors.ink, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  final String label;
  final int count;
  final Color color;

  const _StatusRow({
    required this.label,
    required this.count,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Text(
          '$label ($count)',
          style: const TextStyle(fontSize: 13),
        ),
      ],
    );
  }
}

class _MetricTile extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _MetricTile({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      borderRadius: 20,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Color as a decorative accent bar; the value stays in ink for AA.
          Container(
            width: 24,
            height: 5,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: AppText.heading(size: 18),
          ),
        ],
      ),
    );
  }
}
