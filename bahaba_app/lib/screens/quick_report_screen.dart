import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';

import '../services/quick_report_service.dart';
import '../theme/app_theme.dart';
import '../widgets/clay_container.dart';
import '../widgets/hotline_buttons.dart';
import '../widgets/brand_logo.dart';
import 'legal_screen.dart';
import 'register_screen.dart';

/// Public flood report, no account needed (same flow as the web app's
/// /quick-report). Pushed from the login screen; it never reads the session.
class QuickReportScreen extends StatefulWidget {
  const QuickReportScreen({super.key});

  @override
  State<QuickReportScreen> createState() => _QuickReportScreenState();
}

enum _Phase { loading, statusError, ready, sent }

class _QuickReportScreenState extends State<QuickReportScreen> {
  final _service = QuickReportService.instance;

  _Phase _phase = _Phase.loading;
  String? _statusError;
  QuickReportStatus? _status;
  int _remainingAfterSend = 0;
  bool _photoFailed = false;
  int _formKey = 0; // new form after "Send another"

  @override
  void initState() {
    super.initState();
    _loadStatus();
  }

  Future<void> _loadStatus() async {
    setState(() => _phase = _Phase.loading);
    try {
      final status = await _service.status();
      if (!mounted) return;
      setState(() {
        _status = status;
        _phase = _Phase.ready;
      });
    } on QuickReportException catch (e) {
      if (!mounted) return;
      setState(() {
        _statusError = e.message;
        _phase = _Phase.statusError;
      });
    }
  }

