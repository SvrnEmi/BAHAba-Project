import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/resident_providers.dart';
import '../../theme/app_theme.dart';
import '../../widgets/clay_container.dart';
import '../../widgets/alert_card.dart';
import '../../widgets/screen_header.dart';
import 'all_alerts_screen.dart';

/// Alerts & Notifications: published alerts for the resident's barangay
/// (and all barangays). Cards are collapsed by default and the list scrolls
/// inside a box of about 40% of the screen height, so alerts never fill it.
class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AlertProvider>();
    final maxListHeight = MediaQuery.sizeOf(context).height * 0.4;

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
            child: RefreshIndicator(
              onRefresh: provider.refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
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
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Flood Alerts',
                              style: AppText.heading(size: 18),
                            ),
                            Text(
                              provider.barangay == null ||
                                      provider.barangay!.isEmpty
                                  ? 'From your barangay and the MDRRMO'
                                  : 'From ${provider.barangay} and the MDRRMO',
                              style: const TextStyle(
                                color: AppColors.textSecondary,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                      TextButton(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => AllAlertsScreen(
                                barangay: provider.barangay ?? ''),
                          ),
                        ),
                        child: const Text('View all'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  if (provider.loading)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Text('Checking for alerts...'),
                    )
                  else if (provider.error != null && provider.alerts.isEmpty)
                    const Text(
                      'Could not load alerts. Pull down to try again.',
                      style: TextStyle(color: AppColors.textSecondary),
                    )
                  else if (provider.alerts.isEmpty)
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
                            'No alerts for your barangay right now',
                            style: TextStyle(
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    ConstrainedBox(
                      constraints: BoxConstraints(maxHeight: maxListHeight),
                      child: Semantics(
                        label: 'Flood alerts',
                        container: true,
                        child: ListView.builder(
                          shrinkWrap: true,
                          primary: false,
                          itemCount: provider.alerts.length,
                          itemBuilder: (context, i) => AlertCard(
                            key: ValueKey('alert-${provider.alerts[i].id}'),
                            alert: provider.alerts[i],
                            margin: const EdgeInsets.only(bottom: 8),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
