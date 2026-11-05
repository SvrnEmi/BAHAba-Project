import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../config/app_strings.dart';
import '../services/posted_reports_service.dart';
import '../theme/app_theme.dart';
import '../utils/report_display.dart';

/// One report, or a list when several arrive together or on catch-up.
/// [onView] gets the report to open, or null for Posted reports on Home.
Future<void> showVerifiedReportDialog(
  BuildContext context, {
  required List<PostedReport> reports,
  required bool catchUp,
  required String barangay,
  required String userId,
  required void Function(PostedReport? report) onView,
}) {
  return showDialog<void>(
    context: context,
    builder: (dialogContext) => VerifiedReportDialog(
      reports: reports,
      catchUp: catchUp,
      barangay: barangay,
      userId: userId,
      onView: (report) {
        Navigator.of(dialogContext).pop();
        onView(report);
      },
    ),
  );
}

class VerifiedReportDialog extends StatelessWidget {
  final List<PostedReport> reports;
  final bool catchUp;
  final String barangay;
  final String userId;
  final void Function(PostedReport? report) onView;

  const VerifiedReportDialog({
    super.key,
    required this.reports,
    required this.catchUp,
    required this.barangay,
    required this.userId,
    required this.onView,
  });

  bool get _single =>
      reports.length == 1 && !(catchUp && reports.first.status == 'approved');

  String get _title {
    if (_single) {
      final report = reports.first;
      if (report.status == 'rejected') return AppStrings.popupRejected;
      if (report.userId == userId) return AppStrings.popupOwn;
      return AppStrings.popupVerified(report.barangay ?? barangay);
    }
    return reports.every((r) => r.status == 'approved')
        ? AppStrings.popupMany(reports.length, barangay)
        : AppStrings.popupUpdates(reports.length);
  }

  @override
  Widget build(BuildContext context) {
    final approved = reports.where((r) => r.status == 'approved').toList();
    return AlertDialog(
      title: Text(_title, style: AppText.heading(size: 18)),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final report in reports)
              _ReportLines(
                report: report,
                tagged: !_single,
                own: report.userId == userId,
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text(AppStrings.popupDismiss),
        ),
        if (approved.isNotEmpty)
          TextButton(
            onPressed: () =>
                onView(approved.length == 1 ? approved.first : null),
            child: Text(
                _single ? AppStrings.popupViewReport : AppStrings.popupView),
          ),
      ],
    );
  }
}

class _ReportLines extends StatelessWidget {
  final PostedReport report;
  final bool tagged;
  final bool own;

  const _ReportLines({
    required this.report,
    required this.tagged,
    required this.own,
  });

  @override
  Widget build(BuildContext context) {
    final rejected = report.status == 'rejected';
    final reason = report.rejectionReason?.trim() ?? '';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (tagged && rejected)
            const Text(
              AppStrings.popupRejected,
              style: TextStyle(
                color: AppColors.riskHigh,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            )
          else if (tagged && own)
            const Text(
              AppStrings.popupOwnTag,
              style: TextStyle(
                color: AppColors.ink,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          Text(
            report.location.isEmpty
                ? AppStrings.postedUnknownLocation
                : report.location,
            style: const TextStyle(
              color: AppColors.ink,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          Text(waterLevelLabel(report.waterLevel),
              style: const TextStyle(color: AppColors.ink, fontSize: 14)),
          Text(
            DateFormat('MMM d, y, h:mm a').format(report.timestamp),
            style:
                const TextStyle(color: AppColors.textSecondary, fontSize: 12),
          ),
          if (rejected) ...[
            const SizedBox(height: 4),
            Text(
              reason.isEmpty
                  ? AppStrings.popupNoReason
                  : '${AppStrings.popupReason} $reason',
              style: const TextStyle(color: AppColors.ink, fontSize: 14),
            ),
          ],
        ],
      ),
    );
  }
}
