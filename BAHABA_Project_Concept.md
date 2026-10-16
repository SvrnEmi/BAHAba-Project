# BAHAba Project — Concept & Runbook

## Overview
BAHAba is a community-centered flood communication prototype containing two related apps in this repository:

- Web prototype: React + Vite + Tailwind (root folder)
- Mobile app: Flutter (folder `bahaba_app/`) — Android-focused with optional web support

Purpose: provide residents and local government (MDRRMO, Barangay) tools to report flood observations, broadcast alerts, and visualize hazard maps.

---

## Key Features

- Resident flows: Splash → Login → Home → Hazard Map → Community Reports → Alerts
- Admin flows: Admin Selection → MDRRMO Dashboard → Barangay Dashboard → Alert management
- Local SQLite DB (seeded) for demo users, barangays, alerts, reports
- Maps using OpenStreetMap (`flutter_map`) with GPS capture
- Photo capture for reports (`image_picker`)
- Charts for admin analytics (`fl_chart`)

---

## Tech Stack

- Frontend (web prototype): React, Vite, Tailwind, React-Leaflet
- Mobile app: Flutter (Dart)
- Local DB: SQLite via `sqflite`
- State management: `provider`
- Storage: `shared_preferences`

---

## Repo Structure (important paths)

- `package.json` — web prototype dependencies and scripts
- `bahaba_app/` — Flutter app
  - `lib/main.dart` — app entry
  - `lib/app.dart` — MaterialApp and routing
  - `lib/data/database_helper.dart` — SQLite schema + seed
  - `lib/data/seed_data.dart` — initial data
  - `lib/models/` — data models (`alert_model.dart`, `community_report_model.dart`, `user_model.dart`, etc.)
  - `lib/providers/` — `ChangeNotifier` providers
  - `lib/repositories/` — data access layer (SQLite wrappers)
  - `lib/screens/` — UI screens

---

## Setup & Run (quick)

### Web prototype (root)

```bash
cd "<repo-root>"
npm install
npm run dev
```

Open the URL shown by Vite.

### Flutter app

Prereqs: Flutter SDK, Android Studio/SDK, connected device or emulator.

```bash
cd "<repo-root>/bahaba_app"
# (first-time only, to generate platform files)
flutter create --platforms=android .

flutter pub get
flutter run
```

Note: If `flutter` is not recognized, install Flutter and add `C:\src\flutter\bin` (or the correct SDK path) to your PATH, then restart the terminal.

---

## Data Model Summary

Primary domain models (high-level):

- User
  - id, name, email, passwordHash, role (Resident|Barangay|MDRRMO)
- Barangay
  - id, name, polygon/geojson, centerLat, centerLng
- Alert
  - id, title, body, level (Advisory|Warning|Critical), startAt, endAt, createdBy
- CommunityReport
  - id, reporterId, barangayId, lat, lng, waterLevel, photoPath, notes, status, createdAt
- AuditLog
  - id, userId, action, meta, timestamp

---

## Local Database & Seed

- DB uses `sqflite` and is seeded on first run from `seed_data.dart`.
- Seeded data includes: 9 barangays for Odiongan, Romblon; sample users and sample alerts/reports.

---

## Architecture & Patterns

- UI screens read/write through `providers` and `repositories`.
- `repositories` encapsulate raw `sqflite` queries and return typed models.
- `providers` expose state to the UI via `ChangeNotifier` and call repositories.
- No external backend: all data is local SQLite for prototype purposes.

---

## Testing & Debugging Tips

- Use Flutter's `flutter run` with `--debug` and Android emulator logs.
- Inspect SQLite contents using a DB browser on the device or by copying DB file from app data.
- To re-seed, clear app data or delete the DB file in the app documents directory.

---

## Deployment Notes

- Web prototype can be hosted on any static host after `npm run build` (Vite build output).
- Flutter mobile app: build APK or app bundle via `flutter build apk` / `flutter build appbundle`.

---

## Contribution

- Follow the existing `provider` pattern and keep repository methods single-responsibility.
- Add new models under `lib/models/`, migrations/seed updates in `lib/data/`.

---

## CRUD Example — `CommunityReport` (SQLite + Flutter)

This example shows the database schema, SQL for table creation, and a simple Dart `Repository` with `create`, `read`, `update`, `delete` operations using `sqflite`.

### Table schema (SQL)

```sql
CREATE TABLE community_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  barangay_id INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  water_level REAL,
  photo_path TEXT,
  notes TEXT,
  status TEXT DEFAULT 'submitted',
  created_at TEXT NOT NULL
);
```

### Example `DatabaseHelper` (important parts)

