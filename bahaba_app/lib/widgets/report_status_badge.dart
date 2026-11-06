import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'risk_badge.dart';

class ReportStatusBadge extends StatelessWidget {
  final String status; // 'pending' | 'approved' | 'rejected'

  /// Barangay officials see who the report is waiting for.
  final String pendingLabel;

  const ReportStatusBadge({
    super.key,
    required this.status,
    this.pendingLabel = 'Pending',
  });

  @override
  Widget build(BuildContext context) {
    final (label, color, icon) = switch (status) {
      'approved' => ('Approved', AppColors.riskLow, Icons.check_circle_outline),
      'rejected' => ('Rejected', AppColors.riskHigh, Icons.cancel_outlined),
      _ => (pendingLabel, AppColors.riskMedium, Icons.hourglass_empty),
    };

    return SolidBadge(label: label, color: color, icon: icon);
  }
}
