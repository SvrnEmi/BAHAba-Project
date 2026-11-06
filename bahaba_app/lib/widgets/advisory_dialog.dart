import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../config/app_strings.dart';
import '../services/report_advisories_service.dart';
import '../theme/app_theme.dart';

/// One advisory, or a list when several arrive together or on catch-up.
/// [onView] gets the report to open.
Future<void> showAdvisoryDialog(
  BuildContext context, {
  required List<ReportAdvisory> advisories,
  required void Function(int reportId) onView,
}) {
  return showDialog<void>(
    context: context,
    builder: (dialogContext) => AdvisoryDialog(
      advisories: advisories,
      onView: (reportId) {
        Navigator.of(dialogContext).pop();
        onView(reportId);
      },
    ),
  );
}

class AdvisoryDialog extends StatelessWidget {
  final List<ReportAdvisory> advisories;
  final void Function(int reportId) onView;

  const AdvisoryDialog({
    super.key,
    required this.advisories,
    required this.onView,
  });

  @override
  Widget build(BuildContext context) {
    final single = advisories.length == 1;
    return AlertDialog(
      title: Text(
        single
            ? AppStrings.advisoryPopupTitle
            : AppStrings.advisoryPopupMany(advisories.length),
        style: AppText.heading(size: 18),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final advisory in advisories)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      advisory.body,
                      style:
                          const TextStyle(color: AppColors.ink, fontSize: 14),
                    ),
                    Text(
                      '${AppStrings.advisoryFrom(advisory.author)} · '
                      '${DateFormat('MMM d, y, h:mm a').format(advisory.createdAt)}',
                      style: const TextStyle(
                          color: AppColors.textSecondary, fontSize: 12),
                    ),
                    if (!single)
                      TextButton(
                        onPressed: () => onView(advisory.reportId),
                        child: const Text(AppStrings.popupViewReport),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text(AppStrings.popupDismiss),
        ),
        if (single)
          TextButton(
            onPressed: () => onView(advisories.first.reportId),
            child: const Text(AppStrings.popupViewReport),
          ),
      ],
    );
  }
}
