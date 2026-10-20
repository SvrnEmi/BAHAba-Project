import 'dart:io';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';

import '../../models/community_report_model.dart';
import '../../providers/app_state.dart';
import '../../repositories/report_repository.dart';
import '../../theme/app_theme.dart';
import '../../widgets/clay_container.dart';
import '../../widgets/flat_status_card.dart';
import '../../widgets/report_messages_section.dart';
import '../../widgets/report_status_badge.dart';
import '../../widgets/screen_header.dart';

/// Community Reports screen — submit flood observations with GPS + photo.
///
/// This screen manages its own two live Supabase streams directly:
///   - "My Reports": every report the current user submitted, any status
///   - "Recent Reports": the public feed, APPROVED reports only
/// It intentionally does not rely on a shared ReportProvider for display,
/// since a single shared provider previously caused the public feed to
/// accidentally show unapproved reports depending on how/where that
/// provider's load() was called elsewhere in the app.
class CommunityReportsScreen extends StatefulWidget {
  const CommunityReportsScreen({super.key});

  @override
  State<CommunityReportsScreen> createState() => _CommunityReportsScreenState();
}

class _CommunityReportsScreenState extends State<CommunityReportsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _locationController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _reportRepo = ReportRepository();

  bool _showForm = false;
  bool _gpsLoading = false;
  bool _submitting = false;
  LatLng? _gpsLocation;
  String? _photoPath;
  WaterLevel? _selectedLevel;

  Stream<List<CommunityReport>>? _myReportsStream;
  Stream<List<CommunityReport>>? _approvedReportsStream;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final currentUserName =
        context.read<AppState>().currentUser?.fullName ?? '';
    _myReportsStream ??= currentUserName.isEmpty
        ? const Stream<List<CommunityReport>>.empty()
        : _reportRepo.watchByUserName(currentUserName);
    _approvedReportsStream ??= _reportRepo.watchApproved();
  }

  @override
  void dispose() {
    _locationController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  /// Ensures [permission] is granted before a feature uses it. Requests it
  /// if it hasn't been granted yet; if the user still says no, shows a
  /// SnackBar explaining why with a retry (or Open Settings) action.
  Future<bool> _ensurePermission(
    Permission permission, {
    required String reason,
    required VoidCallback onRetry,
  }) async {
    var status = await permission.status;
    if (status.isGranted || status.isLimited) return true;
    if (!status.isPermanentlyDenied && !status.isRestricted) {
      status = await permission.request();
      if (status.isGranted || status.isLimited) return true;
    }
    if (!mounted) return false;

    final permanentlyDenied = status.isPermanentlyDenied || status.isRestricted;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            permanentlyDenied
                ? '$reason Turn it on in your phone settings.'
                : reason,
          ),
          action: permanentlyDenied
              ? const SnackBarAction(
                  label: 'Open Settings',
                  onPressed: openAppSettings,
                )
              : SnackBarAction(label: 'Allow', onPressed: onRetry),
        ),
      );
    return false;
  }

  Future<void> _captureGPS() async {
    final allowed = await _ensurePermission(
      Permission.locationWhenInUse,
      reason:
          'Location access is needed to add GPS coordinates to your report.',
      onRetry: _captureGPS,
    );
    if (!allowed || !mounted) return;

    setState(() => _gpsLoading = true);
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      if (!mounted) return;
      setState(() {
        _gpsLocation = LatLng(pos.latitude, pos.longitude);
        if (_locationController.text.isEmpty) {
          _locationController.text =
              'GPS Location (${pos.latitude.toStringAsFixed(4)}, ${pos.longitude.toStringAsFixed(4)})';
        }
      });
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Unable to get your location. Check permissions.'),
          backgroundColor: AppColors.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _gpsLoading = false);
    }
  }

  Future<void> _pickPhoto() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1280,
      maxHeight: 1280,
      imageQuality: 80,
    );
    if (file != null) {
      setState(() => _photoPath = file.path);
    }
  }

  Future<void> _takePhoto() async {
    final allowed = await _ensurePermission(
      Permission.camera,
      reason: 'Camera access is needed to take a photo of the flooding.',
      onRetry: _takePhoto,
    );
    if (!allowed || !mounted) return;

    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1280,
      maxHeight: 1280,
      imageQuality: 80,
    );
    if (file != null) {
      setState(() => _photoPath = file.path);
    }
  }

  Future<void> _submitReport() async {
    if (!_formKey.currentState!.validate()) return;
    if (_gpsLocation == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please capture your GPS location first.'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    final appState = context.read<AppState>();
    setState(() => _submitting = true);

    try {
      debugPrint('Submitting report...');
      await _reportRepo.submit(
        userName: appState.currentUser?.fullName ?? 'Resident',
        location: _locationController.text.trim(),
        lat: _gpsLocation?.latitude,
        lng: _gpsLocation?.longitude,
        waterLevel: _selectedLevel ?? WaterLevel.ankle,
        description: _descriptionController.text.trim(),
        photoPath: _photoPath,
      );
      debugPrint('Report submitted successfully.');
    } catch (e) {
      debugPrint('Report submission failed: $e');
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Unable to submit report: $e'),
          backgroundColor: AppColors.danger,
        ),
      );
      return;
    }

    if (!mounted) return;
    setState(() {
      _submitting = false;
      _showForm = false;
      _gpsLocation = null;
      _photoPath = null;
      _selectedLevel = null;
      _locationController.clear();
      _descriptionController.clear();
    });

    debugPrint('Showing submission confirmation dialog.');
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.check_circle_outline,
            color: AppColors.success, size: 48),
        title: const Text('Report Submitted'),
        content: const Text(
          "Your report has been submitted. Please wait for the MDRRMO's approval before it appears in the community feed.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ScreenHeader(
            title: 'Community Reports',
            subtitle: 'Crowdsourced flood observations',
            icon: Icons.groups_outlined,
            chipColor: AppColors.lavender,
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
              children: [
                if (!_showForm)
                  ElevatedButton.icon(
                    onPressed: () => setState(() => _showForm = true),
                    icon: const Icon(Icons.add_a_photo),
                    label: const Text('Submit Flood Report'),
                  ),
                if (_showForm) _buildForm(),
                const SizedBox(height: 20),
                Text(
                  'My Reports',
                  style: AppText.heading(size: 18),
                ),
                const SizedBox(height: 12),
                StreamBuilder<List<CommunityReport>>(
                  stream: _myReportsStream,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const _EmptyBox(
                          message: 'Checking your submitted reports...');
                    }
                    if (snapshot.hasError) {
                      return _ErrorBox(message: snapshot.error.toString());
                    }
                    final myReports = snapshot.data ?? [];
                    if (myReports.isEmpty) {
                      return const _EmptyBox(
                        message: 'You have not submitted any reports yet.',
                      );
                    }
                    return Column(
                      children: [
                        for (final report in myReports)
                          _ReportCard(
                              key: ValueKey(report.id),
                              report: report,
                              showMessages: true),
                      ],
                    );
                  },
                ),
                const SizedBox(height: 20),
                Text(
                  'Recent Reports',
                  style: AppText.heading(size: 18),
                ),
                const SizedBox(height: 12),
                StreamBuilder<List<CommunityReport>>(
                  stream: _approvedReportsStream,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const _EmptyBox(
                          message: 'Checking approved community reports...');
                    }
                    if (snapshot.hasError) {
                      return _ErrorBox(message: snapshot.error.toString());
                    }
                    final approved = snapshot.data ?? [];
                    if (approved.isEmpty) {
                      return const _EmptyBox(message: 'No reports yet');
                    }
                    return Column(
                      children: [
                        for (final report in approved)
                          _ReportCard(report: report),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildForm() {
    return ClayContainer(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 20),
      borderRadius: 28,
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(
                  'New Report',
                  style: AppText.heading(size: 18),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => setState(() => _showForm = false),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _gpsLoading ? null : _captureGPS,
              icon: _gpsLoading
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.gps_fixed),
              label: Text(
                _gpsLocation != null
                    ? 'GPS Captured'
                    : 'Capture My GPS Location',
              ),
            ),
            if (_gpsLocation != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.mint,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(
                    'Lat: ${_gpsLocation!.latitude.toStringAsFixed(6)}\n'
                    'Lng: ${_gpsLocation!.longitude.toStringAsFixed(6)}',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: AppColors.ink,
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _locationController,
              decoration: const InputDecoration(
                labelText: 'Location',
                prefixIcon: Icon(Icons.location_on_outlined),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Enter a location' : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<WaterLevel>(
              initialValue: _selectedLevel,
              decoration: const InputDecoration(
                labelText: 'Water Level',
                prefixIcon: Icon(Icons.water_drop_outlined),
              ),
              items: WaterLevel.values
                  .map((w) => DropdownMenuItem(value: w, child: Text(w.label)))
                  .toList(),
              onChanged: (v) => setState(() => _selectedLevel = v),
              validator: (v) => v == null ? 'Select water level' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _descriptionController,
              decoration: const InputDecoration(
                labelText: 'Description',
                alignLabelWithHint: true,
              ),
              maxLines: 3,
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? 'Describe the situation'
                  : null,
            ),
            const SizedBox(height: 12),
            if (_photoPath != null)
              Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: Image.file(
                      File(_photoPath!),
                      height: 160,
                      width: double.infinity,
                      fit: BoxFit.cover,
                    ),
                  ),
                  Positioned(
                    top: 8,
                    right: 8,
                    child: IconButton(
                      onPressed: () => setState(() => _photoPath = null),
                      icon: const Icon(Icons.close, color: Colors.white),
                      style: IconButton.styleFrom(
                          backgroundColor: AppColors.danger),
                    ),
                  ),
                ],
              )
            else
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pickPhoto,
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text('Gallery'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _takePhoto,
                      icon: const Icon(Icons.camera_alt_outlined),
                      label: const Text('Camera'),
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _submitting ? null : _submitReport,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Submit Report'),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyBox extends StatelessWidget {
  final String message;
  const _EmptyBox({required this.message});

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      borderRadius: 20,
      padding: const EdgeInsets.all(24),
      child: Center(
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(color: AppColors.textSecondary),
        ),
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  final String message;
  const _ErrorBox({required this.message});

  @override
  Widget build(BuildContext context) {
    // Errors stay flat and high contrast.
    return FlatStatusCard(
      accent: AppColors.riskHigh,
      padding: const EdgeInsets.all(16),
      child: Text(
        'Could not load reports: $message',
        style: const TextStyle(
          color: AppColors.danger,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  final CommunityReport report;

  /// Own reports: the Messages thread (which also shows the old reply).
  final bool showMessages;

  const _ReportCard(
      {super.key, required this.report, this.showMessages = false});

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
        child: ClayContainer(
      margin: const EdgeInsets.only(bottom: 16),
      borderRadius: 22,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: AppColors.secondary,
                child: Text(
                  report.userName.isNotEmpty ? report.userName[0] : 'R',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      report.userName,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w600),
                    ),
                    Text(
                      report.timestamp,
                      style: const TextStyle(
                          color: AppColors.textSecondary, fontSize: 11),
                    ),
                  ],
                ),
              ),
              ReportStatusBadge(status: report.status.value),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.location_on,
                  size: 16, color: AppColors.textSecondary),
              const SizedBox(width: 4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(report.location, style: const TextStyle(fontSize: 13)),
                    if (report.lat != null && report.lng != null)
                      Text(
                        'GPS: ${report.lat!.toStringAsFixed(4)}, ${report.lng!.toStringAsFixed(4)}',
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 11,
                          fontFamily: 'monospace',
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(report.description,
              style: const TextStyle(fontSize: 13, height: 1.4)),
          if (report.status == ReportStatus.rejected &&
              report.rejectionReason != null &&
              report.rejectionReason!.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Reason: ${report.rejectionReason}',
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 11,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.water_drop,
                  size: 14, color: AppColors.secondary),
              const SizedBox(width: 4),
              Text('Water level: ${report.waterLevel.label}',
                  style: const TextStyle(fontSize: 12)),
            ],
          ),
          if (showMessages && report.id != null)
            ReportMessagesSection(
              key: ValueKey('messages-${report.id}'),
              reportId: report.id!,
              legacyReply: report.adminReply,
              legacyReplyAt: report.adminReplyAt,
            )
          else if ((report.adminReply ?? '').trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Reply from MDRRMO:',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.4,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    report.adminReply ?? '',
                    style: const TextStyle(fontSize: 13, height: 1.4),
                  ),
                  if (report.adminReplyAt != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        'Sent ${_formatReplyTimestamp(report.adminReplyAt!)}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    ));
  }

  static String _formatReplyTimestamp(String value) {
    final parsed = DateTime.tryParse(value);
    if (parsed == null) return value;
    return parsed.toLocal().toString().replaceFirst('.', ' at ');
  }
}
