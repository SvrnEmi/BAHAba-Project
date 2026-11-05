import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';

import '../../models/community_report_model.dart';
import '../../models/flood_event_model.dart';
import '../../repositories/flood_history_repository.dart';
import '../../theme/app_theme.dart';
import '../../utils/report_display.dart';
import '../../widgets/clay_container.dart';
import '../../widgets/water_level_icon.dart';

/// Where flooding actually happened: approved community and quick reports,
/// colored by water level, filtered by flood event. Never shows who reported.
class BahaHistoryScreen extends StatefulWidget {
  /// Event to select first; null shows all approved reports.
  final int? initialEventId;

  const BahaHistoryScreen({super.key, this.initialEventId});

  @override
  State<BahaHistoryScreen> createState() => _BahaHistoryScreenState();
}

class _BahaHistoryScreenState extends State<BahaHistoryScreen> {
  static const LatLng _odiongan = LatLng(12.4018, 122.0234);
  static final DateFormat _day = DateFormat('MMM d, y');

  final FloodHistoryRepository _repo = FloodHistoryRepository();
  final MapController _map = MapController();

  List<FloodEvent> _events = const [];
  List<HistoryReport> _reports = const [];
  int? _eventId;
  bool _loading = true;
  bool _mapReady = false;
  String? _error;
  int _loadGeneration = 0;

  @override
  void initState() {
    super.initState();
    _eventId = widget.initialEventId;
    _loadEvents();
    _loadReports();
  }

  Future<void> _loadEvents() async {
    try {
      final events = await _repo.events();
      if (mounted) setState(() => _events = events);
    } catch (e) {
      debugPrint('Flood events unavailable: $e');
    }
  }

