import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

import '../models/barangay_model.dart';
import '../models/alert_model.dart';
import '../models/community_report_model.dart';
import '../models/audit_log_model.dart';
import '../models/user_model.dart';
import 'seed_data.dart';

/// SQLite database helper for the BAHAba local database.
///
/// Creates the schema, seeds sample data on first launch, and exposes
/// CRUD operations for all entities.
class DatabaseHelper {
  DatabaseHelper._privateConstructor();
  static final DatabaseHelper instance = DatabaseHelper._privateConstructor();

  static const _dbName = 'bahaba.db';
  static const _dbVersion = 3;

  Database? _database;

  Future<Database> get database async {
    _database ??= await _initDb();
    return _database!;
  }

  Future<Database> _initDb() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, _dbName);

    return openDatabase(
      path,
      version: _dbVersion,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
  }

  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await _addSyncedColumns(db);
    }
    if (oldVersion < 3) {
      await _addAdminReplyColumns(db);
    }
  }

  Future<void> _addAdminReplyColumns(Database db) async {
    final columns = await db.rawQuery("PRAGMA table_info('community_reports')");
    final names = columns.map((row) => row['name']).toSet();
    if (!names.contains('admin_reply')) {
      await db.execute('ALTER TABLE community_reports ADD COLUMN admin_reply TEXT');
    }
    if (!names.contains('admin_reply_at')) {
      await db.execute('ALTER TABLE community_reports ADD COLUMN admin_reply_at TEXT');
    }
  }

  Future<void> _addSyncedColumns(Database db) async {
    final tables = ['users', 'barangays', 'alerts', 'community_reports', 'audit_logs'];
    for (final table in tables) {
      final columns = await db.rawQuery("PRAGMA table_info('$table')");
      final hasSynced = columns.any((row) => row['name'] == 'synced');
      if (!hasSynced) {
        await db.execute('ALTER TABLE $table ADD COLUMN synced INTEGER NOT NULL DEFAULT 0');
      }
    }
  }

  Future<void> _onCreate(Database db, int version) async {
    // --- Users table ---
    await db.execute('''
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        phone TEXT,
        barangay TEXT,
        role TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0
      )
    ''');

    // --- Barangays table ---
    await db.execute('''
      CREATE TABLE barangays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        flood_risk TEXT NOT NULL,
        water_level TEXT NOT NULL,
        population TEXT NOT NULL,
        evacuated TEXT NOT NULL,
        last_update TEXT NOT NULL,
        description TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0
      )
    ''');

    // --- Alerts table ---
    await db.execute('''
      CREATE TABLE alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        target_barangay TEXT NOT NULL,
        channels TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        recipients INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'approved',
        rejection_reason TEXT,
        source TEXT DEFAULT 'mdrrmo',
        synced INTEGER NOT NULL DEFAULT 0
      )
    ''');

    // --- Community reports table ---
    await db.execute('''
      CREATE TABLE community_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT NOT NULL,
        location TEXT NOT NULL,
        lat REAL,
        lng REAL,
        water_level TEXT NOT NULL,
        description TEXT NOT NULL,
        photo_path TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        timestamp TEXT NOT NULL,
        rejection_reason TEXT,
        admin_reply TEXT,
        admin_reply_at TEXT,
        synced INTEGER NOT NULL DEFAULT 0
      )
    ''');

    // --- Audit logs table ---
    await db.execute('''
      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        user TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        details TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0
      )
    ''');

    // --- Seed data on first launch ---
    await _seed(db);
  }

  Future<void> _seed(Database db) async {
    final batch = db.batch();

    // Seed rows are local demo data, so mark them synced to keep
    // SyncService from uploading them to Supabase.
    Map<String, dynamic> seedRow(Map<String, dynamic> row) =>
        {...row..remove('id'), 'synced': 1};

    // Users
    for (final user in SeedData.users) {
      batch.insert('users', seedRow(user.toMap()));
    }

    // Barangays
    for (final brgy in SeedData.barangays) {
      batch.insert('barangays', seedRow(brgy.toMap()));
    }

    // Alerts
    for (final alert in SeedData.alerts()) {
      batch.insert('alerts', seedRow(alert.toMap()));
    }

    // Community reports
    for (final report in SeedData.reports()) {
      batch.insert('community_reports', seedRow(report.toMap()));
    }

    // Audit logs
    for (final log in SeedData.auditLogs()) {
      batch.insert('audit_logs', seedRow(log.toMap()));
    }

    await batch.commit(noResult: true);
  }

  // ---------- Users ----------

  Future<List<User>> getUsers() async {
    final db = await database;
    final rows = await db.query('users', orderBy: 'id ASC');
    return rows.map(User.fromMap).toList();
  }

  Future<User?> getUserByEmail(String email) async {
    final db = await database;
    final rows = await db.query(
      'users',
      where: 'email = ?',
      whereArgs: [email.toLowerCase().trim()],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return User.fromMap(rows.first);
  }

  Future<int> insertUser(User user) async {
    final db = await database;
    return db.insert('users', {
      ...user.toMap()..remove('id'),
      'synced': 0,
    });
  }

  Future<List<Map<String, dynamic>>> pendingUsers() async {
    final db = await database;
    return db.query('users', where: 'synced = ?', whereArgs: [0]);
  }

  Future<void> markSynced(String tableName, int id) async {
    final db = await database;
    await db.update(
      tableName,
      {'synced': 1},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<List<Map<String, dynamic>>> pendingRows(String tableName) async {
    final db = await database;
    return db.query(tableName, where: 'synced = ?', whereArgs: [0]);
  }

  Future<void> upsertRow(String tableName, Map<String, dynamic> row, {String? conflictKey}) async {
    final db = await database;
    final payload = {...row, 'synced': 1};
    await db.insert(
      tableName,
      payload,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<bool> userExists(String email) async {
    final db = await database;
    final rows = await db.query(
      'users',
      where: 'email = ?',
      whereArgs: [email.toLowerCase().trim()],
      limit: 1,
    );
    return rows.isNotEmpty;
  }

  // ---------- Barangays ----------

  Future<List<Barangay>> getBarangays() async {
    final db = await database;
    final rows = await db.query('barangays', orderBy: 'id ASC');
    return rows.map(Barangay.fromMap).toList();
  }

  Future<Barangay?> getBarangayByName(String name) async {
    final db = await database;
    final rows = await db.query(
      'barangays',
      where: 'name = ?',
      whereArgs: [name],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return Barangay.fromMap(rows.first);
  }

  Future<Barangay?> getBarangayById(int id) async {
    final db = await database;
    final rows = await db.query(
      'barangays',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return Barangay.fromMap(rows.first);
  }

  // ---------- Alerts ----------

  Future<List<Alert>> getAlerts({bool onlyBroadcast = true}) async {
    final db = await database;
    final rows = await db.query(
      'alerts',
      orderBy: 'sent_at DESC',
      where: onlyBroadcast ? 'status = ?' : null,
      whereArgs: onlyBroadcast ? [AlertStatus.approved.value] : null,
    );
    return rows.map(Alert.fromMap).toList();
  }

  Future<List<Alert>> getPendingAlerts() async {
    final db = await database;
    final rows = await db.query(
      'alerts',
      where: 'status = ? AND source = ?',
      whereArgs: [AlertStatus.pending.value, 'barangay'],
      orderBy: 'sent_at DESC',
    );
    return rows.map(Alert.fromMap).toList();
  }

  Future<List<Alert>> getAllAlerts() async {
    final db = await database;
    final rows = await db.query('alerts', orderBy: 'sent_at DESC');
    return rows.map(Alert.fromMap).toList();
  }

  Future<List<Alert>> getMyAlerts(String createdBy) async {
    final db = await database;
    final rows = await db.query(
      'alerts',
      where: 'created_by = ?',
      whereArgs: [createdBy],
      orderBy: 'sent_at DESC',
    );
    return rows.map(Alert.fromMap).toList();
  }

  Future<int> insertAlert(Alert alert) async {
    final db = await database;
    return db.insert('alerts', {
      ...alert.toMap()..remove('id'),
      'synced': 0,
    });
  }

  Future<void> updateAlertStatus(int id, AlertStatus status, {String? rejectionReason}) async {
    final db = await database;
    await db.update(
      'alerts',
      {
        'status': status.value,
        'rejection_reason': rejectionReason,
        'synced': 0,
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<int> alertCount() async {
    final db = await database;
    final result = await db.rawQuery('SELECT COUNT(*) as c FROM alerts');
    return Sqflite.firstIntValue(result) ?? 0;
  }

  // ---------- Community Reports ----------

  Future<List<CommunityReport>> getReports({String? status, String? userName}) async {
    final db = await database;
    final conditions = <String>[];
    final args = <Object>[];

    if (status != null) {
      conditions.add('status = ?');
      args.add(status);
    }

    if (userName != null && userName.isNotEmpty) {
      conditions.add('user_name = ?');
      args.add(userName);
    }

    final rows = await db.query(
      'community_reports',
      orderBy: 'timestamp DESC',
      where: conditions.isEmpty ? null : conditions.join(' AND '),
      whereArgs: conditions.isEmpty ? null : args,
    );
    return rows.map(CommunityReport.fromMap).toList();
  }

  Future<int> insertReport(CommunityReport report) async {
    final db = await database;
    return db.insert('community_reports', {
      ...report.toMap()..remove('id'),
      'synced': 0,
    });
  }

  Future<void> updateReportStatus(int id, ReportStatus status, {String? rejectionReason}) async {
    final db = await database;
    await db.update(
      'community_reports',
      {
        'status': status.value,
        'rejection_reason': rejectionReason,
        'synced': 0,
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<int> reportCount() async {
    final db = await database;
    final result = await db.rawQuery('SELECT COUNT(*) as c FROM community_reports');
    return Sqflite.firstIntValue(result) ?? 0;
  }

  // ---------- Audit Logs ----------

  Future<List<AuditLog>> getAuditLogs() async {
    final db = await database;
    final rows = await db.query('audit_logs', orderBy: 'id DESC');
    return rows.map(AuditLog.fromMap).toList();
  }

  Future<int> insertAuditLog(AuditLog log) async {
    final db = await database;
    return db.insert('audit_logs', {
      ...log.toMap()..remove('id'),
      'synced': 0,
    });
  }

  // ---------- Reset (for development) ----------

  Future<void> resetDatabase() async {
    final db = await database;
    await db.delete('users');
    await db.delete('barangays');
    await db.delete('alerts');
    await db.delete('community_reports');
    await db.delete('audit_logs');
    await _seed(db);
  }
}

