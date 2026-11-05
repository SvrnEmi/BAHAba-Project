import 'dart:async';

import 'package:flutter/material.dart';

import '../config/app_strings.dart';
import '../screens/resident/posted_report_screen.dart';
import '../services/posted_reports_service.dart';
import '../services/realtime_hub.dart';
import '../theme/app_theme.dart';
import '../utils/report_display.dart';
import 'clay_container.dart';

/// Approved reports of the resident's barangay, newest first. Reads on open,
/// when the app returns to the foreground and on any community_reports change
/// (shared channel, see [RealtimeHub]).
class PostedReportsSection extends StatefulWidget {
  final String? barangay;

  /// Replace the Supabase read and the live changes in tests.
  final Future<List<PostedReport>> Function(String barangay)? read;
  final Stream<Object?>? changes;

  const PostedReportsSection({
    super.key,
    required this.barangay,
    this.read,
    this.changes,
  });

  @override
  State<PostedReportsSection> createState() => _PostedReportsSectionState();
}

class _PostedReportsSectionState extends State<PostedReportsSection>
    with WidgetsBindingObserver {
  List<PostedReport> _rows = const [];
  bool _loading = true;
  bool _failed = false;
  int _generation = 0;
  Timer? _debounce;
  StreamSubscription<Object?>? _sub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _sub = (widget.changes ?? RealtimeHub.instance.table('community_reports'))
        .listen(
      (_) {
        _debounce?.cancel();
        _debounce = Timer(const Duration(milliseconds: 400), _load);
      },
      onError: (Object e) => debugPrint('Posted reports stream failed: $e'),
    );
  }

  @override
  void didUpdateWidget(PostedReportsSection old) {
    super.didUpdateWidget(old);
    if (old.barangay != widget.barangay) {
      setState(() {
        _rows = const [];
        _loading = true;
        _failed = false;
      });
      _load();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _debounce?.cancel();
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final barangay = widget.barangay;
    if (barangay == null || barangay.isEmpty) return;
    final generation = ++_generation;
    try {
      final rows =
          await (widget.read ?? PostedReportsService.fetch)(barangay);
      if (!mounted || generation != _generation) return;
      setState(() {
        _rows = rows;
        _failed = false;
        _loading = false;
      });
    } catch (e) {
      debugPrint('Posted reports unavailable: $e');
      if (!mounted || generation != _generation) return;
      setState(() {
        _failed = true;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final barangay = widget.barangay;
    if (barangay == null || barangay.isEmpty) return const SizedBox.shrink();
    final now = DateTime.now();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child:
              Text(AppStrings.postedTitle, style: AppText.heading(size: 16)),
        ),
        const SizedBox(height: 10),
        if (_failed && _rows.isEmpty) ...[
          const Text(AppStrings.postedLoadFailed,
              style: TextStyle(color: AppColors.ink, fontSize: 14)),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: _load,
              child: const Text(AppStrings.postedRetry),
            ),
          ),
        ] else if (_loading)
          const Text(AppStrings.postedChecking,
              style: TextStyle(color: AppColors.textSecondary, fontSize: 14))
        else if (_rows.isEmpty)
          const ClayContainer(
            padding: EdgeInsets.all(16),
            child: Text(AppStrings.postedNone,
                style:
                    TextStyle(color: AppColors.textSecondary, fontSize: 14)),
          )
        else
          for (final row in _rows)
            _PostedCard(report: row, barangay: barangay, now: now),
      ],
    );
  }
}

class _PostedCard extends StatelessWidget {
  final PostedReport report;
  final String barangay;
  final DateTime now;

  const _PostedCard({
    required this.report,
    required this.barangay,
    required this.now,
  });

  @override
  Widget build(BuildContext context) {
    final location = report.location.isEmpty
        ? AppStrings.postedUnknownLocation
        : report.location;
    final level = waterLevelLabel(report.waterLevel);
    final when = AppStrings.timeAgo(report.timestamp, now);
    final photo = report.photoPath;

    return ClayContainer(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      semanticLabel: AppStrings.postedOpen(location, level, when),
      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => PostedReportScreen(reportId: report.id),
      )),
      child: ExcludeSemantics(
        child: Row(
          children: [
            if (photo != null && photo.isNotEmpty) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.network(
                  PostedReportsService.photoUrl(photo),
                  width: 64,
                  height: 64,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    location,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.ink,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(level,
                      style:
                          const TextStyle(color: AppColors.ink, fontSize: 13)),
                  Text(when,
                      style: const TextStyle(
                          color: AppColors.textSecondary, fontSize: 12)),
                  Text(
                    AppStrings.postedBy(report.barangay ?? barangay),
                    style: const TextStyle(
                        color: AppColors.textSecondary, fontSize: 12),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.textSecondary),
          ],
        ),
      ),
    );
  }
}
