import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../config/app_strings.dart';
import '../../repositories/report_repository.dart';
import '../../services/all_reports_service.dart';
import '../../services/barangay_quick_reports_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/report_display.dart' show relativeTime;
import '../../widgets/clay_container.dart';
import '../../widgets/report_status_badge.dart';
import '../../widgets/risk_badge.dart';
import 'barangay_reports_tab.dart';

typedef AllReportsFetch = Future<AllReportsPage> Function(
    AllReportsFilter filter, int start, int count);

const _sources = {
  'all': 'All',
  'resident': 'Residents',
  'mdrrmo': 'MDRRMO',
  'guest': 'Guests',
};
const _statuses = {
  'all': 'All',
  'pending': 'Pending',
  'approved': 'Approved',
  'rejected': 'Rejected',
};
const _levels = {
  'all': 'All',
  'ankle': 'Ankle',
  'knee': 'Knee',
  'waist': 'Waist',
  'chest': 'Chest',
  'overhead': 'Over head',
};
const _dates = {
  'all': 'All time',
  'today': 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  'custom': 'Custom range',
};
const _sorts = {
  'newest': 'Newest first',
  'oldest': 'Oldest first',
  'highest': 'Highest water level first',
  'lowest': 'Lowest water level first',
  'status': 'Status (Pending first)',
};

Color _levelColor(String? level) => switch (level) {
      'ankle' => AppColors.riskLow,
      'knee' => AppColors.riskMedium,
      _ => AppColors.riskHigh,
    };

/// All reports for the official's barangay, read-only: reports from residents,
/// the MDRRMO and guests. Mirrors the web AllReportsSection.
class BarangayAllReportsTab extends StatefulWidget {
  final String barangay;

  /// Fires when a report of this barangay changes.
  final Listenable changes;

  /// Tests inject a fake; defaults to Supabase.
  final AllReportsFetch? fetch;

  const BarangayAllReportsTab({
    super.key,
    required this.barangay,
    required this.changes,
    this.fetch,
  });

  @override
  State<BarangayAllReportsTab> createState() => _BarangayAllReportsTabState();
}

