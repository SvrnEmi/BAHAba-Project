import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/quick_report_service.dart';
import '../theme/app_theme.dart';

/// Two big call buttons. The number is part of the label so it can be read
/// and dialled by hand if the phone app cannot be opened.
class HotlineButtons extends StatelessWidget {
  const HotlineButtons({super.key});

  Future<void> _call(BuildContext context, String tel, String label) async {
    final messenger = ScaffoldMessenger.of(context);
    var opened = false;
    try {
      opened = await launchUrl(Uri(scheme: 'tel', path: tel));
    } catch (e) {
      debugPrint('Could not open dialer: $e');
    }
    if (!opened) {
      messenger.showSnackBar(
        SnackBar(content: Text('Could not open the phone app. Please dial $label.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ElevatedButton.icon(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.danger,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(56),
          ),
          onPressed: () => _call(
            context,
            QuickReportService.mdrrmoHotlineTel,
            QuickReportService.mdrrmoHotlineLabel,
          ),
          icon: const Icon(Icons.phone),
          label: const Text('Call MDRRMO ${QuickReportService.mdrrmoHotlineLabel}'),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(56)),
          onPressed: () => _call(
            context,
            QuickReportService.emergencyHotline,
            QuickReportService.emergencyHotline,
          ),
          icon: const Icon(Icons.phone),
          label: const Text('Call ${QuickReportService.emergencyHotline}'),
        ),
      ],
    );
  }
}
