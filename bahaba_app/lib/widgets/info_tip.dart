import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Small (i) button that opens a one or two sentence description of a
/// status card, like the web InfoTip. A dialog rather than a popover so it
/// never overflows a 360 px screen and closes with Back.
class InfoTip extends StatelessWidget {
  final String label;
  final String text;

  const InfoTip({super.key, required this.label, required this.text});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'About $label',
      icon: const Icon(Icons.info_outline,
          size: 18, color: AppColors.textSecondary),
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
      onPressed: () => showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(label, style: AppText.heading(size: 16)),
          content: Text(text,
              style: const TextStyle(
                  color: AppColors.textSecondary, fontSize: 14, height: 1.4)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      ),
    );
  }
}