  /// Only the newest request may update the screen.
  Future<void> _loadReports() async {
    final generation = ++_loadGeneration;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final reports = await _repo.history(eventId: _eventId);
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _reports = reports;
        _loading = false;
      });
      _fitToReports();
    } catch (e) {
      debugPrint('Baha history failed: $e');
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _loading = false;
        _error = 'Could not load flood history. Check your connection.';
      });
    }
  }

  void _fitToReports() {
    if (!_mapReady || _reports.isEmpty) return;
    final points = [for (final r in _reports) LatLng(r.lat, r.lng)];
    if (points.length == 1) {
      _map.move(points.first, 15);
      return;
    }
    _map.fitCamera(CameraFit.coordinates(
      coordinates: points,
      padding: const EdgeInsets.all(48),
      maxZoom: 16,
    ));
  }

  FloodEvent? get _selected {
    for (final e in _events) {
      if (e.id == _eventId) return e;
    }
    return null;
  }

  String _range(FloodEvent e) {
    final start = _day.format(e.startAt);
    final end = _day.format(e.endAt);
    return start == end ? start : '$start - $end';
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selected;
    final count = _reports.length;
    final summary = _loading
        ? 'Loading reports...'
        : '$count verified ${count == 1 ? 'report' : 'reports'}'
            '${selected != null ? ' - ${_range(selected)}' : ''}';

    return Scaffold(
      appBar: AppBar(
        title: Text('Baha History', style: AppText.heading(size: 18)),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: DropdownButtonFormField<int?>(
                // Rebuilt once events arrive, so a preselected event shows.
                key: ValueKey(_events.length),
                initialValue:
                    _events.any((e) => e.id == _eventId) ? _eventId : null,
                isExpanded: true,
                itemHeight: 56,
                decoration: const InputDecoration(
                  labelText: 'Flood event',
                  prefixIcon: Icon(Icons.event_outlined),
                ),
                items: [
                  const DropdownMenuItem<int?>(
                    value: null,
                    child: Text('All verified reports'),
                  ),
                  for (final e in _events)
                    DropdownMenuItem<int?>(
                      value: e.id,
                      child: Text(
                        '${e.name} (${_range(e)})',
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
                onChanged: (id) {
                  setState(() => _eventId = id);
                  _loadReports();
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              child: Text(
                summary,
                style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink),
              ),
            ),
            Expanded(
              child: Stack(
                children: [
                  Positioned.fill(
                    child: FlutterMap(
                      mapController: _map,
                      options: MapOptions(
                        initialCenter: _odiongan,
                        initialZoom: 13,
                        onMapReady: () {
                          _mapReady = true;
                          _fitToReports();
                        },
                      ),
                      children: [
                        TileLayer(
                          urlTemplate:
                              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                          userAgentPackageName: 'com.bahaba.app',
                        ),
                        MarkerLayer(
                          markers: [
                            // Deepest last, so it draws on top.
                            for (final r in [..._reports]..sort((a, b) =>
                                a.waterLevel.index.compareTo(b.waterLevel.index)))
                              Marker(
                                point: LatLng(r.lat, r.lng),
                                width: 48,
                                height: 48,
                                child: _ReportMarker(
                                  report: r,
                                  onTap: () => _showReport(r),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (_loading)
                    const Positioned(
                      top: 12,
                      left: 0,
                      right: 0,
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  if (!_loading && (_error != null || _reports.isEmpty))
                    Positioned(
                      top: 12,
                      left: 16,
                      right: 16,
                      child: _MapNotice(
                        text: _error ??
                            (selected == null
                                ? 'No verified flood reports yet.'
                                : 'No verified reports during ${selected.name}.'),
                        onRetry: _error != null ? _loadReports : null,
                      ),
                    ),
                ],
              ),
            ),
            const _Legend(),
          ],
        ),
      ),
    );
  }

  void _showReport(HistoryReport report) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ReportSheet(report: report, repo: _repo),
    );
  }
}

class _ReportMarker extends StatelessWidget {
  final HistoryReport report;
  final VoidCallback onTap;

  const _ReportMarker({required this.report, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = WaterLevelIcon.colorFor(report.waterLevel);
    return Semantics(
      button: true,
      label: '${waterLevelLabel(report.waterLevel)} flood report. '
          'Tap for details.',
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Center(
          child: Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 3),
              boxShadow: const [
                BoxShadow(color: Color(0x55000000), blurRadius: 4),
              ],
            ),
            child: const Icon(Icons.water_drop, size: 15, color: Colors.white),
          ),
        ),
      ),
    );
  }
}

class _MapNotice extends StatelessWidget {
  final String text;
  final VoidCallback? onRetry;

  const _MapNotice({required this.text, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 3,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Row(
          children: [
            const Icon(Icons.info_outline, color: AppColors.textSecondary),
            const SizedBox(width: 10),
            Expanded(
              child: Text(text, style: const TextStyle(fontSize: 14)),
            ),
            if (onRetry != null)
              TextButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

/// Water level colors, same scale as reports.
class _Legend extends StatelessWidget {
  const _Legend();

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      margin: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      borderRadius: 18,
      child: Row(
        children: [
          for (final level in WaterLevel.values)
            Expanded(
              child: Column(
                children: [
                  WaterLevelIcon(level: level, size: 30),
                  const SizedBox(height: 4),
                  Text(
                    waterLevelLabel(level),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12, color: AppColors.ink),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Water level, date, barangay and photo. Nothing about the reporter.
class _ReportSheet extends StatelessWidget {
  final HistoryReport report;
  final FloodHistoryRepository repo;

  const _ReportSheet({required this.report, required this.repo});

  @override
  Widget build(BuildContext context) {
    final when = DateFormat('MMM d, y - h:mm a').format(report.reportedAt);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                WaterLevelIcon(level: report.waterLevel, size: 56),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        waterLevelLabel(report.waterLevel),
                        style: AppText.heading(
                          size: 20,
                          color: WaterLevelIcon.colorFor(report.waterLevel),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(when,
                          style: const TextStyle(
                              fontSize: 15, color: AppColors.ink)),
                      if (report.barangay?.isNotEmpty ?? false)
                        Text(
                          'Brgy. ${report.barangay}',
                          style: const TextStyle(
                              fontSize: 14, color: AppColors.textSecondary),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (report.hasPhoto)
              FutureBuilder<String?>(
                future: repo.photoUrl(report),
                builder: (context, snap) {
                  if (snap.connectionState != ConnectionState.done) {
                    return const SizedBox(
                      height: 200,
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  final url = snap.data;
                  if (url == null) return const _NoPhoto();
                  return ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Image.network(
                      url,
                      height: 240,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      semanticLabel: 'Photo of the flooding',
                      // Low-end phones: decode at display size.
                      cacheHeight: 480,
                      errorBuilder: (_, __, ___) => const _NoPhoto(),
                    ),
                  );
                },
              )
            else
              const _NoPhoto(),
          ],
        ),
      ),
    );
  }
}

class _NoPhoto extends StatelessWidget {
  const _NoPhoto();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 72,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.field,
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Text('No photo for this report',
          style: TextStyle(color: AppColors.textSecondary)),
    );
  }
}
