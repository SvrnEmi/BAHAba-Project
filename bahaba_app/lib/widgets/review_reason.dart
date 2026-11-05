import 'package:flutter/material.dart';

import '../models/community_report_model.dart';
import '../theme/app_theme.dart';

/// Why a report was approved or rejected, as the resident sees it on their
/// report card. Shows nothing for pending reports or when no reason is set.
class ReviewReason extends StatelessWidget {
  final CommunityReport report;

  const ReviewReason({super.key, required this.report});

  @override
  Widget build(BuildContext context) {
    final approved = report.status == ReportStatus.approved;
    final rejected = report.status == ReportStatus.rejected;
    final reason = (approved
            ? report.approvalReason
            : rejected
                ? report.rejectionReason
                : null)
        ?.trim();
    if (reason == null || reason.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(10, 6, 8, 6),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          left: BorderSide(
            color: approved ? AppColors.riskLowFill : AppColors.danger,
            width: 3,
          ),
        ),
      ),
      child: Text.rich(
        TextSpan(children: [
          TextSpan(
            text: approved ? 'Why it was approved: ' : 'Why it was rejected: ',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          TextSpan(text: reason),
        ]),
        style: const TextStyle(fontSize: 12, color: AppColors.ink, height: 1.35),
      ),
    );
  }
}
