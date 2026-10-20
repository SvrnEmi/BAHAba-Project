import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../services/report_messages_service.dart';
import '../theme/app_theme.dart';

/// "Messages" section on one of the resident's own reports: a collapsible
/// thread with Barangay / MDRRMO staff. The thread loads and subscribes
/// only while open; its Realtime channel is removed in dispose. Message
/// bodies are plain [Text] (no links, no rich text).
class ReportMessagesSection extends StatefulWidget {
  final int reportId;

  /// The old single admin reply, shown as the first MDRRMO message.
  final String? legacyReply;
  final String? legacyReplyAt;

  /// Tests inject a fake; defaults to Supabase.
  final ReportMessagesService? service;

  const ReportMessagesSection({
    super.key,
    required this.reportId,
    this.legacyReply,
    this.legacyReplyAt,
    this.service,
  });

  @override
  State<ReportMessagesSection> createState() => _ReportMessagesSectionState();
}

class _ReportMessagesSectionState extends State<ReportMessagesSection> {
  static const SenderRole _viewer = SenderRole.resident;

  late final ReportMessagesService _service =
      widget.service ?? ReportMessagesService();
  bool _open = false;
  ReportMessage? _latest;
  DateTime? _lastSeen;

  String? get _userId {
    try {
      return Supabase.instance.client.auth.currentUser?.id;
    } catch (_) {
      return null; // Supabase not initialised (tests).
    }
  }

  @override
  void initState() {
    super.initState();
    unawaited(_loadDot());
  }

  Future<void> _loadDot() async {
    final userId = _userId;
    try {
      final results = await Future.wait<Object?>([
        _service.fetchLatest(widget.reportId),
        if (userId != null)
          ReportThreadSeenStore.lastSeen(userId, widget.reportId),
      ]);
      if (!mounted) return;
      setState(() {
        _latest = results[0] as ReportMessage?;
        if (results.length > 1) _lastSeen = results[1] as DateTime?;
      });
    } catch (error) {
      debugPrint('Report messages: latest failed: $error');
    }
  }

  void _onLatest(ReportMessage? message) {
    final userId = _userId;
    setState(() {
      _latest = message;
      if (message != null) _lastSeen = message.createdAt;
    });
    if (message != null && userId != null) {
      unawaited(ReportThreadSeenStore.markSeen(
          userId, widget.reportId, message.createdAt));
    }
  }

  @override
  Widget build(BuildContext context) {
    final isNew = !_open && hasNewMessage(_latest, _viewer, _lastSeen);
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.only(top: 4),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            expanded: _open,
            label: isNew ? 'Messages, new messages' : 'Messages',
            excludeSemantics: true,
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => setState(() => _open = !_open),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: Row(
                  children: [
                    const Icon(Icons.chat_bubble_outline,
                        size: 18, color: AppColors.primary),
                    const SizedBox(width: 8),
                    Text('Messages', style: AppText.heading(size: 14)),
                    if (isNew) ...[
                      const SizedBox(width: 8),
                      const NewDot(),
                    ],
                    const Spacer(),
                    Icon(
                      _open ? Icons.expand_less : Icons.expand_more,
                      color: AppColors.textSecondary,
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (_open)
            ReportThread(
              reportId: widget.reportId,
              viewerRole: _viewer,
              service: _service,
              legacyReply: widget.legacyReply,
              legacyReplyAt: widget.legacyReplyAt,
              onLatest: _onLatest,
            ),
        ],
      ),
    );
  }
}

/// Small red dot plus the word "New" (not color alone).
class NewDot extends StatelessWidget {
  const NewDot({super.key});

  @override
  Widget build(BuildContext context) {
    return const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 8,
          height: 8,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: AppColors.riskHigh,
              shape: BoxShape.circle,
            ),
          ),
        ),
        SizedBox(width: 4),
        Text(
          'New',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppColors.riskHigh,
          ),
        ),
      ],
    );
  }
}

/// The open thread: messages, then the input at the bottom.
class ReportThread extends StatefulWidget {
  final int reportId;
  final SenderRole viewerRole;
  final ReportMessagesService service;
  final String? legacyReply;
  final String? legacyReplyAt;
  final ValueChanged<ReportMessage?> onLatest;

  const ReportThread({
    super.key,
    required this.reportId,
    required this.viewerRole,
    required this.service,
    required this.onLatest,
    this.legacyReply,
    this.legacyReplyAt,
  });

  @override
  State<ReportThread> createState() => _ReportThreadState();
}

