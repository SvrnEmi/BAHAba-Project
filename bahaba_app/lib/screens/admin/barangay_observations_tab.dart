import 'package:flutter/material.dart';

import '../../config/app_strings.dart';
import '../../services/field_observations_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/flat_status_card.dart';

/// Field Observations: post, edit and delete what is seen on the ground in the
/// official's own barangay. The table has no realtime, so the list reloads
/// after each change. Mirrors the web BarangayObservations.
class BarangayObservationsTab extends StatefulWidget {
  final String barangay;

  const BarangayObservationsTab({super.key, required this.barangay});

  @override
  State<BarangayObservationsTab> createState() =>
      _BarangayObservationsTabState();
}

class _BarangayObservationsTabState extends State<BarangayObservationsTab> {
  final _location = TextEditingController();
  final _note = TextEditingController();
  String _kind = 'waterway';
  String _status = FieldObservationsService.statuses['waterway']!.first;
  int? _editingId;
  bool _saving = false;
  bool _loading = true;
  String? _error;
  List<FieldObservation> _rows = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _location.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final rows = await FieldObservationsService.allFor(widget.barangay);
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _error = null;
        _loading = false;
      });
    } catch (error) {
      debugPrint('Field observations failed: $error');
      if (!mounted) return;
      setState(() {
        _error = 'Could not load the observations.';
        _loading = false;
      });
    }
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  void _reset() {
    _location.clear();
    _note.clear();
    setState(() {
      _editingId = null;
      _kind = 'waterway';
      _status = FieldObservationsService.statuses['waterway']!.first;
    });
  }

  void _setKind(String kind) {
    // A status from the other kind would be refused by the database.
    setState(() {
      _kind = kind;
      _status = FieldObservationsService.statuses[kind]!.first;
    });
  }

  Future<void> _submit() async {
    if (_location.text.trim().length < FieldObservationsService.locationMin) {
      _snack('Enter a location of at least '
          '${FieldObservationsService.locationMin} characters.');
      return;
    }
    setState(() => _saving = true);
    try {
      final id = _editingId;
      if (id == null) {
        await FieldObservationsService.create(
          barangay: widget.barangay,
          kind: _kind,
          location: _location.text,
          status: _status,
          note: _note.text,
        );
      } else {
        await FieldObservationsService.update(
          id,
          kind: _kind,
          location: _location.text,
          status: _status,
          note: _note.text,
        );
      }
      _snack(id == null ? 'Observation posted.' : 'Observation updated.');
      _reset();
      await _load();
    } catch (error) {
      debugPrint('Saving the observation failed: $error');
      _snack('Unable to save the observation.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _edit(FieldObservation row) {
    _location.text = row.location;
    _note.text = row.note ?? '';
    setState(() {
      _editingId = row.id;
      _kind = row.kind;
      _status = row.status;
    });
  }

  Future<void> _delete(FieldObservation row) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete observation?'),
        content: Text('Delete this observation of ${row.location}? '
            'This cannot be undone.'),
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
      await FieldObservationsService.delete(row.id);
      if (_editingId == row.id) _reset();
      _snack('Observation deleted.');
      await _load();
    } catch (error) {
      debugPrint('Deleting the observation failed: $error');
      _snack('Unable to delete the observation.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final statuses = FieldObservationsService.statuses[_kind]!;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          FlatPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  _editingId == null
                      ? 'Field Observations'
                      : 'Edit observation',
                  style: AppText.heading(size: 16),
                ),
                const SizedBox(height: 4),
                Text(
                  'Record what you see at creeks, rivers and roads in '
                  '${widget.barangay}.',
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textSecondary),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  key: ValueKey('kind-$_kind'),
                  initialValue: _kind,
                  decoration: const InputDecoration(labelText: 'Kind'),
                  items: const [
                    DropdownMenuItem(
                        value: 'waterway', child: Text('Waterway')),
                    DropdownMenuItem(value: 'road', child: Text('Road')),
                  ],
                  onChanged: _saving
                      ? null
                      : (value) {
                          if (value != null) _setKind(value);
                        },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  key: ValueKey('status-$_kind-$_status'),
                  initialValue: _status,
                  decoration: const InputDecoration(labelText: 'Status'),
                  items: [
                    for (final status in statuses)
                      DropdownMenuItem(
                        value: status,
                        child: Text(AppStrings.groundStatus(status)),
                      ),
                  ],
                  onChanged: _saving
                      ? null
                      : (value) {
                          if (value != null) {
                            setState(() => _status = value);
                          }
                        },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _location,
                  enabled: !_saving,
                  maxLength: FieldObservationsService.locationMax,
                  decoration: InputDecoration(
                    labelText: 'Location',
                    hintText: 'e.g., ${widget.barangay} creek',
                  ),
                ),
                TextField(
                  controller: _note,
                  enabled: !_saving,
                  minLines: 2,
                  maxLines: 4,
                  maxLength: FieldObservationsService.noteMax,
                  decoration:
                      const InputDecoration(labelText: 'Note (optional)'),
                ),
                const SizedBox(height: 4),
                ElevatedButton(
                  onPressed: _saving ? null : _submit,
                  child: Text(_saving
                      ? 'Saving...'
                      : _editingId == null
                          ? 'Post observation'
                          : 'Save changes'),
                ),
                if (_editingId != null)
                  TextButton(
                    onPressed: _saving ? null : _reset,
                    child: const Text('Cancel'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Observations in ${widget.barangay} (${_rows.length})',
            style: AppText.heading(size: 16),
          ),
          const SizedBox(height: 8),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: AppColors.danger))
          else if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_rows.isEmpty)
            const Text(
              'No observations yet. Post what you see on the ground.',
              style: TextStyle(color: AppColors.textSecondary),
            )
          else
            for (final row in _rows)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: FlatPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${AppStrings.groundStatus(row.status)} · '
                        '${row.kind == 'road' ? 'Road' : 'Waterway'} · '
                        '${AppStrings.timeAgo(row.observedAt, DateTime.now())}',
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 4),
                      Text(row.location, style: AppText.heading(size: 14)),
                      if (row.note != null) ...[
                        const SizedBox(height: 4),
                        Text(row.note!),
                      ],
                      Row(
                        children: [
                          TextButton(
                            onPressed: () => _edit(row),
                            child: const Text('Edit'),
                          ),
                          TextButton(
                            onPressed: () => _delete(row),
                            child: const Text('Delete'),
                          ),
                        ],
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
