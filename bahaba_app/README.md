# BAHAba Flutter App

Community-Centered Flood Communication System — Android mobile app.

This is the Flutter (Android) version of the BAHAba Prototype. The web prototype lives in the parent directory (React + Vite + Tailwind).

## Features

**Resident App**
- Splash, Login, Register (Supabase Auth with profile data in the `profiles` table)
- Home — current flood status, quick access, hazard map preview
- Hazard Map — OpenStreetMap (flutter_map) with barangay flood zones, GPS location
- Alerts — official MDRRMO alerts from the local DB
- Community Reports — submit flood observations with GPS capture, water level, and photo

**Admin Apps**
- Admin Selection — choose MDRRMO or Barangay role
- MDRRMO Dashboard — system stats, analytics charts (fl_chart), ISO-standard alert levels (Advisory/Warning/Critical), multi-channel broadcast (Push/SMS/Facebook/X), verify barangay alerts, audit trail
- Barangay Dashboard — create alerts, submit to MDRRMO for verification, view barangay reports

## Data and Authentication
Authentication is handled by Supabase Auth. Resident profile data is stored in the Supabase `profiles` table. When email confirmation is enabled, registration asks the user to confirm their email before the first sign-in; the profile is created from the saved Auth metadata after confirmation.

Mobile domain data is also stored in a temporary local SQLite database via `sqflite`. It is seeded on first launch with:
- 9 barangays with real GIS coordinates for Odiongan, Romblon
- Default users:
  - `resident@bahaba.app` / `resident123` (Resident)
  - `mdrrmo@bahaba.app` / `mdrrmo123` (MDRRMO Admin)
  - `barangay@bahaba.app` / `barangay123` (Barangay Admin)

## Tech Stack
- Flutter (Android)
- Supabase Auth and `profiles` (authentication and user profiles)
- sqflite (local DB), provider (state), shared_preferences (local session context)
- flutter_map + OpenStreetMap (no API key), geolocator, image_picker
- fl_chart (admin analytics)

## Setup Instructions

### Prerequisites
1. Install the Flutter SDK: https://docs.flutter.dev/get-started/install
2. Install Android Studio + Android SDK (API 34)
3. Create `bahaba_app/.env` with `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.

### Run
```bash
cd bahaba_app

# Generate missing platform scaffolding (gradle wrapper, launcher icons)
flutter create --platforms=android .

# Install dependencies
flutter pub get

# Launch on connected Android device/emulator
flutter run
```

## Project Structure
```
lib/
  main.dart                 # Entry point, provider setup
  app.dart                  # MaterialApp, routing
  theme/app_theme.dart      # Colors, theme
  models/                   # Data models (Barangay, Alert, Report, User, AuditLog)
  data/database_helper.dart # SQLite schema + seed
  data/seed_data.dart       # Barangay GIS data, default users, sample data
  repositories/             # Data access layer
  providers/                # ChangeNotifier state
  screens/                  # All screens (resident + admin)
  widgets/                  # Reusable widgets
```

