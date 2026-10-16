import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../models/alert_model.dart';
import '../../models/community_report_model.dart';
import '../../providers/app_state.dart';
import '../../repositories/alert_repository.dart';
import '../../repositories/barangay_repository.dart';
import '../../repositories/report_repository.dart';
import '../../theme/app_theme.dart';
import '../../widgets/clay_container.dart';
import '../../widgets/profile_avatar_button.dart';
import '../../widgets/flat_status_card.dart';
import '../../widgets/report_status_badge.dart';
import '../../widgets/risk_badge.dart';
import '../../widgets/brand_logo.dart';

/// Barangay admin dashboard, mirroring the web BarangayAdminDashboard:
/// stats, water level controls, alert submission to MDRRMO, alert history
/// and community reports.
class BarangayAdminDashboardScreen extends StatefulWidget {
  const BarangayAdminDashboardScreen({super.key});

  @override
  State<BarangayAdminDashboardScreen> createState() =>
      _BarangayAdminDashboardScreenState();
}

final _sectionTitle = AppText.heading(size: 18);

class _BarangayAdminDashboardScreenState
    extends State<BarangayAdminDashboardScreen>
    with SingleTickerProviderStateMixin {
  final BarangayRepository _barangayRepository = BarangayRepository();
  final AlertRepository _alertRepository = AlertRepository();
  final ReportRepository _reportRepository = ReportRepository();
  late final TabController _tabController =
      TabController(length: 4, vsync: this);

  final _titleController = TextEditingController();
  final _messageController = TextEditingController();
  AlertLevel _newLevel = AlertLevel.advisory;
  int _formVersion = 0;
  bool _submitting = false;

  String? _barangayName;
  bool _isUpdating = false;
  bool _loading = true;
  String? _loadError;
  List<Alert> _alerts = [];
  List<CommunityReport> _reports = [];
  int _residentCount = 0;

  // One live subscription for the screen's lifetime. Creating streams in
  // build() opened a new Supabase Realtime subscription on every rebuild.
  StreamSubscription<Map<String, dynamic>?>? _barangaySub;
  Map<String, dynamic>? _barangayRow;
  bool _barangayError = false;

  @override
  void initState() {
    super.initState();
    _barangayName = context.read<AppState>().currentUser?.barangay;
    final name = _barangayName;
    if (name == null || name.isEmpty) {
      _loading = false;
      return;
    }
    _barangaySub = _barangayRepository.watchBarangay(name).listen(
      (row) {
        if (mounted) setState(() => _barangayRow = row);
      },
      onError: (Object error) {
        debugPrint('Barangay status stream failed: $error');
        if (mounted) setState(() => _barangayError = true);
      },
    );
    _loadData();
  }

  @override
  void dispose() {
    _barangaySub?.cancel();
    _tabController.dispose();
    _titleController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    final name = _barangayName;
    if (name == null || name.isEmpty) return;
    try {
      final results = await Future.wait([
        _alertRepository.fetchForBarangay(name),
        _reportRepository.getAll(),
        _barangayRepository.countResidents(name),
      ]);
      if (!mounted) return;
      setState(() {
        _alerts = results[0] as List<Alert>;
        _reports = results[1] as List<CommunityReport>;
        _residentCount = results[2] as int;
        _loadError = null;
      });
    } catch (error) {
      debugPrint('Barangay dashboard load failed: $error');
      if (mounted) {
        setState(() => _loadError =
            'Unable to load dashboard data. Pull down to try again.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _updateFloodRisk(String barangayName, String riskLevel) async {
    setState(() => _isUpdating = true);
    try {
      await _barangayRepository.updateFloodRisk(barangayName, riskLevel);
      _showSnack('Water level status updated');
    } catch (error) {
      _showSnack('Unable to update water level status: $error');
    } finally {
      if (mounted) setState(() => _isUpdating = false);
    }
  }

  Future<void> _submitAlert() async {
    final name = _barangayName;
    final title = _titleController.text.trim();
    final message = _messageController.text.trim();
    if (name == null || name.isEmpty) {
      _showSnack('Your profile has no assigned barangay.');
      return;
    }
    if (title.isEmpty || message.isEmpty) {
      _showSnack('Please fill in all fields');
      return;
    }

    setState(() => _submitting = true);
    try {
      final alert = await _alertRepository.submitForVerification(
        level: _newLevel,
        title: title,
        message: message,
        barangayName: name,
        recipients: _residentCount,
      );
      if (!mounted) return;
      setState(() {
        _alerts = [alert, ..._alerts];
        _newLevel = AlertLevel.advisory;
        _formVersion++;
      });
      _titleController.clear();
      _messageController.clear();
      _showSnack('Alert submitted to MDRRMO for verification!');
    } catch (error) {
      _showSnack('Unable to submit alert: $error');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showPreview() {
    final title = _titleController.text.trim();
    final message = _messageController.text.trim();
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: AppColors.danger),
        title: const Text('BAHAba Alert'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AlertLevelBadge(level: _newLevel),
            const SizedBox(height: 10),
            Text(
              title.isEmpty ? '(No title yet)' : title,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(message.isEmpty ? '(No message yet)' : message),
            const SizedBox(height: 12),
            const Text(
              'This is a preview of how your alert will appear to residents.',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final name = _barangayName;
    final hasBarangay = name != null && name.isNotEmpty;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: BrandAppBarTitle(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Barangay Admin - ${hasBarangay ? name : 'Unassigned'}',
                style: AppText.heading(size: 18),
              ),
              const Text(
                'Barangay Management Dashboard',
                style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
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
        bottom: hasBarangay
            ? TabBar(
                controller: _tabController,
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                indicatorPadding: const EdgeInsets.symmetric(vertical: 6),
                tabs: const [
                  Tab(text: 'Overview'),
                  Tab(text: 'Create Alert'),
                  Tab(text: 'My Alerts'),
                  Tab(text: 'Community Reports'),
                ],
              )
            : null,
      ),
      body: SafeArea(
        child: hasBarangay
            ? TabBarView(
                controller: _tabController,
                children: [
                  _buildOverview(),
                  _buildCreateAlert(),
                  _buildMyAlerts(),
                  _buildReports(),
                ],
              )
            : const Padding(
                padding: EdgeInsets.all(16),
                child: _InfoSurface(
                  color: AppColors.secondary,
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('No barangay is assigned to this account.'),
                  ),
                ),
              ),
      ),
    );
  }

  Widget _loadingIndicator() => const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      );

  // ---------- Overview ----------

  Widget _buildOverview() {
    final risk = _barangayRow?['flood_risk'] as String?;
    final activeAlerts =
        _alerts.where((alert) => alert.status == AlertStatus.approved).length;
    String count(int value) => _loading ? '...' : value.toString();

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          if (_loadError != null) ...[
            _NoteBanner(color: AppColors.danger, text: _loadError!),
            const SizedBox(height: 12),
          ],
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 16,
            crossAxisSpacing: 16,
            childAspectRatio: 1.1,
            children: [
              _StatCard(
                icon: Icons.people,
                color: AppColors.lavender,
                value: count(_residentCount),
                label: 'Barangay Residents',
              ),
              _StatCard(
                icon: Icons.notifications,
                color: AppColors.peach,
                value: count(activeAlerts),
                label: 'Active Alerts',
              ),
              _StatCard(
                icon: Icons.place,
                color: AppColors.mint,
                value: count(_reports.length),
                label: 'Community Reports',
              ),
              // Risk status: solid fill, never pastel.
              _StatCard(
                icon: Icons.water_drop,
                color:
                    risk == null ? AppColors.textSecondary : _riskColor(risk),
                solidStatus: true,
                value: _riskLabel(risk),
                label: 'Current Water Level',
              ),
            ],
          ),
          const SizedBox(height: 16),
          const _NoteBanner(
            color: AppColors.secondary,
            text:
                'All alerts you create will be sent to MDRRMO Admin for verification before being broadcast to residents.',
          ),
          const SizedBox(height: 16),
          _WaterLevelStatusSection(
            barangayName: _barangayName!,
            row: _barangayRow,
            hasError: _barangayError,
            isUpdating: _isUpdating,
            onUpdate: _updateFloodRisk,
          ),
          const SizedBox(height: 24),
          Text('Recent Activity', style: _sectionTitle),
          const SizedBox(height: 12),
          ..._recentActivity(),
          const SizedBox(height: 24),
          Text('Barangay Status', style: _sectionTitle),
          const SizedBox(height: 12),
          _InfoSurface(
            color: AppColors.riskHigh,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.warning_amber_rounded,
                          size: 32, color: AppColors.danger),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Current Status',
                            style: TextStyle(
                                fontSize: 13, color: AppColors.textSecondary),
                          ),
                          Text(
                            _reports.isNotEmpty
                                ? 'Reported Flood Risk'
                                : 'No reported risk',
                            style: const TextStyle(fontSize: 18),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    _reports.isNotEmpty
                        ? 'Latest reports indicate ${_reports.first.waterLevel.label.toLowerCase()} water conditions. Monitor conditions closely.'
                        : 'No community water-level reports are available yet.',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _recentActivity() {
    if (_loading) return [_loadingIndicator()];
    final items = <Widget>[
      for (final alert in _alerts.take(2))
        _ActivityTile(
          icon: Icons.check_circle,
          iconColor: AppColors.success,
          borderColor: AppColors.riskMedium,
          title: 'Alert: ${alert.title}',
          subtitle: '${alert.status.value} | ${_formatTime(alert.sentAt)}',
        ),
      for (final report in _reports.take(1))
        _ActivityTile(
          icon: Icons.place,
          iconColor: AppColors.secondary,
          borderColor: AppColors.primary,
          title: 'New community report received',
          subtitle:
              'From ${report.userName} | ${_formatTime(report.timestamp)}',
          action: TextButton(
            onPressed: () => _tabController.animateTo(3),
            child: const Text('View'),
          ),
        ),
    ];
    if (items.isEmpty) {
      return const [
        Text('No recent activity.',
            style: TextStyle(color: AppColors.textSecondary)),
      ];
    }
    return [
      for (final item in items)
        Padding(padding: const EdgeInsets.only(bottom: 8), child: item),
    ];
  }

  // ---------- Create Alert ----------

  Widget _buildCreateAlert() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Create Alert for $_barangayName', style: _sectionTitle),
        const SizedBox(height: 16),
        FlatPanel(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Alert Details',
                style: AppText.heading(size: 16, weight: FontWeight.w700),
              ),
              const SizedBox(height: 18),
              DropdownButtonFormField<AlertLevel>(
                key: ValueKey('alert-level-$_formVersion'),
                initialValue: _newLevel,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Alert Level',
                ),
                items: const [
                  DropdownMenuItem(
                    value: AlertLevel.advisory,
                    child: Text('Advisory (Blue) - Information'),
                  ),
                  DropdownMenuItem(
                    value: AlertLevel.warning,
                    child: Text('Warning (Yellow) - Prepare to Act'),
                  ),
                  DropdownMenuItem(
                    value: AlertLevel.critical,
                    child: Text('Critical (Red) - Act Now'),
                  ),
                ],
                onChanged: _submitting
                    ? null
                    : (level) => setState(
                        () => _newLevel = level ?? AlertLevel.advisory),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _titleController,
                enabled: !_submitting,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Alert Title',
                  hintText: 'e.g., Flood Warning - Main Road',
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _messageController,
                enabled: !_submitting,
                minLines: 4,
                maxLines: 6,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Message',
                  hintText: 'Enter alert message for residents...',
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _submitting ? null : _submitAlert,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send),
                label: const Text('Submit to MDRRMO'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _showPreview,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                icon: const Icon(Icons.visibility_outlined),
                label: const Text('Preview'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ---------- My Alerts ----------

  Widget _buildMyAlerts() {
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Text('My Alert History', style: _sectionTitle),
          const SizedBox(height: 12),
          if (_loading)
            _loadingIndicator()
          else if (_alerts.isEmpty)
            const _EmptyState(
              icon: Icons.notifications_none,
              message: 'No alerts yet. Alerts you submit will appear here.',
            )
          else
            for (final alert in _alerts)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _AlertCard(alert: alert),
              ),
        ],
      ),
    );
  }

  // ---------- Community Reports ----------

  Widget _buildReports() {
    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Text('Community Reports - $_barangayName', style: _sectionTitle),
          const SizedBox(height: 12),
          const _NoteBanner(
            color: AppColors.warning,
            text: 'Reports are verified by MDRRMO Admin.',
          ),
          const SizedBox(height: 12),
          if (_loading)
            _loadingIndicator()
          else if (_reports.isEmpty)
            const _EmptyState(
              icon: Icons.place_outlined,
              message: 'No community reports yet.',
            )
          else
            for (final report in _reports)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _ReportCard(report: report),
              ),
        ],
      ),
    );
  }
}

