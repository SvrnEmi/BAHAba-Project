import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/app_update_service.dart';
import '../theme/app_theme.dart';

/// Opens [url] outside the app; false if it could not be opened.
Future<bool> openApkUrl(String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null) return false;
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (e) {
    debugPrint('Could not open the download link: $e');
    return false;
  }
}

/// A required update cannot be dismissed: no "Later", no barrier or back button.
Future<void> showUpdateDialog(
  BuildContext context,
  AppRelease release, {
  required bool required,
  Future<bool> Function(String url) open = openApkUrl,
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: !required,
    builder: (_) => PopScope(
      canPop: !required,
      child: UpdateDialog(release: release, required: required, open: open),
    ),
  );
}

Future<void> showWhatsNewDialog(BuildContext context, AppRelease release) {
  return showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text("What's new"),
      content: _ReleaseBody(release: release),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(),
          child: const Text('OK'),
        ),
      ],
    ),
  );
}

class UpdateDialog extends StatefulWidget {
  final AppRelease release;
  final bool required;
  final Future<bool> Function(String url) open;

  const UpdateDialog({
    super.key,
    required this.release,
    required this.required,
    required this.open,
  });

  @override
  State<UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<UpdateDialog> {
  bool _failed = false;

  Future<void> _update() async {
    final opened = await widget.open(widget.release.apkUrl);
    if (!mounted) return;
    setState(() => _failed = !opened);
    // A required update stays on screen until the new build is installed.
    if (opened && !widget.required) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Update available'),
      content: _ReleaseBody(
        release: widget.release,
        error: _failed
            ? "The download link didn't open. Check your connection and try again."
            : null,
      ),
      actions: [
        if (!widget.required)
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Later'),
          ),
        TextButton(onPressed: _update, child: const Text('Update now')),
      ],
    );
  }
}

/// Version name and the notes as bullets; scrolls when the notes are long.
class _ReleaseBody extends StatelessWidget {
  final AppRelease release;
  final String? error;

  const _ReleaseBody({required this.release, this.error});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Version ${release.versionName}',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          for (final note in release.notes)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('•  '),
                  Expanded(child: Text(note)),
                ],
              ),
            ),
          if (error != null) ...[
            const SizedBox(height: 8),
            Text(error!, style: const TextStyle(color: AppColors.danger)),
          ],
        ],
      ),
    );
  }
}
