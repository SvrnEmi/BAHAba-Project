import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'barangay_dashboard_screen.dart';
import 'mdrrmo_dashboard_screen.dart';

/// Admin selection screen — choose MDRRMO or Barangay role.
class AdminSelectionScreen extends StatelessWidget {
  const AdminSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('BAHAba Admin'),
        backgroundColor: AppColors.primaryBlue,
        foregroundColor: Colors.white,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 8),
              const Center(
                child: CircleAvatar(
                  radius: 28,
                  backgroundColor: AppColors.primaryBlue,
                  child: Icon(Icons.admin_panel_settings,
                      color: Colors.white, size: 32),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Select your admin role to continue',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textSecondary, fontSize: 15),
              ),
              const SizedBox(height: 24),

              // MDRRMO card
              _AdminCard(
                title: 'MDRRMO Admin',
                description:
                    'Municipal Disaster Risk Reduction & Management Office',
                icon: Icons.shield,
                color: AppColors.primary,
                features: const [
                  'System-wide oversight',
                  'Verify barangay alerts',
                  'Verify community reports',
                  'View all barangays',
                  'System analytics',
                ],
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const MDRRMOAdminDashboardScreen(),
                    ),
                  );
                },
              ),
              const SizedBox(height: 16),

              // Barangay card
              _AdminCard(
                title: 'Barangay Admin',
                description: 'Barangay Official Dashboard',
                icon: Icons.apartment,
                color: AppColors.riskLow,
                features: const [
                  'Create alerts for barangay',
                  'View barangay reports',
                  'Monitor flood status',
                  'Barangay statistics',
                  'Alert history',
                ],
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const BarangayAdminDashboardScreen(),
                    ),
                  );
                },
              ),
              const SizedBox(height: 16),

              // Info box
              Container(
                padding: const EdgeInsets.all(16),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(
                    left: BorderSide(color: AppColors.secondary, width: 4),
                  ),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Role Differences',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'MDRRMO Admin: Full system access with verification authority over all barangay alerts and community reports.',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Barangay Admin: Limited to managing a specific barangay. Alerts require MDRRMO verification before broadcast.',
                      style: TextStyle(
                        color: AppColors.riskLow,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AdminCard extends StatelessWidget {
  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final List<String> features;
  final VoidCallback onTap;

  const _AdminCard({
    required this.title,
    required this.description,
    required this.icon,
    required this.color,
    required this.features,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(left: BorderSide(color: color, width: 4)),
      ),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, color: Colors.white, size: 28),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          description,
                          style: const TextStyle(
                            color: AppColors.textSecondary,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              for (final feature in features)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: color,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          feature,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: const Text(
                  'Access Dashboard →',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