```dart
// lib/data/database_helper.dart
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;
  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, 'bahaba.db');
    _database = await openDatabase(path, version: 1, onCreate: _createDB);
    return _database!;
  }

  Future _createDB(Database db, int version) async {
    await db.execute('''
      CREATE TABLE community_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_id INTEGER NOT NULL,
        barangay_id INTEGER NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        water_level REAL,
        photo_path TEXT,
        notes TEXT,
        status TEXT DEFAULT 'submitted',
        created_at TEXT NOT NULL
      )
    ''');
    // run other table creates and seeding here
  }
}
```

### `CommunityReport` model (simplified)

```dart
// lib/models/community_report_model.dart
class CommunityReport {
  final int? id;
  final int reporterId;
  final int barangayId;
  final double lat;
  final double lng;
  final double? waterLevel;
  final String? photoPath;
  final String? notes;
  final String status;
  final DateTime createdAt;

  CommunityReport({
    this.id,
    required this.reporterId,
    required this.barangayId,
    required this.lat,
    required this.lng,
    this.waterLevel,
    this.photoPath,
    this.notes,
    this.status = 'submitted',
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  Map<String, dynamic> toMap() => {
    'id': id,
    'reporter_id': reporterId,
    'barangay_id': barangayId,
    'lat': lat,
    'lng': lng,
    'water_level': waterLevel,
    'photo_path': photoPath,
    'notes': notes,
    'status': status,
    'created_at': createdAt.toIso8601String(),
  };

  static CommunityReport fromMap(Map<String, dynamic> m) => CommunityReport(
    id: m['id'] as int?,
    reporterId: m['reporter_id'] as int,
    barangayId: m['barangay_id'] as int,
    lat: (m['lat'] as num).toDouble(),
    lng: (m['lng'] as num).toDouble(),
    waterLevel: m['water_level'] == null ? null : (m['water_level'] as num).toDouble(),
    photoPath: m['photo_path'] as String?,
    notes: m['notes'] as String?,
    status: m['status'] as String? ?? 'submitted',
    createdAt: DateTime.parse(m['created_at'] as String),
  );
}
```

### `CommunityReportRepository` (CRUD)

```dart
// lib/repositories/report_repository.dart
import 'package:sqflite/sqflite.dart';
import '../data/database_helper.dart';
import '../models/community_report_model.dart';

class ReportRepository {
  final dbHelper = DatabaseHelper.instance;

  Future<int> createReport(CommunityReport report) async {
    final db = await dbHelper.database;
    return await db.insert('community_reports', report.toMap());
  }

  Future<CommunityReport?> getReportById(int id) async {
    final db = await dbHelper.database;
    final maps = await db.query('community_reports', where: 'id = ?', whereArgs: [id]);
    if (maps.isNotEmpty) return CommunityReport.fromMap(maps.first);
    return null;
  }

  Future<List<CommunityReport>> getReports({int? barangayId}) async {
    final db = await dbHelper.database;
    final maps = await db.query(
      'community_reports',
      where: barangayId == null ? null : 'barangay_id = ?',
      whereArgs: barangayId == null ? null : [barangayId],
      orderBy: 'created_at DESC',
    );
    return maps.map((m) => CommunityReport.fromMap(m)).toList();
  }

  Future<int> updateReport(CommunityReport report) async {
    final db = await dbHelper.database;
    return await db.update(
      'community_reports',
      report.toMap(),
      where: 'id = ?',
      whereArgs: [report.id],
    );
  }

  Future<int> deleteReport(int id) async {
    final db = await dbHelper.database;
    return await db.delete('community_reports', where: 'id = ?', whereArgs: [id]);
  }
}
```

### Usage from a `Provider` or UI

```dart
final repo = ReportRepository();

// Create
await repo.createReport(CommunityReport(
  reporterId: 1,
  barangayId: 2,
  lat: 12.345,
  lng: 98.765,
  waterLevel: 0.8,
  notes: 'Road flooded near market',
  photoPath: '/path/to/photo.jpg',
));

// Read
final reports = await repo.getReports(barangayId: 2);

// Update
final r = reports.first;
final updated = CommunityReport(
  id: r.id,
  reporterId: r.reporterId,
  barangayId: r.barangayId,
  lat: r.lat,
  lng: r.lng,
  waterLevel: 1.2,
  photoPath: r.photoPath,
  notes: r.notes,
  status: 'verified',
  createdAt: r.createdAt,
);
await repo.updateReport(updated);

// Delete
await repo.deleteReport(r.id!);
```

---

## Final notes

This document should help you conceptualize the entire BAHAba prototype and the local data flows. If you want, I can:

- Generate new sample screens wired to this repository
- Add unit tests for the repository
- Create a small export/import CSV routine for reports

Tell me which next step you prefer.
