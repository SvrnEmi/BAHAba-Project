import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/flood_event_model.dart';
import '../../repositories/flood_history_repository.dart';
import '../../theme/app_theme.dart';
import '../../widgets/clay_button.dart';
import '../../widgets/clay_container.dart';
import '../resident/baha_history_screen.dart';

/// MDRRMO: name flood events (e.g. "Typhoon Obet") so the Baha History map
/// can group approved reports by time. Changes are audit-logged by the
/// database.
class FloodEventsTab extends StatefulWidget {
  const FloodEventsTab({super.key});

  @override
  State<FloodEventsTab> createState() => _FloodEventsTabState();
}

class _FloodEventsTabState extends State<FloodEventsTab> {
  static final DateFormat _when = DateFormat('MMM d, y h:mm a');

  final FloodHistoryRepository _repo = FloodHistoryRepository();
  List<FloodEvent>? _events;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final events = await _repo.events();
      if (!mounted) return;
      setState(() {
        _events = events;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not load flood events.');
    }
  }

  void _toast(String text) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(text)));

  Future<void> _edit([FloodEvent? event]) async {
    final saved = await showDialog<bool>(
      context: context,
      builder: (_) => _EventDialog(repo: _repo, event: event),
    );
    if (saved == true) {
      _toast(event == null ? 'Flood event created' : 'Flood event updated');
      _load();
    }
  }

  Future<void> _delete(FloodEvent event) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete flood event?'),
        content: Text(
          '"${event.name}" will be removed from the history filter. '
          'Reports are not deleted.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _repo.deleteEvent(event.id);
      _toast('Flood event deleted');
      _load();
    } catch (e) {
      _toast('Could not delete: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final events = _events;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Flood Events', style: AppText.heading(size: 18)),
          const SizedBox(height: 4),
          const Text(
            'Approved reports made between the start and end time are shown '
            'under the event on the Baha History map.',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ClayButton(
                  label: 'New event',
                  icon: Icons.add,
                  onPressed: () => _edit(),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ClayButton.secondary(
                  label: 'History map',
                  icon: Icons.map_outlined,
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                        builder: (_) => const BahaHistoryScreen()),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: AppColors.riskHigh))
          else if (events == null)
            const Center(child: CircularProgressIndicator())
          else if (events.isEmpty)
            const Text('No flood events yet.')
          else
            for (final e in events)
              ClayContainer(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(e.name, style: AppText.heading(size: 16)),
                    const SizedBox(height: 2),
                    Text(
                      '${_when.format(e.startAt)} - ${_when.format(e.endAt)}',
                      style: const TextStyle(
                          fontSize: 13, color: AppColors.textSecondary),
                    ),
                    Wrap(
                      children: [
                        TextButton.icon(
                          onPressed: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) =>
                                  BahaHistoryScreen(initialEventId: e.id),
                            ),
                          ),
                          icon: const Icon(Icons.map_outlined),
                          label: const Text('View map'),
                        ),
                        TextButton.icon(
                          onPressed: () => _edit(e),
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text('Edit'),
                        ),
                        TextButton.icon(
                          onPressed: () => _delete(e),
                          icon: const Icon(Icons.delete_outline),
                          label: const Text('Delete'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

class _EventDialog extends StatefulWidget {
  final FloodHistoryRepository repo;
  final FloodEvent? event;

  const _EventDialog({required this.repo, this.event});

  @override
  State<_EventDialog> createState() => _EventDialogState();
}

class _EventDialogState extends State<_EventDialog> {
  static final DateFormat _when = DateFormat('MMM d, y h:mm a');

  late final TextEditingController _name =
      TextEditingController(text: widget.event?.name ?? '');
  late DateTime _start = widget.event?.startAt ??
      DateTime.now().subtract(const Duration(days: 1));
  late DateTime _end = widget.event?.endAt ?? DateTime.now();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<DateTime?> _pick(DateTime initial) async {
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null) return null;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty || name.length > 80) {
      setState(() => _error = 'Enter a name (up to 80 characters).');
      return;
    }
    if (!_end.isAfter(_start)) {
      setState(() => _error = 'End must be after start.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final event = widget.event;
      if (event == null) {
        await widget.repo.createEvent(name, _start, _end);
      } else {
        await widget.repo.updateEvent(event.id, name, _start, _end);
      }
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = 'Could not save: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget timeRow(String label, DateTime value, ValueChanged<DateTime> set) {
      return ListTile(
        contentPadding: EdgeInsets.zero,
        minVerticalPadding: 12,
        title: Text(label),
        subtitle: Text(_when.format(value)),
        trailing: const Icon(Icons.edit_calendar_outlined),
        onTap: () async {
          final picked = await _pick(value);
          if (picked != null) setState(() => set(picked));
        },
      );
    }

    return AlertDialog(
      title: Text(widget.event == null ? 'New flood event' : 'Edit flood event'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _name,
              maxLength: 80,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Name',
                hintText: 'e.g. Typhoon Obet',
              ),
            ),
            timeRow('Start', _start, (v) => _start = v),
            timeRow('End', _end, (v) => _end = v),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: AppColors.riskHigh)),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: _saving ? null : _save,
          child: Text(_saving ? 'Saving...' : 'Save'),
        ),
      ],
    );
  }
}
