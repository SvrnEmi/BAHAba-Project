import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/alert_model.dart';
import '../../repositories/alert_repository.dart';
import '../../theme/app_theme.dart';
import '../../widgets/alert_card.dart';

/// Full list of published alerts for the resident's barangay and all
/// barangays: search (title, message), PAGASA color, source and date
/// filters, sort, and 20 per page (range()).
class AllAlertsScreen extends StatefulWidget {
  final String barangay;

  const AllAlertsScreen({super.key, required this.barangay});

  @override
  State<AllAlertsScreen> createState() => _AllAlertsScreenState();
}

class _AllAlertsScreenState extends State<AllAlertsScreen> {
  static const _pageSize = 20;
  final _repo = AlertRepository();
  final _searchController = TextEditingController();
  Timer? _debounce;

  String _search = '';
  AlertLevel? _level;
  String? _source;
  DateTimeRange? _range;
  String _sort = 'newest';
  int _page = 0;

  List<Alert> _rows = const [];
  int _total = 0;
  bool _loading = true;
  String? _error;
  int _requestId = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final request = ++_requestId;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await _repo.fetchResidentPage(
        barangayName: widget.barangay,
        page: _page,
        search: _search,
        level: _level,
        source: _source,
        from: _range?.start,
        to: _range?.end,
        sort: _sort,
        pageSize: _pageSize,
      );
      if (!mounted || request != _requestId) return;
      setState(() {
        _rows = result.rows;
        _total = result.total;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || request != _requestId) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _changed(VoidCallback update) {
    setState(() {
      update();
      _page = 0;
    });
    _load();
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 2),
      lastDate: now,
      initialDateRange: _range,
    );
    if (picked != null) _changed(() => _range = picked);
  }

  @override
  Widget build(BuildContext context) {
    final pages = (_total / _pageSize).ceil().clamp(1, 1 << 30);
    final dateLabel = _range == null
        ? 'Any date'
        : '${MaterialLocalizations.of(context).formatShortDate(_range!.start)} - '
            '${MaterialLocalizations.of(context).formatShortDate(_range!.end)}';

    return Scaffold(
      appBar: AppBar(title: const Text('All alerts')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            Text(
              widget.barangay.isEmpty
                  ? 'Published alerts for all barangays'
                  : 'Published alerts for ${widget.barangay} and all barangays',
              style: const TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _searchController,
              textInputAction: TextInputAction.search,
              decoration: const InputDecoration(
                labelText: 'Search title or message',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (text) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 350),
                    () => _changed(() => _search = text));
              },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<AlertLevel?>(
              initialValue: _level,
              decoration: const InputDecoration(labelText: 'PAGASA color'),
              items: [
                const DropdownMenuItem(value: null, child: Text('All colors')),
                for (final level in AlertLevel.values)
                  DropdownMenuItem(value: level, child: Text(level.pagasaText)),
              ],
              onChanged: (v) => _changed(() => _level = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _source,
              decoration: const InputDecoration(labelText: 'Source'),
              items: const [
                DropdownMenuItem(value: null, child: Text('All sources')),
                DropdownMenuItem(value: 'barangay', child: Text('Barangay')),
                DropdownMenuItem(value: 'mdrrmo', child: Text('MDRRMO')),
                DropdownMenuItem(value: 'auto', child: Text('Automatic')),
              ],
              onChanged: (v) => _changed(() => _source = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _sort,
              decoration: const InputDecoration(labelText: 'Sort'),
              items: const [
                DropdownMenuItem(value: 'newest', child: Text('Newest first')),
                DropdownMenuItem(value: 'oldest', child: Text('Oldest first')),
                DropdownMenuItem(
                    value: 'level', child: Text('Level: high to low')),
                DropdownMenuItem(
                    value: 'barangay', child: Text('Barangay A to Z')),
              ],
              onChanged: (v) => _changed(() => _sort = v ?? 'newest'),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                OutlinedButton.icon(
                  onPressed: _pickRange,
                  icon: const Icon(Icons.date_range),
                  label: Text(dateLabel),
                ),
                if (_range != null)
                  TextButton(
                    onPressed: () => _changed(() => _range = null),
                    child: const Text('Clear dates'),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Semantics(
              liveRegion: true,
              child: Text(
                _loading
                    ? 'Loading...'
                    : '$_total ${_total == 1 ? 'alert' : 'alerts'}',
                style: const TextStyle(
                    color: AppColors.textSecondary, fontSize: 12),
              ),
            ),
            const SizedBox(height: 8),
            if (_error != null)
              Text('Could not load alerts: $_error',
                  style: const TextStyle(color: AppColors.danger))
            else if (!_loading && _rows.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: Text('No alerts match these filters.',
                      style: TextStyle(color: AppColors.textSecondary)),
                ),
              )
            else
              for (final alert in _rows)
                AlertCard(
                  key: ValueKey('all-alert-${alert.id}'),
                  alert: alert,
                  margin: const EdgeInsets.only(bottom: 8),
                ),
            if (pages > 1)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    TextButton.icon(
                      onPressed: _page == 0 || _loading
                          ? null
                          : () {
                              setState(() => _page--);
                              _load();
                            },
                      icon: const Icon(Icons.chevron_left),
                      label: const Text('Previous'),
                    ),
                    Text('Page ${_page + 1} of $pages'),
                    TextButton.icon(
                      onPressed: _page + 1 >= pages || _loading
                          ? null
                          : () {
                              setState(() => _page++);
                              _load();
                            },
                      icon: const Icon(Icons.chevron_right),
                      label: const Text('Next'),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
