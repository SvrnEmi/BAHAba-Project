import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../config/app_strings.dart';
import '../../models/community_report_model.dart';
import '../../services/barangay_quick_reports_service.dart';
import '../../services/posted_reports_service.dart';
import '../../services/report_messages_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/flat_status_card.dart';
import '../../widgets/report_messages_section.dart';
import '../../widgets/report_status_badge.dart';
import '../../widgets/review_reason.dart';

/// The barangay Reports item: read-only, because the MDRRMO is the only
/// verifier. One tab per kind of report, for the official's own barangay.
class BarangayReportsTab extends StatelessWidget {
  final List<CommunityReport> reports;
  final List<BarangayQuickReport> quickReports;
  final bool loading;
  final String? quickError;
  final Future<void> Function() onRefresh;

  const BarangayReportsTab({
    super.key,
    required this.reports,
    required this.quickReports,
    required this.loading,
    required this.quickError,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          const TabBar(
            tabs: [
              Tab(text: AppStrings.barangayCommunityReports),
              Tab(text: AppStrings.barangayQuickReports),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                _ReportList(
                  onRefresh: onRefresh,
                  loading: loading,
                  empty: 'No community reports yet.',
                  children: [
                    for (final report in reports)
                      _CommunityCard(
                        key: ValueKey('report-${report.id}'),
                        report: report,
                      ),
                  ],
                ),
                _ReportList(
                  onRefresh: onRefresh,
                  loading: loading,
                  error: quickError,
                  empty: 'No Quick Reports yet.',
                  children: [
                    for (final report in quickReports)
                      _QuickCard(
                        key: ValueKey('quick-${report.id}'),
                        report: report,
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReportList extends StatelessWidget {
  final Future<void> Function() onRefresh;
  final bool loading;
  final String? error;
  final String empty;
  final List<Widget> children;

  const _ReportList({
    required this.onRefresh,
    required this.loading,
    required this.empty,
    required this.children,
    this.error,
  });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            AppStrings.barangayReportsNote,
            style: TextStyle(fontSize: 13, color: AppColors.ink),
          ),
          const SizedBox(height: 12),
          if (error != null)
            Text(error!, style: const TextStyle(color: AppColors.danger))
          else if (loading)
            const Center(child: CircularProgressIndicator())
          else if (children.isEmpty)
            Text(empty, style: const TextStyle(color: AppColors.textSecondary))
          else
            for (final child in children)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: child,
              ),
        ],
      ),
    );
  }
}

String _when(DateTime? time) =>
    time == null ? '' : DateFormat('MMM d, y h:mm a').format(time);

class _Line extends StatelessWidget {
  final String label;
  final String value;

  const _Line(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text.rich(
        TextSpan(children: [
          TextSpan(
            text: '$label: ',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          TextSpan(text: value),
        ]),
        style: const TextStyle(fontSize: 13, color: AppColors.ink),
      ),
    );
  }
}

class _CommunityCard extends StatelessWidget {
  final CommunityReport report;

  const _CommunityCard({super.key, required this.report});

  @override
  Widget build(BuildContext context) {
    final photo = report.photoPath;
    return FlatPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ReportStatusBadge(
            status: report.status.value,
            pendingLabel: AppStrings.barangayPending,
          ),
          const SizedBox(height: 8),
          Text(report.location, style: AppText.heading(size: 15)),
          _Line('Water level', report.waterLevel.label),
          _Line('Reporter', report.userName),
          _Line('Time', _when(DateTime.tryParse(report.timestamp)?.toLocal())),
          if (report.description.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(report.description),
          ],
          if (photo != null && photo.isNotEmpty) ...[
            const SizedBox(height: 10),
            _Photo(url: PostedReportsService.photoUrl(photo)),
          ],
          ReviewReason(report: report),
          if (report.id != null)
            ReportMessagesSection(
              reportId: report.id!,
              viewerRole: SenderRole.barangay,
            ),
        ],
      ),
    );
  }
}

class _QuickCard extends StatefulWidget {
  final BarangayQuickReport report;

  const _QuickCard({super.key, required this.report});

  @override
  State<_QuickCard> createState() => _QuickCardState();
}

class _QuickCardState extends State<_QuickCard> {
  Future<String>? _photo;

  @override
  void initState() {
    super.initState();
    final path = widget.report.photoPath;
    if (path != null && path.isNotEmpty) {
      _photo = BarangayQuickReportsService().signedPhotoUrl(path);
    }
  }

  @override
  Widget build(BuildContext context) {
    final report = widget.report;
    final landmark = report.landmark?.trim() ?? '';
    final description = report.description?.trim() ?? '';
    final name = report.reporterName?.trim() ?? '';
    final phone = report.reporterPhone?.trim() ?? '';
    final rejection = report.rejectionReason?.trim() ?? '';
    final flag = report.flagReason?.trim() ?? '';
    return FlatPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (report.flaggedFalse)
            const Text(
              'Flagged by MDRRMO',
              style: TextStyle(
                color: AppColors.riskHigh,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            )
          else
            ReportStatusBadge(
              status: report.status,
              pendingLabel: AppStrings.barangayPending,
            ),
          const SizedBox(height: 8),
          Text(
            landmark.isEmpty ? 'Location shared' : landmark,
            style: AppText.heading(size: 15),
          ),
          _Line('Water level', report.waterLevel ?? 'Not given'),
          _Line('Time', _when(report.createdAt)),
          if (report.lat != null && report.lng != null)
            _Line(
              'GPS',
              '${report.lat!.toStringAsFixed(5)}, '
                  '${report.lng!.toStringAsFixed(5)}',
            ),
          if (name.isNotEmpty) _Line('Reporter', name),
          if (phone.isNotEmpty) _Line('Phone', phone),
          if (description.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(description),
          ],
          if (_photo != null) ...[
            const SizedBox(height: 10),
            FutureBuilder<String>(
              future: _photo,
              builder: (context, snapshot) {
                if (snapshot.hasError) return const _PhotoUnavailable();
                final url = snapshot.data;
                if (url == null) {
                  return const SizedBox(
                    height: 120,
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                return _Photo(url: url);
              },
            ),
          ],
          if (report.status == 'rejected' && rejection.isNotEmpty)
            _Line('Rejection reason', rejection),
          if (report.flaggedFalse && flag.isNotEmpty)
            _Line('MDRRMO note', flag),
          if (report.reviewedAt != null)
            _Line('Reviewed by the MDRRMO', _when(report.reviewedAt)),
        ],
      ),
    );
  }
}

class _Photo extends StatelessWidget {
  final String url;

  const _Photo({required this.url});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Image.network(
        url,
        height: 160,
        width: double.infinity,
        fit: BoxFit.cover,
        semanticLabel: 'Photo sent with the report',
        errorBuilder: (_, __, ___) => const _PhotoUnavailable(),
      ),
    );
  }
}

class _PhotoUnavailable extends StatelessWidget {
  const _PhotoUnavailable();

  @override
  Widget build(BuildContext context) {
    return const Text(
      'Photo unavailable',
      style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
    );
  }
}