class _ReportThreadState extends State<ReportThread> {
  final _controller = TextEditingController();
  final List<ReportMessage> _messages = [];
  RealtimeChannel? _channel;
  bool _loading = true;
  String? _loadError;
  bool _sending = false;
  String? _sendError;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onDraftChanged);
    _start();
  }

  @override
  void dispose() {
    final channel = _channel;
    _channel = null;
    if (channel != null) unawaited(widget.service.unsubscribe(channel));
    _controller
      ..removeListener(_onDraftChanged)
      ..dispose();
    super.dispose();
  }

  void _onDraftChanged() {
    // Re-evaluates the Send button and the counter; clears a stale error.
    setState(() => _sendError = null);
  }

  void _start() {
    try {
      _channel = widget.service.subscribe(widget.reportId, _add);
    } catch (error) {
      debugPrint('Report messages: subscribe failed: $error');
    }
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final loaded = await widget.service.fetchThread(widget.reportId);
      if (!mounted) return;
      setState(() {
        final ids = {for (final m in loaded) '${m.id}'};
        final live = _messages.where((m) => !ids.contains('${m.id}')).toList();
        _messages
          ..clear()
          ..addAll(loaded)
          ..addAll(live)
          ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
        _loading = false;
      });
      widget.onLatest(_messages.isEmpty ? null : _messages.last);
    } catch (error) {
      debugPrint('Report messages: load failed: $error');
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = 'Could not load messages. Please try again.';
      });
    }
  }

  void _add(ReportMessage message) {
    if (!mounted) return;
    if (_messages.any((m) => '${m.id}' == '${message.id}')) return;
    setState(() {
      _messages
        ..add(message)
        ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    });
    if (!_loading) widget.onLatest(_messages.last);
  }

  Future<void> _send() async {
    if (_sending || sendableBody(_controller.text) == null) return;
    setState(() {
      _sending = true;
      _sendError = null;
    });
    try {
      final message = await widget.service.send(widget.reportId, _controller.text);
      if (!mounted) return;
      _controller.clear();
      if (message != null) _add(message);
    } catch (error) {
      // e.g. "Please wait for a reply..." after 3 resident messages in a row.
      if (mounted) setState(() => _sendError = sendErrorText(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final legacy = widget.legacyReply?.trim() ?? '';
    final canSend = !_sending && sendableBody(_controller.text) != null;
    final counter = counterText(_controller.text);

    Widget thread;
    if (_loadError != null) {
      thread = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_loadError!,
              style: const TextStyle(
                  color: AppColors.danger, fontWeight: FontWeight.w600)),
          TextButton.icon(
            onPressed: _load,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      );
    } else if (_loading) {
      thread = const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Text('Loading messages...',
            style: TextStyle(color: AppColors.textSecondary)),
      );
    } else if (legacy.isEmpty && _messages.isEmpty) {
      thread = const _Well(
        child: Text(kEmptyThreadText,
            style: TextStyle(color: AppColors.textSecondary)),
      );
    } else {
      thread = _Well(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (legacy.isNotEmpty)
              _Bubble(
                own: widget.viewerRole == SenderRole.mdrrmo,
                role: SenderRole.mdrrmo,
                body: legacy,
                when: DateTime.tryParse(widget.legacyReplyAt ?? ''),
                note: 'Earlier reply',
              ),
            for (final m in _messages)
              _Bubble(
                own: m.senderRole == widget.viewerRole,
                role: m.senderRole,
                body: m.body,
                when: m.createdAt,
              ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 4),
        thread,
        const SizedBox(height: 10),
        TextField(
          controller: _controller,
          enabled: !_sending,
          minLines: 1,
          maxLines: 4,
          maxLength: kMessageMaxLength,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(hintText: 'Write a message'),
          // Hidden until the draft is near the limit.
          buildCounter: (context,
                  {required currentLength, required isFocused, maxLength}) =>
              counter == null
                  ? null
                  : Text(counter,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textSecondary)),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerRight,
          child: ElevatedButton.icon(
            onPressed: canSend ? _send : null,
            icon: _sending
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send, size: 18),
            label: Text(_sending ? 'Sending...' : 'Send'),
          ),
        ),
        if (_sendError != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Semantics(
              liveRegion: true,
              child: Text(
                _sendError!,
                style: const TextStyle(
                  color: AppColors.danger,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Pressed-in well behind the thread.
class _Well extends StatelessWidget {
  final Widget child;
  const _Well({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: AppClay.insetGradient,
        borderRadius: BorderRadius.circular(18),
      ),
      child: child,
    );
  }
}

class _Bubble extends StatelessWidget {
  final bool own;
  final SenderRole role;
  final String body;
  final DateTime? when;
  final String? note;

  const _Bubble({
    required this.own,
    required this.role,
    required this.body,
    required this.when,
    this.note,
  });

  static String _format(DateTime t) {
    final local = t.toLocal();
    final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final minute = local.minute.toString().padLeft(2, '0');
    final period = local.hour < 12 ? 'AM' : 'PM';
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${months[local.month - 1]} ${local.day}, $hour:$minute $period';
  }

  @override
  Widget build(BuildContext context) {
    final label = own ? 'You' : senderLabel(role);
    const radius = Radius.circular(18);
    const tail = Radius.circular(6);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Column(
        crossAxisAlignment:
            own ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              note == null ? label.toUpperCase() : '${label.toUpperCase()} · $note',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
                color: own ? AppColors.textSecondary : AppColors.primaryShade,
              ),
            ),
          ),
          const SizedBox(height: 3),
          ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.7,
            ),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                gradient:
                    own ? AppClay.primaryGradient : AppClay.surfaceGradient,
                borderRadius: BorderRadius.only(
                  topLeft: radius,
                  topRight: radius,
                  bottomLeft: own ? radius : tail,
                  bottomRight: own ? tail : radius,
                ),
                boxShadow: const [
                  BoxShadow(
                    color: AppColors.clayShade,
                    offset: Offset(3, 3),
                    blurRadius: 8,
                  ),
                ],
              ),
              child: Text(
                body,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.4,
                  color: own ? Colors.white : AppColors.ink,
                ),
              ),
            ),
          ),
          if (when != null)
            Padding(
              padding: const EdgeInsets.only(top: 3, left: 4, right: 4),
              child: Text(
                _format(when!),
                style: const TextStyle(
                    fontSize: 11, color: AppColors.textSecondary),
              ),
            ),
        ],
      ),
    );
  }
}