  void _openRegister() {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterScreen()));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const BrandAppBarTitle(child: Text('Quick Report'))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 32),
          children: [
            const _Notice(
              tone: _Tone.error,
              text: 'In an emergency call 911 or the MDRRMO first.',
            ),
            const SizedBox(height: 16),
            ..._body(),
            const SizedBox(height: 24),
            _LegalLinks(),
          ],
        ),
      ),
    );
  }

  List<Widget> _body() {
    switch (_phase) {
      case _Phase.loading:
        return const [
          ClayContainer(
            borderRadius: 20,
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          ),
        ];
      case _Phase.statusError:
        return [
          _Notice(tone: _Tone.error, text: _statusError ?? "We couldn't reach the Quick Report service."),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: _loadStatus, child: const Text('Try again')),
          const SizedBox(height: 16),
          const HotlineButtons(),
        ];
      case _Phase.ready:
        final status = _status!;
        if (status.blocked) {
          return const [
            _Notice(
              tone: _Tone.error,
              text: 'This device can no longer send Quick Reports. Please call the MDRRMO or 911.',
            ),
            SizedBox(height: 16),
            HotlineButtons(),
          ];
        }
        if (status.remaining <= 0) {
          return [
            const _Notice(
              tone: _Tone.info,
              text: 'You have used all 3 Quick Reports. Create an account to keep reporting.',
            ),
            const SizedBox(height: 12),
            ElevatedButton(onPressed: _openRegister, child: const Text('Sign up')),
            const SizedBox(height: 16),
            const HotlineButtons(),
          ];
        }
        return [
          _ReportForm(
            key: ValueKey(_formKey),
            remaining: status.remaining,
            onSent: (remaining, photoFailed) => setState(() {
              _remainingAfterSend = remaining;
              _photoFailed = photoFailed;
              _phase = _Phase.sent;
            }),
            onBlocked: () => setState(() {
              _status = QuickReportStatus(max: status.max, remaining: status.remaining, blocked: true);
            }),
          ),
        ];
      case _Phase.sent:
        return [
          ClayContainer(
            borderRadius: 24,
            padding: const EdgeInsets.all(22),
            child: Column(
              children: [
                const Icon(Icons.check_circle, size: 48, color: AppColors.riskLow),
                const SizedBox(height: 10),
                Text(
                  'Report sent. The MDRRMO will review it.',
                  textAlign: TextAlign.center,
                  style: AppText.heading(size: 18),
                ),
                const SizedBox(height: 8),
                Text(
                  _remainingAfterSend > 0
                      ? 'You can send $_remainingAfterSend more Quick Report${_remainingAfterSend == 1 ? '' : 's'}.'
                      : 'You have used all 3 Quick Reports. Create an account to keep reporting.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          if (_photoFailed) ...[
            const SizedBox(height: 12),
            const _Notice(
              tone: _Tone.error,
              text: 'Your report was sent, but the photo could not be uploaded.',
            ),
          ],
          const SizedBox(height: 16),
          if (_remainingAfterSend > 0) ...[
            ElevatedButton(
              onPressed: () {
                setState(() => _formKey++);
                _loadStatus();
              },
              child: const Text('Send another'),
            ),
            const SizedBox(height: 10),
          ],
          OutlinedButton(onPressed: _openRegister, child: const Text('Create an account')),
          const SizedBox(height: 16),
          const HotlineButtons(),
        ];
    }
  }
}

class _ReportForm extends StatefulWidget {
  final int remaining;
  final void Function(int remaining, bool photoFailed) onSent;
  final VoidCallback onBlocked;

  const _ReportForm({
    super.key,
    required this.remaining,
    required this.onSent,
    required this.onBlocked,
  });

  @override
  State<_ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends State<_ReportForm> {
  final _service = QuickReportService.instance;
  final _landmark = TextEditingController();
  final _description = TextEditingController();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  // Honeypot for parity with the web form. Never shown or filled; the
  // request always sends website: "".
  final _website = TextEditingController();

  WaterLevel? _level;
  List<String> _barangays = QuickReportService.fallbackBarangays;
  String? _barangay;
  Position? _position;
  bool _locating = false;
  String? _locationNote;
  Uint8List? _photo;
  String? _photoExt;
  bool _photoBusy = false;
  String? _photoError;
  bool _sending = false;
  bool _touched = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _service.barangays().then((names) {
      if (mounted) setState(() => _barangays = names);
    });
  }

  @override
  void dispose() {
    _landmark.dispose();
    _description.dispose();
    _name.dispose();
    _phone.dispose();
    _website.dispose();
    super.dispose();
  }

  Future<void> _useLocation() async {
    setState(() {
      _locating = true;
      _locationNote = null;
    });
    String? note;
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        note = 'Location is turned off on this phone. Please choose your barangay instead.';
      } else {
        var permission = await Geolocator.checkPermission();
        if (permission == LocationPermission.denied) {
          permission = await Geolocator.requestPermission();
        }
        if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
          note = "Location wasn't shared, and that's okay. Please choose your barangay instead.";
        } else {
          final pos = await Geolocator.getCurrentPosition(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              timeLimit: Duration(seconds: 15),
            ),
          );
          if (mounted) setState(() => _position = pos);
        }
      }
    } catch (e) {
      debugPrint('Quick Report location failed: $e');
      note = "We couldn't get your location right now. Please choose your barangay instead.";
    }
    if (mounted) {
      setState(() {
        _locating = false;
        _locationNote = note;
      });
    }
  }

  Future<void> _pickPhoto(ImageSource source) async {
    setState(() {
      _photoBusy = true;
      _photoError = null;
    });
    try {
      // The picker scales and re-encodes, keeping the upload small.
      final file = await ImagePicker().pickImage(
        source: source,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 75,
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final name = file.name.toLowerCase();
      final ext = name.endsWith('.png')
          ? 'png'
          : name.endsWith('.webp')
              ? 'webp'
              : (name.endsWith('.jpg') || name.endsWith('.jpeg'))
                  ? 'jpg'
                  : null;
      if (ext == null) {
        _photoError = 'Please choose a JPG, PNG or WebP picture.';
      } else if (bytes.lengthInBytes > QuickReportService.maxPhotoBytes) {
        _photoError = 'That picture is too large. Please choose another one.';
      } else {
        _photo = bytes;
        _photoExt = ext;
      }
    } catch (e) {
      debugPrint('Quick Report photo pick failed: $e');
      _photoError = 'That picture could not be used. Please try another one.';
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  void _choosePhotoSource() {
    showModalBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera),
              title: const Text('Take a photo'),
              onTap: () {
                Navigator.pop(sheet);
                _pickPhoto(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choose from gallery'),
              onTap: () {
                Navigator.pop(sheet);
                _pickPhoto(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  bool get _levelMissing => _level == null;
  bool get _placeMissing => (_barangay == null || _barangay!.isEmpty) && _position == null;

  Future<void> _submit() async {
    if (_sending) return; // no double taps
    setState(() => _touched = true);
    if (_levelMissing || _placeMissing) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final photo = _photo;
      final result = await _service.submit(QuickReportInput(
        waterLevel: _level!,
        barangay: _barangay,
        lat: _position == null ? null : double.parse(_position!.latitude.toStringAsFixed(6)),
        lng: _position == null ? null : double.parse(_position!.longitude.toStringAsFixed(6)),
        landmark: _landmark.text,
        description: _description.text,
        reporterName: _name.text,
        reporterPhone: _phone.text,
        photoExt: photo == null ? null : _photoExt,
      ));
      var photoFailed = false;
      if (photo != null) {
        final upload = result.upload;
        photoFailed = upload == null || !await _service.uploadPhoto(upload, photo, _photoExt ?? 'jpg');
      }
      if (!mounted) return;
      widget.onSent(result.remaining < 0 ? 0 : result.remaining, photoFailed);
    } on QuickReportException catch (e) {
      if (!mounted) return;
      if (e.code == 'blocked') {
        widget.onBlocked();
        return;
      }
      setState(() => _error = e.message);
    } catch (e) {
      debugPrint('Quick Report submit failed: $e');
      if (mounted) setState(() => _error = "We couldn't send that right now. Please try again.");
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final disabled = _sending;
    final remaining = widget.remaining;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Notice(
          tone: _Tone.info,
          text: 'You can send $remaining more Quick Report${remaining == 1 ? '' : 's'}.',
        ),
        const SizedBox(height: 16),

        _Section(
          title: 'How deep is the water? *',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final level in WaterLevel.values) ...[
                Semantics(
                  selected: _level == level,
                  button: true,
                  child: _level == level
                      ? ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(minimumSize: const Size.fromHeight(54)),
                          onPressed: disabled ? null : () => setState(() => _level = level),
                          icon: const Icon(Icons.check_circle),
                          label: Text(level.label, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                        )
                      : OutlinedButton(
                          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(54)),
                          onPressed: disabled ? null : () => setState(() => _level = level),
                          child: Text(level.label, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                        ),
                ),
                const SizedBox(height: 8),
              ],
              if (_touched && _levelMissing) const _FieldError('Choose how deep the water is.'),
            ],
          ),
        ),
        const SizedBox(height: 14),

        _Section(
          title: 'Where?',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue: _barangay,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Barangay'),
                items: [
                  for (final b in _barangays) DropdownMenuItem(value: b, child: Text(b)),
                ],
                onChanged: disabled ? null : (v) => setState(() => _barangay = v),
              ),
              const SizedBox(height: 12),
              if (_position != null)
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Location added ✓ (about ${_position!.accuracy.round()} m)',
                        style: const TextStyle(color: AppColors.ink),
                      ),
                    ),
                    TextButton(
                      onPressed: disabled ? null : () => setState(() => _position = null),
                      child: const Text('Remove'),
                    ),
                  ],
                )
              else
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  onPressed: disabled || _locating ? null : _useLocation,
                  icon: _locating
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.my_location),
                  label: Text(_locating ? 'Getting your location…' : 'Use my location'),
                ),
              if (_locationNote != null) ...[
                const SizedBox(height: 8),
                Text(_locationNote!, style: const TextStyle(color: AppColors.textSecondary)),
              ],
              if (_touched && _placeMissing) const _FieldError('Choose a barangay or use your location.'),
              const SizedBox(height: 12),
              TextField(
                controller: _landmark,
                enabled: !disabled,
                maxLength: 200,
                decoration: const InputDecoration(
                  labelText: 'Landmark (optional)',
                  hintText: 'e.g. near the chapel',
                  counterText: '',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        _Section(
          title: 'Details (optional)',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _description,
                enabled: !disabled,
                maxLength: QuickReportService.descriptionMax,
                minLines: 3,
                maxLines: 6,
                decoration: const InputDecoration(labelText: 'What do you see?'),
              ),
              const SizedBox(height: 8),
              if (_photo != null) ...[
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Image.memory(_photo!, height: 220, fit: BoxFit.cover, semanticLabel: 'Selected flood photo'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: disabled ? null : () => setState(() => _photo = null),
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Remove photo'),
                ),
              ] else
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                  onPressed: disabled || _photoBusy ? null : _choosePhotoSource,
                  icon: _photoBusy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.photo_camera_outlined),
                  label: Text(_photoBusy ? 'Preparing photo…' : 'Take or choose a photo'),
                ),
              if (_photoError != null) _FieldError(_photoError!),
            ],
          ),
        ),
        const SizedBox(height: 14),

        _Section(
          title: 'Your contact (optional)',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Only the MDRRMO can see this. It helps them verify your report.',
                style: TextStyle(color: AppColors.textSecondary),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _name,
                enabled: !disabled,
                maxLength: 100,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Your name', counterText: ''),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _phone,
                enabled: !disabled,
                maxLength: 20,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone', counterText: ''),
              ),
            ],
          ),
        ),

        // Honeypot "website": never visible, never focusable, never filled.
        Offstage(
          child: ExcludeSemantics(
            child: TextField(controller: _website, enabled: false, decoration: const InputDecoration(labelText: 'website')),
          ),
        ),

        if (_error != null) ...[
          const SizedBox(height: 14),
          _Notice(tone: _Tone.error, text: _error!),
        ],
        const SizedBox(height: 18),
        ElevatedButton(
          style: ElevatedButton.styleFrom(minimumSize: const Size.fromHeight(56)),
          onPressed: _sending || _photoBusy ? null : _submit,
          child: _sending
              ? const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white)),
                    SizedBox(width: 10),
                    Text('Sending…'),
                  ],
                )
              : const Text('Send Quick Report'),
        ),
        const SizedBox(height: 16),
        const HotlineButtons(),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final Widget child;
  const _Section({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      borderRadius: 22,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: AppText.heading(size: 15)),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _FieldError extends StatelessWidget {
  final String text;
  const _FieldError(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Semantics(
        liveRegion: true,
        child: Text(text, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
      ),
    );
  }
}

enum _Tone { info, error }

class _Notice extends StatelessWidget {
  final _Tone tone;
  final String text;
  const _Notice({required this.tone, required this.text});

  @override
  Widget build(BuildContext context) {
    final color = tone == _Tone.error ? AppColors.danger : AppColors.primaryShade;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border(left: BorderSide(color: color, width: 4)),
        ),
        child: Text(text, style: const TextStyle(color: AppColors.ink, fontSize: 14.5)),
      ),
    );
  }
}

class _LegalLinks extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    void open(LegalDocument doc) =>
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => LegalScreen(document: doc)));
    return Column(
      children: [
        const Text(
          'By sending this you agree to the',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
        ),
        Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            TextButton(onPressed: () => open(LegalDocument.terms), child: const Text('Terms')),
            const Text('and', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
            TextButton(onPressed: () => open(LegalDocument.privacy), child: const Text('Privacy Policy')),
          ],
        ),
      ],
    );
  }
}
