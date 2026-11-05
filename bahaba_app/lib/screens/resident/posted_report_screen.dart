import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../config/app_strings.dart';
import '../../services/posted_reports_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/report_display.dart';
import '../../widgets/clay_container.dart';

/// The full report, opened from Posted reports or a pop-up.
class PostedReportScreen extends StatefulWidget {
  final int reportId;

  /// Replaces the Supabase read in tests.
  final Future<PostedReport?> Function(int id)? read;

  const PostedReportScreen({super.key, required this.reportId, this.read});

  @override
  State<PostedReportScreen> createState() => _PostedReportScreenState();
}

class _PostedReportScreenState extends State<PostedReportScreen> {
  late final Future<PostedReport?> _report;

  @override
  void initState() {
    super.initState();
    PostedReportsService.viewingId = widget.reportId;
    _report =
        (widget.read ?? PostedReportsService.fetchOne)(widget.reportId);
  }

  @override
  void dispose() {
    if (PostedReportsService.viewingId == widget.reportId) {
      PostedReportsService.viewingId = null;
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text(AppStrings.postedDetailTitle)),
      body: FutureBuilder<PostedReport?>(
        future: _report,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final report = snapshot.data;
          if (snapshot.hasError || report == null) {
            return Padding(
              padding: const EdgeInsets.all(18),
              child: Text(
                snapshot.hasError
                    ? AppStrings.postedLoadFailed
                    : AppStrings.postedMissing,
                style: const TextStyle(color: AppColors.ink, fontSize: 14),
              ),
            );
          }
          final photo = report.photoPath;
          final description = report.description?.trim() ?? '';
          return ListView(
            padding: const EdgeInsets.all(18),
            children: [
              ClayContainer(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      report.location.isEmpty
                          ? AppStrings.postedUnknownLocation
                          : report.location,
                      style: AppText.heading(size: 18),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      waterLevelLabel(report.waterLevel),
                      style: const TextStyle(
                        color: AppColors.ink,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      DateFormat('MMM d, y, h:mm a').format(report.timestamp),
                      style: const TextStyle(
                          color: AppColors.textSecondary, fontSize: 12),
                    ),
                    if (report.barangay != null)
                      Text(
                        AppStrings.postedBy(report.barangay!),
                        style: const TextStyle(
                            color: AppColors.textSecondary, fontSize: 12),
                      ),
                    if (description.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(description,
                          style: const TextStyle(
                              color: AppColors.ink, fontSize: 14)),
                    ],
                    if (photo != null && photo.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(14),
                        child: Image.network(
                          PostedReportsService.photoUrl(photo),
                          fit: BoxFit.cover,
                          semanticLabel: AppStrings.postedPhotoAlt,
                          errorBuilder: (_, __, ___) => const Text(
                            AppStrings.postedPhotoUnavailable,
                            style: TextStyle(
                                color: AppColors.textSecondary, fontSize: 12),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
