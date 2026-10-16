import '../data/database_helper.dart';
import '../models/audit_log_model.dart';
import '../services/sync_service.dart';

/// Data access for the system audit trail.
class AuditRepository {
  final DatabaseHelper _db = DatabaseHelper.instance;
  final SyncService _sync = SyncService.instance;

  Future<List<AuditLog>> getLogs() => _db.getAuditLogs();

  Future<void> log({
    required String action,
    required String user,
    required String details,
  }) {
    return _db.insertAuditLog(AuditLog(
      action: action,
      user: user,
      timestamp: DateTime.now()
          .toIso8601String()
          .replaceFirst('T', ' ')
          .substring(0, 19),
      details: details,
    ));
  }

  Future<void> syncPending() => _sync.syncPending();

  Future<void> syncRemote() => _sync.pullRemote();
}
