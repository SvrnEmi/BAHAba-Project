import 'dart:async';

import 'package:flutter/material.dart';

import '../config/app_strings.dart';
import '../services/field_observations_service.dart';
import '../theme/app_theme.dart';
import 'clay_container.dart';

/// "Reported on the ground": the latest reading of each place in [barangay].
/// The table has no realtime, so it is read on open, when the app returns to
/// the foreground and once a minute.
class GroundReportsCard extends StatefulWidget {
  final String? barangay;

  /// The viewer's own barangay: uses the "your barangay" empty text.
  final bool ownBarangay;

  /// Replaces the Supabase read in tests.
  final Future<List<FieldObservation>> Function(String barangay)? read;

  const GroundReportsCard({
    super.key,
    required this.barangay,
    this.ownBarangay = false,
    this.read,
  });

  @override
  State<GroundReportsCard> createState() => _GroundReportsCardState();
}

class _GroundReportsCardState extends State<GroundReportsCard>
    with WidgetsBindingObserver {
  static const _refreshEvery = Duration(minutes: 1);

  List<FieldObservation> _rows = const [];
  bool _loading = true;
  bool _failed = false;
  Timer? _timer;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _timer = Timer.periodic(_refreshEvery, (_) => _load());
  }

  @override
  void didUpdateWidget(GroundReportsCard old) {
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
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final barangay = widget.barangay;
    if (barangay == null || barangay.isEmpty) return;
    final generation = ++_generation;
    try {
      final rows =
          await (widget.read ?? FieldObservationsService.latestFor)(barangay);
      if (!mounted || generation != _generation) return;
      setState(() {
        _rows = rows;
        _failed = false;
        _loading = false;
      });
    } catch (e) {
      debugPrint('Ground reports unavailable: $e');
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

    return ClayContainer(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(AppStrings.groundTitle,
                style: AppText.heading(size: 16)),
          ),
          const SizedBox(height: 2),
          Text(
            AppStrings.groundSubtitle(barangay),
            style:
                const TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 10),
          if (_failed && _rows.isEmpty) ...[
            const Text(AppStrings.groundLoadFailed,
                style: TextStyle(color: AppColors.ink, fontSize: 14)),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: _load,
                child: const Text(AppStrings.groundRetry),
              ),
            ),
          ] else if (_loading)
            const Text(AppStrings.groundChecking,
                style: TextStyle(color: AppColors.textSecondary, fontSize: 14))
          else if (_rows.isEmpty)
            Text(
              widget.ownBarangay
                  ? AppStrings.groundNone
                  : AppStrings.groundNoneFor(barangay),
              style: const TextStyle(
                  color: AppColors.textSecondary, fontSize: 14),
            )
          else
            for (final row in _rows) _ObservationTile(row: row, now: now),
        ],
      ),
    );
  }
}

class _ObservationTile extends StatelessWidget {
  final FieldObservation row;
  final DateTime now;

  const _ObservationTile({required this.row, required this.now});

  Color get _statusColor => switch (row.status) {
        'normal' || 'passable' => AppColors.riskLow,
        'rising' => AppColors.riskMedium,
        _ => AppColors.riskHigh,
      };

  @override
  Widget build(BuildContext context) {
    final stale = row.isStale(now);
    final fill =
        stale ? AppColors.textSecondary : AppColors.badgeFill(_statusColor);
    final onFill = stale ? Colors.white : AppColors.onBadge(_statusColor);
    final textColor = stale ? AppColors.textSecondary : AppColors.ink;
    final age = AppStrings.timeAgo(row.observedAt, now);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: stale ? AppColors.background : AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: fill,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  AppStrings.groundStatus(row.status),
                  style: TextStyle(
                    color: onFill,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Text(
                AppStrings.groundKind(row.kind),
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            row.location,
            style: TextStyle(
                color: textColor, fontSize: 14, fontWeight: FontWeight.w700),
          ),
          if (row.note != null)
            Text(row.note!, style: TextStyle(color: textColor, fontSize: 14)),
          const SizedBox(height: 4),
          Text(
            stale ? '$age · ${AppStrings.groundOutOfDate}' : age,
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12,
              fontWeight: stale ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }
}
