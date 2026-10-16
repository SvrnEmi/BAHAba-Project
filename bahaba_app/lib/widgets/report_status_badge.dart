import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'risk_badge.dart';

class ReportStatusBadge extends StatelessWidget {
  final String status; // 'pending' | 'approved' | 'rejected'

  const ReportStatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, color, icon) = switch (status) {
      'approved' => ('Approved', AppColors.riskLow, Icons.check_circle_outline),
      'rejected' => ('Rejected', AppColors.riskHigh, Icons.cancel_outlined),
      _ => ('Pending', AppColors.riskMedium, Icons.hourglass_empty),
    };

    return SolidBadge(label: label, color: color, icon: icon);
  }
}