class _BarangayAllReportsTabState extends State<BarangayAllReportsTab>
    with AutomaticKeepAliveClientMixin {
  final _service = AllReportsService();
  final _searchController = TextEditingController();
  Timer? _searchDebounce;
  AllReportsFilter _filter = const AllReportsFilter();
  List<AllReport> _rows = const [];
  int _total = 0;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int _read = 0;

  // Keeps the search and filters while the official looks at another tab.
  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    widget.changes.addListener(_refresh);
    _reload();
  }

  @override
  void dispose() {
    widget.changes.removeListener(_refresh);
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<AllReportsPage> _fetch(int start, int count) {
    final fetch = widget.fetch;
    if (fetch != null) return fetch(_filter, start, count);
    return _service.fetch(
      barangay: widget.barangay,
      filter: _filter,
      start: start,
      count: count,
    );
  }

  /// A live refresh keeps the rows on screen and how far Load more went.
  void _refresh() => _reload(quiet: true);

  Future<void> _reload({bool quiet = false}) async {
    final mine = ++_read;
    if (!quiet) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final count = quiet && _rows.length > AllReportsService.pageSize
        ? _rows.length
        : AllReportsService.pageSize;
    try {
      final page = await _fetch(0, count);
      if (!mounted || mine != _read) return;
      setState(() {
        _rows = page.rows;
        _total = page.total;
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || mine != _read) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadMore() async {
    final mine = ++_read;
    setState(() => _loadingMore = true);
    try {
      final page = await _fetch(_rows.length, AllReportsService.pageSize);
      if (!mounted || mine != _read) return;
      final seen = {for (final row in _rows) '${row.kind}-${row.id}'};
      setState(() {
        _rows = [
          ..._rows,
          for (final row in page.rows)
            if (!seen.contains('${row.kind}-${row.id}')) row,
        ];
        _total = page.total;
      });
    } catch (error) {
      if (mounted && mine == _read) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _apply(AllReportsFilter next) {
    _filter = next;
    _reload();
  }

  void _onSearch(String text) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(
      const Duration(milliseconds: 300),
      () => _apply(_filter.copyWith(search: text)),
    );
  }

  void _clear() {
    _searchDebounce?.cancel();
    _searchController.clear();
    _apply(AllReportsFilter(sort: _filter.sort));
  }

  Future<void> _pickDates() async {
    final now = DateTime.now();
    final from = _filter.from;
    final to = _filter.to;
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2024),
      lastDate: now,
      initialDateRange:
          from != null && to != null ? DateTimeRange(start: from, end: to) : null,
    );
    if (range != null) {
      _apply(_filter.copyWith(from: range.start, to: range.end));
    }
  }

  Widget _select(String label, String value, Map<String, String> options,
      void Function(String) onChanged) {
    return DropdownButtonFormField<String>(
      key: ValueKey('$label-$value'),
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label, isDense: true),
      items: [
        for (final option in options.entries)
          DropdownMenuItem(
            value: option.key,
            child: Text(option.value, overflow: TextOverflow.ellipsis),
          ),
      ],
      onChanged: (next) {
        if (next != null && next != value) onChanged(next);
      },
    );
  }

  Widget _controls(double width) {
    final half = (width - 12) / 2;
    final filter = _filter;
    SizedBox box(Widget child, [double? size]) =>
        SizedBox(width: size ?? half, child: child);
    final from = filter.from;
    final to = filter.to;
    final format = DateFormat('MMM d, y');
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        box(_select('Source', filter.source, _sources,
            (v) => _apply(filter.copyWith(source: v)))),
        box(_select('Status', filter.status, _statuses,
            (v) => _apply(filter.copyWith(status: v)))),
        box(_select('Water level', filter.level, _levels,
            (v) => _apply(filter.copyWith(level: v)))),
        box(_select('Date', filter.date, _dates, (v) {
          _apply(filter.copyWith(date: v));
          if (v == 'custom') _pickDates();
        })),
        box(
          _select('Sort', filter.sort, _sorts, (v) {
            if (v == 'oldest' || filter.sort == 'oldest') {
              _apply(filter.copyWith(sort: v));
            } else {
              // The rows already loaded are sorted again; no new read.
              setState(() => _filter = filter.copyWith(sort: v));
            }
          }),
          width,
        ),
        if (filter.date == 'custom')
          OutlinedButton.icon(
            onPressed: _pickDates,
            icon: const Icon(Icons.date_range),
            label: Text(from == null || to == null
                ? 'Choose dates'
                : '${format.format(from)} to ${format.format(to)}'),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final search = _filter.search.trim();
    final rows = sortLoaded(_rows, _filter.sort);
    return RefreshIndicator(
      onRefresh: () => _reload(quiet: true),
      child: LayoutBuilder(
        builder: (context, constraints) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              AppStrings.barangayReportsNote,
              style: TextStyle(fontSize: 13, color: AppColors.ink),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _searchController,
              onChanged: _onSearch,
              decoration: const InputDecoration(
                hintText: 'Search location, description or reporter',
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
            ),
            const SizedBox(height: 12),
            _controls(constraints.maxWidth - 32),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text(
                    _loading || _error != null
                        ? ''
                        : [
                            if (search.isNotEmpty)
                              "$_total ${_total == 1 ? 'result' : 'results'} for '$search'.",
                            'Showing ${_rows.length} of $_total',
                          ].join(' '),
                    style: const TextStyle(
                        fontSize: 13, color: AppColors.textSecondary),
                  ),
                ),
                if (_filter.narrowed)
                  TextButton(
                    onPressed: _clear,
                    child: const Text('Clear filters'),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            if (_error != null) ...[
              Text(
                'Could not load reports: $_error',
                style: const TextStyle(color: AppColors.danger),
              ),
              TextButton(onPressed: _reload, child: const Text('Retry')),
            ],
            if (_loading)
              for (var i = 0; i < 3; i++)
                Container(
                  key: const ValueKey('all-reports-skeleton'),
                  height: 88,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(22),
                  ),
                )
            else if (_error == null && _rows.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  _filter.narrowed
                      ? 'No reports match your search'
                      : 'No reports in your barangay yet.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
              ),
            if (!_loading)
              for (final row in rows)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _ReportRow(
                    key: ValueKey('${row.kind}-${row.id}'),
                    report: row,
                    photo: row.photoPath == null || row.photoPath!.isEmpty
                        ? null
                        : () => _service.photoUrl(row),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => _ReportDetailsScreen(
                          report: row,
                          barangay: widget.barangay,
                        ),
                      ),
                    ),
                  ),
                ),
            if (!_loading && _rows.length < _total)
              OutlinedButton(
                onPressed: _loadingMore ? null : _loadMore,
                child: Text(_loadingMore ? 'Loading...' : 'Load more'),
              ),
          ],
        ),
      ),
    );
  }
}

