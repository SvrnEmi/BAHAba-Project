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

  Future<List<Barangay>> getAll() => _db.getBarangays();

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
