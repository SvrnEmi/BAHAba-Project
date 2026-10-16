# BAHAba Flutter App — Development TODO

## Sprint 0 — Project Setup
- [x] Flutter project structure (`bahaba_app/`)
- [x] `pubspec.yaml` with dependencies (sqflite, flutter_map, geolocator, image_picker, fl_chart, provider, shared_preferences)
- [x] Android platform scaffold (build.gradle, AndroidManifest.xml, MainActivity, resources)
- [x] App theme, constants, main.dart entry point

## Sprint 1 — Data Layer
- [x] Models: Barangay, Alert, CommunityReport, User, AuditLog
- [x] SQLite database schema + helper (`DatabaseHelper`)
- [x] Seed data: 9 barangays with real GIS coordinates, default users, sample alerts/reports
- [x] Repositories (auth, barangay, alert, report, audit)

## Sprint 2 — Auth & Onboarding
- [x] Splash screen (branding + session check)
- [x] Login screen (local DB authentication)
- [x] Register screen (creates resident account in local DB)
- [x] Session persistence via shared_preferences

## Sprint 3 — Resident App
- [x] Main shell with bottom navigation (Home, Map, Alerts, Reports)
- [x] Home screen (current flood status, quick access, hazard map preview)
- [x] Hazard Map (flutter_map + OpenStreetMap + flood zone circles + GPS)
- [x] Alerts screen (from local DB)
- [x] Community Reports (GPS capture, water level, photo upload, submit)

## Sprint 4 — Admin Apps
- [ ] Admin Selection screen
- [ ] MDRRMO Admin Dashboard (stats, charts, ISO alert levels, multi-channel broadcast, verify barangay alerts, audit trail)
- [ ] Barangay Admin Dashboard (create alert → MDRRMO verification workflow)

## Sprint 5 — Docs & Wrap-up
- [ ] README with install/run instructions
- [ ] Final review and summary

## Post-Install Steps (when Flutter SDK is installed)
- [ ] Run `flutter create --platforms=android .` to generate missing scaffolding (icons, gradle wrapper)
- [ ] Run `flutter pub get` to install dependencies
- [ ] Run `flutter run` to launch on Android device/emulator

