import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/quick_report_service.dart';
import '../theme/app_theme.dart';

/// Two big call buttons. The number is part of the label so it can be read
/// and dialled by hand if the phone app cannot be opened.
class HotlineButtons extends StatelessWidget {
  /// Side by side (Welcome screen) instead of stacked full-width buttons.
  final bool row;
  const HotlineButtons({super.key, this.row = false});

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

  Widget _rowButton(
    BuildContext context, {
    required String title,
    String? number,
    required String tel,
    required bool primary,
  }) {
    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.phone, size: 18),
            const SizedBox(width: 6),
            Flexible(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700))),
          ],
        ),
        if (number != null)
          Text(number, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
      ],
    );
    void onPressed() => _call(context, tel, number ?? tel);
    const padding = EdgeInsets.symmetric(horizontal: 8, vertical: 10);
    return primary
        ? ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.danger,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(60),
              padding: padding,
            ),
            onPressed: onPressed,
            child: content,
          )
        : OutlinedButton(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(60), padding: padding),
            onPressed: onPressed,
            child: content,
          );
  }

  @override
  Widget build(BuildContext context) {
    if (row) {
      return IntrinsicHeight(
        // Equal-height buttons; stretch alone is unbounded inside a scroll view.
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: _rowButton(
                context,
                title: 'Call MDRRMO',
                number: QuickReportService.mdrrmoHotlineLabel,
                tel: QuickReportService.mdrrmoHotlineTel,
                primary: true,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _rowButton(
                context,
                title: 'Call ${QuickReportService.emergencyHotline}',
                tel: QuickReportService.emergencyHotline,
                primary: false,
              ),
            ),
          ],
        ),
      );
    }
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
