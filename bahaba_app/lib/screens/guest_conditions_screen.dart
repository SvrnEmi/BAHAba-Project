import 'package:flutter/material.dart';

import '../config/app_strings.dart';
import '../repositories/barangay_repository.dart';
import '../theme/app_theme.dart';
import '../widgets/ground_reports_card.dart';

/// Public: the "Reported on the ground" card for a barangay the guest picks.
class GuestConditionsScreen extends StatefulWidget {
  const GuestConditionsScreen({super.key});

  @override
  State<GuestConditionsScreen> createState() => _GuestConditionsScreenState();
}

class _GuestConditionsScreenState extends State<GuestConditionsScreen> {
  List<String> _barangays = BarangayRepository.currentNames;
  String? _barangay;

  @override
  void initState() {
    super.initState();
    BarangayRepository.names().then((names) {
      if (mounted) setState(() => _barangays = names);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text(AppStrings.guestConditionsTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
        children: [
          const Text(
            AppStrings.guestConditionsSubtitle,
            style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _barangay,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: AppStrings.guestPickBarangay,
              hintText: AppStrings.guestChoose,
            ),
            items: [
              for (final name in _barangays)
                DropdownMenuItem(value: name, child: Text(name)),
            ],
            onChanged: (value) => setState(() => _barangay = value),
          ),
          const SizedBox(height: 16),
          GroundReportsCard(barangay: _barangay),
        ],
      ),
    );
  }
}
