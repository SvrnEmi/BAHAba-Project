import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/resident_providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/clay_container.dart';
import '../../widgets/alert_card.dart';
import '../../widgets/screen_header.dart';

/// Alerts & Notifications screen — shows broadcast alerts from the local DB.
class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AlertProvider>();

    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header
          const ScreenHeader(
            title: 'Alerts & Notifications',
            subtitle: 'Stay informed about flood risks',
            icon: Icons.notifications_outlined,
            chipColor: AppColors.peach,
          ),

          Expanded(
            child: provider.loading
                ? const Center(child: Text('Checking for approved alerts...'))
                : ListView(
                    padding: const EdgeInsets.fromLTRB(18, 8, 18, 24),
                    children: [
                      // Flood alerts section header
                      Row(
                        children: [
                          const ClayIconChip(
                            icon: Icons.campaign,
                            color: AppColors.peach,
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Flood Alerts',
                                style: AppText.heading(size: 18),
                              ),
                              const Text(
                                'Official alerts from MDRRMO',
                                style: TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),

                      if (provider.alerts.isEmpty)
                        const ClayContainer(
                          padding: EdgeInsets.all(24),
                          child: Column(
                            children: [
                              ClayIconChip(
                                icon: Icons.notifications_off,
                                color: AppColors.lavender,
                                iconColor: AppColors.textSecondary,
                                size: 56,
                                iconSize: 28,
                              ),
                              SizedBox(height: 12),
                              Text(
                                'No approved alerts yet',
                                style: TextStyle(
                                  color: AppColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        )
                      else
                        for (final alert in provider.alerts)
                          AlertCard(
                            alert: alert,
                            margin: const EdgeInsets.only(bottom: 12),
                          ),

                      const SizedBox(height: 24),

                      // Social media section
                      Row(
                        children: [
                          const Icon(
                            Icons.share,
                            size: 20,
                            color: AppColors.textSecondary,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Social Media Updates',
                            style: AppText.heading(size: 18),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const _SocialUpdateCard(
                        platform: 'Facebook',
                        handle: 'Odiongan MDRRMO',
                        time: '30 mins ago',
                        message:
                            'Water level in Odiongan river now at 2.5 meters. Stay alert and monitor updates.',
                        color: Color(0xFF1877F2),
                      ),
                      const SizedBox(height: 10),
                      const _SocialUpdateCard(
                        platform: 'X',
                        handle: '@OdionganLGU',
                        time: '1 hour ago',
                        message:
                            'All rescue teams on standby. Emergency hotline: 042-567-1234',
                        color: Color(0xFF0EA5E9),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _SocialUpdateCard extends StatelessWidget {
  final String platform;
  final String handle;
  final String time;
  final String message;
  final Color color;

  const _SocialUpdateCard({
    required this.platform,
    required this.handle,
    required this.time,
    required this.message,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return ClayContainer(
      borderRadius: 20,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: color,
                child: Text(
                  platform[0].toUpperCase(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                handle,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              Text(
                time,
                style: const TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 11,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: const TextStyle(fontSize: 13, height: 1.4),
          ),
        ],
      ),
    );
  }
}
