import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../config/app_strings.dart';
import '../services/report_advisories_service.dart';
import '../theme/app_theme.dart';

String _when(DateTime time) => DateFormat('MMM d, y, h:mm a').format(time);

class _AdvisoryCard extends StatelessWidget {
  final String title;
  final ReportAdvisory advisory;
  final Widget? action;

  const _AdvisoryCard({
    required this.title,
    required this.advisory,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.fromLTRB(10, 6, 8, 6),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(
          left: BorderSide(color: AppColors.primaryShade, width: 3),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: AppColors.primaryShade,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  advisory.body,
                  style: const TextStyle(color: AppColors.ink, fontSize: 14),
                ),
                Text(
                  _when(advisory.createdAt),
                  style: const TextStyle(
                      color: AppColors.textSecondary, fontSize: 12),
                ),
              ],
            ),
          ),
          if (action != null) action!,
        ],
      ),
    );
  }
}

/// A report's advisories as residents see them, live on the shared channel.
/// Shows nothing when there are none.
class ReportAdvisoryList extends StatefulWidget {
  final int reportId;

  const ReportAdvisoryList({super.key, required this.reportId});

  @override
  State<ReportAdvisoryList> createState() => _ReportAdvisoryListState();
}

class _ReportAdvisoryListState extends State<ReportAdvisoryList> {
  // One stream for the widget's lifetime, never created in build().
  final Stream<List<ReportAdvisory>> _rows = ReportAdvisoriesService.rows();

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ReportAdvisory>>(
      stream: _rows,
      builder: (context, snapshot) {
        final mine = (snapshot.data ?? const <ReportAdvisory>[])
            .where((a) => a.reportId == widget.reportId)
            .toList();
        if (mine.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final advisory in mine)
              _AdvisoryCard(
                title: AppStrings.advisoryFrom(advisory.author),
                advisory: advisory,
              ),
          ],
        );
      },
    );
  }
}

/// The "Advisory" section for staff: helper text, the form and the list. A
/// barangay official deletes their own; the MDRRMO ([canDeleteAny]) deletes any.
class ReportAdvisoryPanel extends StatefulWidget {
  final int reportId;
  final bool canDeleteAny;

  const ReportAdvisoryPanel({
    super.key,
    required this.reportId,
    this.canDeleteAny = false,
  });

  @override
  State<ReportAdvisoryPanel> createState() => _ReportAdvisoryPanelState();
}

class _ReportAdvisoryPanelState extends State<ReportAdvisoryPanel> {
  final _controller = TextEditingController();
  StreamSubscription<List<ReportAdvisory>>? _sub;
  List<ReportAdvisory> _rows = const [];
  final Set<int> _hidden = {};
  bool _posting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() => _error = null));
    _sub = ReportAdvisoriesService.rows().listen(
      (rows) {
        if (!mounted) return;
        setState(() {
          _rows = rows.where((a) => a.reportId == widget.reportId).toList();
        });
      },
      onError: (Object e) => debugPrint('Advisories stream failed: $e'),
    );
  }

  @override
  void dispose() {
    _sub?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _post() async {
    if (_posting || postableAdvisory(_controller.text) == null) return;
    setState(() {
      _posting = true;
      _error = null;
    });
    try {
      final advisory =
          await ReportAdvisoriesService.post(widget.reportId, _controller.text);
      if (!mounted) return;
      _controller.clear();
      setState(() {
        if (!_rows.any((a) => a.id == advisory.id)) {
          _rows = [advisory, ..._rows];
        }
      });
    } catch (error) {
      debugPrint('Posting the advisory failed: $error');
      if (mounted) setState(() => _error = AppStrings.advisoryPostFailed);
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  Future<void> _delete(ReportAdvisory advisory) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text(AppStrings.advisoryDelete),
        content: const Text(AppStrings.advisoryConfirmDelete),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ReportAdvisoriesService.delete(advisory.id);
      if (mounted) setState(() => _hidden.add(advisory.id));
    } catch (error) {
      debugPrint('Deleting the advisory failed: $error');
      if (mounted) setState(() => _error = AppStrings.advisoryDeleteFailed);
    }
  }

  @override
  Widget build(BuildContext context) {
    final userId = ReportAdvisoriesService.currentUserId;
    final rows = _rows.where((a) => !_hidden.contains(a.id)).toList();
    final canPost = !_posting && postableAdvisory(_controller.text) != null;
    const help = TextStyle(fontSize: 12, color: AppColors.textSecondary);
    const bold = TextStyle(fontWeight: FontWeight.w700);

    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.only(top: 10),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(AppStrings.advisoryTitle, style: AppText.heading(size: 14)),
          const SizedBox(height: 4),
          const Text.rich(
            TextSpan(children: [
              TextSpan(text: AppStrings.advisoryCommentLabel, style: bold),
              TextSpan(text: ' ${AppStrings.advisoryCommentHelp}'),
            ]),
            style: help,
          ),
          const Text.rich(
            TextSpan(children: [
              TextSpan(text: AppStrings.advisoryAdvisoryLabel, style: bold),
              TextSpan(text: ' ${AppStrings.advisoryAdvisoryHelp}'),
            ]),
            style: help,
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _controller,
            enabled: !_posting,
            minLines: 2,
            maxLines: 4,
            maxLength: kAdvisoryMaxLength,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              hintText: AppStrings.advisoryPlaceholder,
            ),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: ElevatedButton(
              onPressed: canPost ? _post : null,
              child: Text(
                _posting ? AppStrings.advisoryPosting : AppStrings.advisoryPost,
              ),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Semantics(
                liveRegion: true,
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: AppColors.danger,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          if (rows.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text(AppStrings.advisoryNone, style: help),
            )
          else
            for (final advisory in rows)
              _AdvisoryCard(
                title: '${advisory.author} · ${advisory.roleLabel}',
                advisory: advisory,
                action: widget.canDeleteAny || advisory.authorId == userId
                    ? IconButton(
                        icon: const Icon(Icons.delete_outline,
                            color: AppColors.danger),
                        tooltip: AppStrings.advisoryDelete,
                        onPressed: () => _delete(advisory),
                      )
                    : null,
              ),
        ],
      ),
    );
  }
}
