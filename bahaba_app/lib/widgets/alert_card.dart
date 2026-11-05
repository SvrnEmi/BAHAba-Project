import 'package:flutter/material.dart';

import '../models/alert_model.dart';
import '../theme/app_theme.dart';
import '../utils/report_display.dart';
import 'flat_status_card.dart';
import 'risk_badge.dart';

/// A broadcast alert: flat white card, 4px left border in the PAGASA color.
/// Never clay. Collapsed by default: PAGASA badge with its label, title,
/// barangay, relative time and a one-line preview. Tapping the header (a
/// button with an expanded/collapsed state for screen readers) shows the
/// full message, source and channels.
class AlertCard extends StatefulWidget {
  final Alert alert;
  final EdgeInsetsGeometry? margin;
  final bool initiallyExpanded;

  /// Kept for older call sites; the collapsed header always shows details.
  final bool showDetails;

  const AlertCard({
    super.key,
    required this.alert,
    this.margin,
    this.initiallyExpanded = false,
    this.showDetails = true,
  });

  @override
  State<AlertCard> createState() => _AlertCardState();
}

class _AlertCardState extends State<AlertCard> {
  late bool _open = widget.initiallyExpanded;

  void _toggle() => setState(() => _open = !_open);

  @override
  Widget build(BuildContext context) {
    final alert = widget.alert;
    final sent = DateTime.tryParse(alert.sentAt);
    final when = sent == null ? alert.sentAt : relativeTime(alert.sentAt);
    final preview = alert.message
        .split('\n')
        .map((l) => l.trim())
        .firstWhere((l) => l.isNotEmpty, orElse: () => '');

    return FlatStatusCard(
      accent: AlertLevelBadge.colorFor(alert.level),
      margin: widget.margin,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            expanded: _open,
            label:
                '${alert.level.pagasaText}: ${alert.title}, ${alert.targetBarangay}',
            hint: _open ? 'Hide details' : 'Show details',
            // The InkWell below is excluded, so the node carries the tap.
            onTap: _toggle,
            excludeSemantics: true,
            child: InkWell(
              onTap: _toggle,
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              children: [
                                AlertLevelBadge(
                                    level: alert.level, compact: true),
                                if (alert.source == 'barangay')
                                  const _SourceChip(label: 'Barangay'),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              alert.title,
                              style: const TextStyle(
                                color: AppColors.ink,
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Row(
                              children: [
                                const Icon(Icons.location_on,
                                    size: 13, color: AppColors.textSecondary),
                                const SizedBox(width: 3),
                                Expanded(
                                  child: Text(
                                    '${alert.targetBarangay} · $when',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: AppColors.textSecondary,
                                      fontSize: 12,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            if (!_open && preview.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                preview,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 6),
                      AnimatedRotation(
                        turns: _open ? 0.5 : 0,
                        duration: const Duration(milliseconds: 150),
                        child: const Icon(Icons.expand_more,
                            color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (_open)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Divider(height: 1),
                  const SizedBox(height: 10),
                  Text(
                    alert.message,
                    style: const TextStyle(
                        color: AppColors.ink, fontSize: 13, height: 1.4),
                  ),
                  const SizedBox(height: 10),
                  _Detail(label: 'Source', value: alert.sourceLabel),
                  _Detail(
                    label: 'Channels',
                    value: alert.channels.isEmpty
                        ? 'Push Notification'
                        : alert.channels.map((c) => c.label).join(', '),
                  ),
                  _Detail(
                    label: 'Sent',
                    value: sent == null
                        ? alert.sentAt
                        : _formatSent(context, sent),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _SourceChip extends StatelessWidget {
  final String label;
  const _SourceChip({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.textSecondary.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: const TextStyle(
            color: AppColors.ink, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  final String label;
  final String value;
  const _Detail({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: Text.rich(
        TextSpan(children: [
          TextSpan(
              text: '$label: ',
              style: const TextStyle(fontWeight: FontWeight.w700)),
          TextSpan(text: value),
        ]),
        style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
      ),
    );
  }
}

String _formatSent(BuildContext context, DateTime sent) {
  final l10n = MaterialLocalizations.of(context);
  final local = sent.toLocal();
  return '${l10n.formatMediumDate(local)}, '
      '${l10n.formatTimeOfDay(TimeOfDay.fromDateTime(local))}';
}
