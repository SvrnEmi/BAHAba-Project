import '../config/barangays.dart';
import '../data/database_helper.dart';
import '../models/barangay_model.dart';
import '../services/sync_service.dart';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../services/realtime_hub.dart';

/// Data access for barangays.
class BarangayRepository {
  final DatabaseHelper _db = DatabaseHelper.instance;
  final SyncService _sync = SyncService.instance;

  // One read per app session. A failed or empty read (offline, or signed out:
  // RLS returns no rows) is not cached, so the next caller retries.
  static Future<List<String>?>? _names;
  static List<String>? _loaded;

  /// The list to draw before [names] returns.
  static List<String> get currentNames => _loaded ?? officialBarangayNames;

  /// Barangay names from the table (order by name), or [officialBarangayNames]
  /// when the table cannot be read.
  static Future<List<String>> names() async {
    final cached = _names ??= _readNames();
    final names = await cached;
    if (names == null && identical(_names, cached)) _names = null;
    return names ?? officialBarangayNames;
  }

  static Future<List<String>?> _readNames() async {
    try {
      final rows = await Supabase.instance.client
          .from('barangays')
          .select('name')
          .order('name', ascending: true);
      final names = rows
          .map((r) => (r['name'] ?? '').toString().trim())
          .where((n) => n.isNotEmpty)
          .toList();
      if (names.isEmpty) return null;
      return _loaded = names;
    } catch (e) {
      debugPrint('Barangay list unavailable, using the official list: $e');
      return null;
    }
  }

  /// Local map cache (refreshed from Supabase by [BarangayProvider]).
  Future<List<Barangay>> getAll() => _db.getBarangays();

  /// Replaces the local map cache with [barangays].
  Future<void> cacheAll(List<Barangay> barangays) => _db.replaceBarangays(barangays);

  Future<Barangay?> byName(String name) => _db.getBarangayByName(name);

  Future<void> syncPending() => _sync.syncPending();

  Future<void> syncRemote() => _sync.pullRemote();

  Future<void> updateFloodRisk(String barangayName, String riskLevel) async {
    const validRiskLevels = {'low', 'medium', 'high'};
    if (!validRiskLevels.contains(riskLevel)) {
      throw ArgumentError.value(
        riskLevel,
        'riskLevel',
        'Risk level must be low, medium, or high.',
      );
    }

    final response = await Supabase.instance.client
        .from('barangays')
        .update({
          'flood_risk': riskLevel,
          'last_update': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('name', barangayName)
        .select();
    if (response.isEmpty) {
      throw Exception(
        'Update failed or not permitted for barangay "$barangayName".',
      );
    }
  }

  /// Number of registered profiles assigned to [name].
  Future<int> countResidents(String name) async {
    final rows = await Supabase.instance.client
        .from('profiles')
        .select('id')
        .eq('barangay', name);
    return rows.length;
  }

  /// All live barangay rows, on the shared barangays channel.
  Stream<List<Map<String, dynamic>>> watchAll() =>
      RealtimeHub.instance.table('barangays');

  /// Live row for one barangay, on the shared barangays channel (see
  /// [RealtimeHub]). Only emits when this barangay's row actually changes.
  Stream<Map<String, dynamic>?> watchBarangay(String name) {
    return RealtimeHub.instance
        .table('barangays')
        .map<Map<String, dynamic>?>((rows) {
      for (final row in rows) {
        if (row['name'] == name) return row;
      }
      return null;
    }).distinct(mapEquals);
  }
}
