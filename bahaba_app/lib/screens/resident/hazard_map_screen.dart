import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:geolocator/geolocator.dart';

import '../../models/barangay_model.dart';
import '../../providers/resident_providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/clay_container.dart';
import '../../widgets/risk_badge.dart';
import '../../widgets/screen_header.dart';

/// GIS Hazard Map using OpenStreetMap (flutter_map).
/// Shows barangay flood zones as colored circles + markers, and the user's
/// current GPS location.
class HazardMapScreen extends StatefulWidget {
  const HazardMapScreen({super.key});

  @override
  State<HazardMapScreen> createState() => _HazardMapScreenState();
}

class _HazardMapScreenState extends State<HazardMapScreen> {
  static const double _locateZoom = 16;

  final MapController _mapController = MapController();
  final LatLng _center = const LatLng(12.4018, 122.0234);
  StreamSubscription<Position>? _positionSub;
  Position? _position;
  String? _locationError;
  bool _showLegend = true;
  bool _locating = false;

  LatLng? get _userLocation => _position == null
      ? null
      : LatLng(_position!.latitude, _position!.longitude);

  @override
  void initState() {
    super.initState();
    _startLocationUpdates();
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    super.dispose();
  }

  /// Checks service + permission, then follows the device position. The map
  /// recenters on the first fix only; after that, "My location" recenters.
  Future<void> _startLocationUpdates() async {
    if (_positionSub != null) return;
    setState(() {
      _locating = true;
      _locationError = null;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        _setLocationError(
          "Couldn't get your location. Try moving near a window or turning on GPS.",
        );
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.deniedForever) {
        _setLocationError(
          'Location is blocked. Allow location for BAHAba in your phone settings.',
        );
        if (mounted) await _showLocationBlockedDialog();
        return;
      }
      if (permission == LocationPermission.denied) {
        _setLocationError('Location permission was not granted.');
        return;
      }

      var firstFix = true;
      _positionSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.best,
          distanceFilter: 5,
        ),
      ).listen(
        (position) {
          if (!mounted) return;
          setState(() {
            _position = position;
            _locating = false;
            _locationError = null;
          });
          if (firstFix) {
            firstFix = false;
            _mapController.move(_userLocation!, _locateZoom);
          }
        },
        onError: (Object _) => _setLocationError(
          "Couldn't get your location. Try moving near a window or turning on GPS.",
        ),
      );
    } catch (_) {
      _setLocationError(
        "Couldn't get your location. Try moving near a window or turning on GPS.",
      );
    }
  }

  void _setLocationError(String message) {
    if (!mounted) return;
    setState(() {
      _locating = false;
      _locationError = message;
    });
  }

  Future<void> _showLocationBlockedDialog() {
    return showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon:
            const Icon(Icons.location_off, color: AppColors.riskHigh, size: 40),
        title: const Text('Location is blocked'),
        content: const Text(
          'BAHAba needs location access to show where you are on the hazard '
          'map. Turn it on for BAHAba in your phone settings.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Not now'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              Geolocator.openAppSettings();
            },
            child: const Text('Open settings'),
          ),
        ],
      ),
    );
  }

  void _goToMyLocation() {
    final here = _userLocation;
    if (here != null) {
      _mapController.move(here, _locateZoom);
    } else {
      _positionSub?.cancel();
      _positionSub = null;
      _startLocationUpdates();
    }
  }

  /// Nearest barangay (straight-line distance) to the user's position.
  Barangay? _nearestBarangay(List<Barangay> barangays) {
    final here = _userLocation;
    if (here == null || barangays.isEmpty) return null;
    const distance = Distance();
    Barangay? best;
    var bestMeters = double.infinity;
    for (final b in barangays) {
      final meters = distance(here, LatLng(b.lat, b.lng));
      if (meters < bestMeters) {
        bestMeters = meters;
        best = b;
      }
    }
    return best;
  }

  Color _riskColor(FloodRisk risk) {
    switch (risk) {
      case FloodRisk.high:
        return AppColors.riskHigh;
      case FloodRisk.medium:
        return AppColors.riskMedium;
      case FloodRisk.low:
        return AppColors.riskLow;
    }
  }

  void _centerOnBarangay(Barangay b) {
    _mapController.move(LatLng(b.lat, b.lng), 15);
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<BarangayProvider>();
    final barangays = provider.barangays;

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header
          const ScreenHeader(
            title: 'GIS Hazard Map',
            subtitle: 'OpenStreetMap • Odiongan flood zones',
            icon: Icons.map_outlined,
            chipColor: AppColors.mint,
            // Online/offline indicator
            trailing: ClayContainer(
              borderRadius: 20,
              padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              child: Row(
                children: [
                  Icon(Icons.wifi, color: AppColors.ink, size: 14),
                  SizedBox(width: 4),
                  Text(
                    'Online',
                    style: TextStyle(color: AppColors.ink, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),

          // Map
          ClayContainer(
            margin: const EdgeInsets.symmetric(horizontal: 18),
            padding: const EdgeInsets.all(6),
            borderRadius: 26,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: SizedBox(
                height: 300,
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: FlutterMap(
                        mapController: _mapController,
                        options: MapOptions(
                          initialCenter: _center,
                          initialZoom: 13,
                          interactionOptions: const InteractionOptions(
                              flags: InteractiveFlag.all),
                        ),
                        children: [
                          TileLayer(
                            urlTemplate:
                                'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                            userAgentPackageName: 'com.bahaba.app',
                          ),
                          // Flood zone circles
                          for (final b in barangays)
                            CircleLayer(
                              circles: [
                                CircleMarker(
                                  point: LatLng(b.lat, b.lng),
                                  radius: 80,
                                  useRadiusInMeter: true,
                                  color: _riskColor(b.floodRisk)
                                      .withValues(alpha: 0.25),
                                  borderColor: _riskColor(b.floodRisk),
                                  borderStrokeWidth: 2,
                                ),
                              ],
                            ),
                          // Barangay markers
                          for (final b in barangays)
                            MarkerLayer(
                              markers: [
                                Marker(
                                  point: LatLng(b.lat, b.lng),
                                  width: 36,
                                  height: 36,
                                  child: GestureDetector(
                                    onTap: () => _centerOnBarangay(b),
                                    child: Icon(
                                      Icons.location_pin,
                                      color: _riskColor(b.floodRisk),
                                      size: 36,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          // User location: accuracy circle + blue dot
                          if (_userLocation != null) ...[
                            CircleLayer(
                              circles: [
                                CircleMarker(
                                  point: _userLocation!,
                                  radius: _position!.accuracy,
                                  useRadiusInMeter: true,
                                  color:
                                      AppColors.primary.withValues(alpha: 0.15),
                                  borderColor:
                                      AppColors.primary.withValues(alpha: 0.4),
                                  borderStrokeWidth: 1,
                                ),
                              ],
                            ),
                            MarkerLayer(
                              markers: [
                                Marker(
                                  point: _userLocation!,
                                  width: 20,
                                  height: 20,
                                  child: const _UserDot(),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    // Where am I: nearest barangay, accuracy, errors
                    Positioned(
                      top: 10,
                      left: 10,
                      right: 10,
                      child: _LocationStatus(
                        near: _nearestBarangay(barangays),
                        accuracy: _position?.accuracy,
                        error: _locationError,
                      ),
                    ),
                    // My location
                    Positioned(
                      right: 10,
                      bottom: 24,
                      child: _MapCircleButton(
                        icon: Icons.my_location,
                        tooltip: 'My location',
                        loading: _locating,
                        onTap: _goToMyLocation,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Map overlay buttons
          // Legend toggle + locate button positioned above the map
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
            child: Row(
              children: [
                _IconButton(
                  icon: _showLegend ? Icons.layers : Icons.layers_clear,
                  tooltip: 'Toggle legend',
                  onTap: () => setState(() => _showLegend = !_showLegend),
                ),
              ],
            ),
          ),

          // Legend
          if (_showLegend)
            ClayContainer(
              margin: const EdgeInsets.all(18),
              borderRadius: 22,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Flood Risk Levels',
                    style: AppText.heading(size: 15),
                  ),
                  const SizedBox(height: 10),
                  const _LegendItem(
                      color: AppColors.riskHigh, label: 'High Risk (2m+)'),
                  const SizedBox(height: 6),
                  const _LegendItem(
                      color: AppColors.riskMedium, label: 'Medium Risk (1-2m)'),
                  const SizedBox(height: 6),
                  const _LegendItem(
                      color: AppColors.riskLow, label: 'Low Risk (<1m)'),
                ],
              ),
            )
          else
            const SizedBox(height: 16),

          // Barangay list
          Expanded(
            child: provider.loading
                ? const Center(
                    child: Text('Loading flood zones for Odiongan...'))
                : barangays.isEmpty
                    ? const Center(
                        child: Text('No flood zones are available yet.'))
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
                        itemCount: barangays.length,
                        itemBuilder: (context, index) {
                          final b = barangays[index];
                          // RepaintBoundary: keeps clay shadows from repainting on scroll.
                          return RepaintBoundary(
                            child: ClayContainer(
                              margin: const EdgeInsets.only(bottom: 12),
                              borderRadius: 20,
                              padding: EdgeInsets.zero,
                              child: ListTile(
                                leading: Container(
                                  width: 12,
                                  height: 12,
                                  decoration: BoxDecoration(
                                    color: _riskColor(b.floodRisk),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                title: Text(
                                  b.name,
                                  style: AppText.heading(
                                      size: 16, weight: FontWeight.w700),
                                ),
                                subtitle: Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Wrap(
                                    spacing: 8,
                                    runSpacing: 4,
                                    crossAxisAlignment:
                                        WrapCrossAlignment.center,
                                    children: [
                                      RiskBadge(
                                          risk: b.floodRisk, compact: true),
                                      Text(
                                        b.waterLevel,
                                        style: const TextStyle(fontSize: 12),
                                      ),
                                    ],
                                  ),
                                ),
                                trailing: TextButton(
                                  onPressed: () =>
                                      _showBarangayDetails(context, b),
                                  child: const Text('View'),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  void _showBarangayDetails(BuildContext context, Barangay b) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _BarangayDetailSheet(barangay: b),
    );
  }
}

class _IconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _IconButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: ClayContainer(
        circle: true,
        width: 48,
        height: 48,
        padding: EdgeInsets.zero,
        semanticLabel: tooltip,
        onTap: onTap,
        child: Center(
          child: Icon(icon, size: 22, color: AppColors.primary),
        ),
      ),
    );
  }
}

/// White 48x48 round button floating on the map (flat, map overlays are
/// never clay).
class _MapCircleButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final bool loading;

  const _MapCircleButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.white,
        shape: const CircleBorder(),
        elevation: 3,
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: loading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(icon, size: 22, color: AppColors.primary),
            ),
          ),
        ),
      ),
    );
  }
}

/// Blue "you are here" dot with a white border.
class _UserDot extends StatelessWidget {
  const _UserDot();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Your location',
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.primary,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 3),
          boxShadow: const [
            BoxShadow(
                color: Color(0x591E2A38), blurRadius: 4, offset: Offset(0, 1)),
          ],
        ),
      ),
    );
  }
}

/// "You are near <Barangay> · <level>" pill, plus approximate-accuracy and
/// error notes. Flat white so it stays readable over map tiles.
class _LocationStatus extends StatelessWidget {
  final Barangay? near;
  final double? accuracy;
  final String? error;

  const _LocationStatus({this.near, this.accuracy, this.error});

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[
      if (near != null)
        _pill(
          'You are near ${near!.name} · ${near!.floodRisk.label}',
          bold: true,
        ),
      if (accuracy != null && accuracy! > 100)
        _pill('Approximate location (±${accuracy!.round()} m)'),
      if (error != null)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: const BoxDecoration(
            color: Colors.white,
            border:
                Border(left: BorderSide(color: AppColors.riskHigh, width: 4)),
          ),
          child: Text(
            error!,
            style: const TextStyle(color: AppColors.ink, fontSize: 12),
          ),
        ),
    ];
    if (children.isEmpty) return const SizedBox.shrink();
    return Semantics(
      liveRegion: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final child in children)
            Padding(padding: const EdgeInsets.only(bottom: 6), child: child),
        ],
      ),
    );
  }

  static Widget _pill(String text, {bool bold = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        boxShadow: const [
          BoxShadow(
              color: Color(0x331E2A38), blurRadius: 4, offset: Offset(0, 1)),
        ],
      ),
      child: Text(
        text,
        style: TextStyle(
          color: bold ? AppColors.ink : AppColors.textSecondary,
          fontSize: 12,
          fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
        ),
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  final Color color;
  final String label;

  const _LegendItem({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Text(label, style: const TextStyle(fontSize: 13)),
      ],
    );
  }
}

/// Bottom-sheet detail view for a barangay flood zone.
class _BarangayDetailSheet extends StatelessWidget {
  final Barangay barangay;

  const _BarangayDetailSheet({required this.barangay});

  @override
  Widget build(BuildContext context) {
    final riskColor = _colorFor(barangay.floodRisk);
    final onRisk = AppColors.onBadge(riskColor);

    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      padding: const EdgeInsets.all(24),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.8,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        barangay.name,
                        style: AppText.heading(size: 22),
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Flood Zone Details',
                        style: TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                  tooltip: 'Close',
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Risk banner: solid, high contrast, always labelled.
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.badgeFill(riskColor),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.warning_amber_rounded,
                    color: onRisk,
                    size: 32,
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Current Risk Level',
                        style: TextStyle(color: onRisk, fontSize: 13),
                      ),
                      Text(
                        barangay.floodRisk.label,
                        style: TextStyle(
                          color: onRisk,
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Stats grid
            Row(
              children: [
                Expanded(
                  child: _StatCard(
                    icon: Icons.water_drop,
                    color: AppColors.lavender,
                    label: 'Water Level',
                    value: barangay.waterLevel,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: _StatCard(
                    icon: Icons.people_outline,
                    color: AppColors.mint,
                    label: 'Population',
                    value: barangay.population,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _StatCard(
                    icon: Icons.campaign,
                    color: AppColors.peach,
                    label: 'Evacuated',
                    value: barangay.evacuated,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: _StatCard(
                    icon: Icons.schedule,
                    color: AppColors.lavender,
                    label: 'Last Update',
                    value: barangay.lastUpdate,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // GPS
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'GPS Coordinates',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${barangay.lat.toStringAsFixed(4)}, ${barangay.lng.toStringAsFixed(4)}',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Description
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                barangay.description,
                style: const TextStyle(fontSize: 14, height: 1.5),
              ),
            ),
            const SizedBox(height: 24),

            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
  }

  Color _colorFor(FloodRisk risk) {
    switch (risk) {
      case FloodRisk.high:
        return AppColors.riskHigh;
      case FloodRisk.medium:
        return AppColors.riskMedium;
      case FloodRisk.low:
        return AppColors.riskLow;
    }
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final String value;

  const _StatCard({
    required this.icon,
    required this.color,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      borderRadius: 20,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ClayIconChip(icon: icon, color: color, size: 30, iconSize: 16),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: AppText.heading(size: 17, weight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