class _ReportRow extends StatefulWidget {
  final AllReport report;
  final Future<String> Function()? photo;
  final VoidCallback onTap;

  const _ReportRow({
    super.key,
    required this.report,
    required this.photo,
    required this.onTap,
  });

  @override
  State<_ReportRow> createState() => _ReportRowState();
}

class _ReportRowState extends State<_ReportRow> {
  // One signed URL per row, not one per rebuild.
  late final Future<String>? _photo = widget.photo?.call();

  @override
  Widget build(BuildContext context) {
    final report = widget.report;
    final level = _levels[report.waterLevel];
    final location = report.location?.trim() ?? '';
    final reporter = report.reporterName?.trim() ?? '';
    final name = reporter.isNotEmpty
        ? reporter.split('@').first
        : report.isQuick
            ? 'Guest'
            : 'Resident';
    final time = report.reportedAt;
    final reason = report.rejectionReason?.trim() ?? '';
    const small = TextStyle(fontSize: 12, color: AppColors.textSecondary);
    return ClayContainer(
      borderRadius: 22,
      padding: const EdgeInsets.all(14),
      onTap: widget.onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    SolidBadge(
                      label: sourceLabel(report.source),
                      color: AppColors.primaryShade,
                      compact: true,
                    ),
                    ReportStatusBadge(
                      status: report.status == 'verified'
                          ? 'approved'
                          : report.status ?? 'pending',
                    ),
                    if (level != null)
                      SolidBadge(
                        label: level,
                        color: _levelColor(report.waterLevel),
                        compact: true,
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  location.isEmpty ? 'Location shared' : location,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.heading(size: 14),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        'By $name',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: small,
                      ),
                    ),
                    if (time != null)
                      Flexible(
                        child: Tooltip(
                          message: DateFormat('MMM d, y h:mm a').format(time),
                          triggerMode: TooltipTriggerMode.longPress,
                          child: Text(
                            ' · ${relativeTime(time.toIso8601String())}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: small,
                          ),
                        ),
                      ),
                  ],
                ),
                if (report.status == 'rejected' && reason.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Rejection reason: $reason',
                    style: const TextStyle(fontSize: 12, color: AppColors.ink),
                  ),
                ],
              ],
            ),
          ),
          if (_photo != null) ...[
            const SizedBox(width: 10),
            _Thumb(photo: _photo),
          ],
        ],
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  final Future<String> photo;

  const _Thumb({required this.photo});

  @override
  Widget build(BuildContext context) {
    const size = 64.0;
    const unavailable = SizedBox(
      width: size,
      height: size,
      child: Icon(
        Icons.image_not_supported_outlined,
        color: AppColors.textSecondary,
        semanticLabel: 'Photo unavailable',
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: FutureBuilder<String>(
        future: photo,
        builder: (context, snapshot) {
          if (snapshot.hasError) return unavailable;
          final url = snapshot.data;
          if (url == null) {
            return Container(width: size, height: size, color: AppColors.border);
          }
          return Image.network(
            url,
            width: size,
            height: size,
            fit: BoxFit.cover,
            semanticLabel: 'Photo sent with the report',
            errorBuilder: (_, __, ___) => unavailable,
          );
        },
      ),
    );
  }
}

/// Full details. The view has neither the approval reason nor the reporter's
/// phone, so this reads the report itself. A community report gets the thread
/// and the advisory box; a Quick Report stays read-only.
class _ReportDetailsScreen extends StatefulWidget {
  final AllReport report;
  final String barangay;

  const _ReportDetailsScreen({required this.report, required this.barangay});

  @override
  State<_ReportDetailsScreen> createState() => _ReportDetailsScreenState();
}

class _ReportDetailsScreenState extends State<_ReportDetailsScreen> {
  late final Future<Widget> _card = _load();

  Future<Widget> _load() async {
    final report = widget.report;
    if (report.isQuick) {
      final row = await BarangayQuickReportsService()
          .fetchOne(report.id, widget.barangay);
      return BarangayQuickCard(report: row);
    }
    final row =
        await ReportRepository().fetchOneInBarangay(report.id, widget.barangay);
    return BarangayCommunityCard(report: row);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Report details')),
      body: SafeArea(
        child: FutureBuilder<Widget>(
          future: _card,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Could not load this report: ${snapshot.error}',
                  style: const TextStyle(color: AppColors.danger),
                ),
              );
            }
            final card = snapshot.data;
            if (card == null) {
              return const Center(child: CircularProgressIndicator());
            }
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [card],
            );
          },
        ),
      ),
    );
  }
}