// ---------- Widgets ----------

class _InfoSurface extends StatelessWidget {
  final Color color;
  final Widget child;

  const _InfoSurface({required this.color, required this.child});

  @override
  Widget build(BuildContext context) {
    // Status surfaces stay flat with a strong left border.
    return FlatStatusCard(
      accent: color,
      padding: EdgeInsets.zero,
      child: child,
    );
  }
}

class _NoteBanner extends StatelessWidget {
  final Color color;
  final String text;

  const _NoteBanner({required this.color, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        border: Border.all(color: color.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Amber on a pale tint is under 3:1, so warning notes use ink.
          Icon(
            Icons.info_outline,
            color: color == AppColors.warning ? AppColors.ink : color,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  const TextSpan(
                    text: 'Note: ',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  TextSpan(text: text),
                ],
              ),
              style: const TextStyle(fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String value;
  final String label;

  /// True for risk/status tiles: icon sits on a solid status fill instead
  /// of a decorative pastel chip.
  final bool solidStatus;

  const _StatCard({
    required this.icon,
    required this.color,
    required this.value,
    required this.label,
    this.solidStatus = false,
  });

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          if (solidStatus)
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.badgeFill(color),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: AppColors.onBadge(color), size: 22),
            )
          else
            ClayIconChip(icon: icon, color: color),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  value,
                  style: AppText.heading(size: 22),
                ),
              ),
              Text(
                label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActivityTile extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color borderColor;
  final String title;
  final String subtitle;
  final Widget? action;

  const _ActivityTile({
    required this.icon,
    required this.iconColor,
    required this.borderColor,
    required this.title,
    required this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    // Activity items reference alerts, so they stay flat.
    return FlatStatusCard(
      accent: borderColor,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          if (action != null) action!,
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String message;

  const _EmptyState({required this.icon, required this.message});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Column(
        children: [
          Icon(icon, size: 40, color: AppColors.textSecondary),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusPill({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return SolidBadge(label: label, color: color);
  }
}

class _AlertCard extends StatelessWidget {
  final Alert alert;

  const _AlertCard({required this.alert});

  @override
  Widget build(BuildContext context) {
    final (statusLabel, statusColor) = switch (alert.status) {
      AlertStatus.approved => ('Approved', AppColors.success),
      AlertStatus.pending => ('Pending MDRRMO Verification', AppColors.warning),
      AlertStatus.rejected => ('Rejected', AppColors.danger),
    };

    // Alert items: flat card, strong left border in the level color.
    return FlatStatusCard(
      accent: switch (alert.level) {
        AlertLevel.advisory => AppColors.info,
        AlertLevel.warning => AppColors.warning,
        AlertLevel.critical => AppColors.danger,
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              AlertLevelBadge(level: alert.level),
              _StatusPill(label: statusLabel, color: statusColor),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            alert.title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 2),
          Text(
            _formatTime(alert.sentAt),
            style:
                const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 6),
          Text(alert.message),
          if (alert.status == AlertStatus.rejected &&
              (alert.rejectionReason?.isNotEmpty ?? false)) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.danger.withValues(alpha: 0.06),
                border:
                    Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'Rejection Reason: ${alert.rejectionReason}',
                style: const TextStyle(fontSize: 12, color: AppColors.danger),
              ),
            ),
          ],
          if (alert.status == AlertStatus.approved) ...[
            const SizedBox(height: 8),
            const Text(
              'Verified by: MDRRMO Admin',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  final CommunityReport report;

  const _ReportCard({required this.report});

  @override
  Widget build(BuildContext context) {
    final initial =
        report.userName.isNotEmpty ? report.userName[0].toUpperCase() : '?';
    final gps = report.lat != null && report.lng != null
        ? '${report.lat!.toStringAsFixed(6)}, ${report.lng!.toStringAsFixed(6)}'
        : 'Not provided';

    return FlatPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                backgroundColor: AppColors.mint,
                foregroundColor: AppColors.ink,
                child: Text(initial),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(report.userName,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(
                      report.location,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textSecondary),
                    ),
                    Text(
                      'GPS: $gps',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
              ),
              ReportStatusBadge(status: report.status.value),
            ],
          ),
          const SizedBox(height: 12),
          _ReportPhoto(path: report.photoPath),
          const SizedBox(height: 12),
          Text(report.description),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.water_drop,
                  size: 16, color: AppColors.secondary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Water Level: ${report.waterLevel.label}',
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.schedule,
                  size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 6),
              Text(
                _formatTime(report.timestamp),
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ReportPhoto extends StatelessWidget {
  final String? path;

  const _ReportPhoto({required this.path});

  Widget _placeholder(String text) => Container(
        height: 64,
        width: double.infinity,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.circular(14),
        ),
        child:
            Text(text, style: const TextStyle(color: AppColors.textSecondary)),
      );

  @override
  Widget build(BuildContext context) {
    final url = path;
    if (url == null || url.isEmpty) return _placeholder('No photo attached');
    if (!url.startsWith('http')) return _placeholder('Photo not available');
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Image.network(
        url,
        height: 140,
        width: double.infinity,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _placeholder('Photo not available'),
      ),
    );
  }
}

class _WaterLevelStatusSection extends StatelessWidget {
  final String barangayName;
  final Map<String, dynamic>? row;
  final bool hasError;
  final bool isUpdating;
  final Future<void> Function(String, String) onUpdate;

  const _WaterLevelStatusSection({
    required this.barangayName,
    required this.row,
    required this.hasError,
    required this.isUpdating,
    required this.onUpdate,
  });

  @override
  Widget build(BuildContext context) {
    final risk = row?['flood_risk'] as String?;
    final String statusText;
    if (risk != null) {
      statusText = 'Current flood risk';
    } else if (hasError) {
      statusText = 'Status unavailable';
    } else {
      statusText = 'Waiting for current status';
    }

    return _InfoSurface(
      color: AppColors.primary,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Water Level Status',
              style: AppText.heading(size: 18),
            ),
            const SizedBox(height: 4),
            Text(
              'Update the current flood risk for $barangayName.',
              style: const TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _RiskBadge(risk: risk),
                const SizedBox(width: 10),
                Text(
                  statusText,
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              _formatLastUpdate(row?['last_update']),
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final level in const ['low', 'medium', 'high'])
                  _RiskChoice(
                    label: _riskLabel(level),
                    risk: level,
                    selected: risk == level,
                    enabled: !isUpdating,
                    onTap: () => onUpdate(barangayName, level),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RiskChoice extends StatelessWidget {
  final String label;
  final String risk;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  const _RiskChoice({
    required this.label,
    required this.risk,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    // Water-level status chip: solid high-contrast fill when selected,
    // risk-colored outline otherwise. Always labelled.
    final color = _riskColor(risk);
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: enabled ? (_) => onTap() : null,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      selectedColor: AppColors.badgeFill(color),
      checkmarkColor: AppColors.onBadge(color),
      backgroundColor: AppColors.flat,
      side: BorderSide(color: color, width: 1.5),
      labelStyle: TextStyle(
        color: selected ? AppColors.onBadge(color) : AppColors.ink,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class _RiskBadge extends StatelessWidget {
  final String? risk;

  const _RiskBadge({required this.risk});

  @override
  Widget build(BuildContext context) {
    final label = risk == null
        ? 'Unknown'
        : '${risk![0].toUpperCase()}${risk!.substring(1)}';
    return SolidBadge(label: label, color: _riskColor(risk));
  }
}

Color _riskColor(String? risk) {
  switch (risk) {
    case 'low':
      return AppColors.success;
    case 'medium':
      return AppColors.warning;
    case 'high':
      return AppColors.danger;
    default:
      return AppColors.textSecondary;
  }
}

String _riskLabel(String? risk) {
  switch (risk) {
    case 'low':
      return 'Low Risk';
    case 'medium':
      return 'Medium Risk';
    case 'high':
      return 'High Risk';
    default:
      return 'No data';
  }
}

String _formatLastUpdate(Object? value) {
  if (value == null) return 'Last updated: Not available';
  final parsed = DateTime.tryParse(value.toString())?.toLocal();
  if (parsed == null) return 'Last updated: Not available';
  return 'Last updated: ${DateFormat('MMM d, y h:mm a').format(parsed)}';
}

String _formatTime(String raw) {
  final parsed = DateTime.tryParse(raw)?.toLocal();
  if (parsed == null) return raw;
  return DateFormat('MMM d, y h:mm a').format(parsed);
}
