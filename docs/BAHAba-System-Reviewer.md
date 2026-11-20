Generated with AI assistance from the project code on 2026-11-20. The team must read it against the code and correct it.

# BAHAba System Reviewer

## 1. System overview

BAHAba helps people in Odiongan read flood estimates and alerts, and submit observations through web and Android screens (`src/app/routes.tsx` — `router`; `bahaba_app/lib/app.dart` — `BAHAbaApp`).
Supabase Auth identifies signed-in users, and the web app reads the account role from the profile to decide which page to show (`src/lib/auth.tsx` — `AuthProvider`; `src/app/components/ProtectedRoute.tsx` — `ProtectedRoute`).
Postgres stores shared records, applies row-level security (RLS), which controls access to individual rows, and runs triggers, which are functions called automatically when records change (`supabase/schema.sql` — `trg_profiles_updated_at`; flood-history migration — `flood_events_guard`).
The apps call Edge Functions, which are server endpoints, for work such as Quick Report and flood-risk refresh, and the risk screen attributes the rainfall estimates to Open-Meteo (`src/lib/quickReport.ts` — `invoke`; `src/lib/floodRisk.ts` — `runFloodRiskUpdate`; `src/app/components/RainfallInfo.tsx` — `RainfallInfoPage`).
Android registers with Firebase Cloud Messaging (FCM) to receive push notifications, while the deployed scheduler and sender require confirmation [verify V1–V3] (`bahaba_app/lib/services/push_notification_service.dart` — `PushNotificationService`).

```text
Web / Android -> Supabase Auth -> profile and role
Web / Android -> Postgres / Storage -> RLS + database triggers
Web / Android -> Edge Functions (Quick Report; web also requests a risk update)
pg_cron -> update-flood-risk -> Open-Meteo -> Postgres [verify V1–V2]
Alert change -> send-push -> Firebase -> Android [verify V3 for server path]
```

**Reading key.** “Baseline SQL” means `supabase/schema.sql`. “Setup SQL” means `supabase/final_setup.sql`. “Flood-history migration” means `supabase/migrations/20261025120000_add_flood_events_and_history.sql`. These files describe checked-in rules. Live deployment may differ [verify V1].

## 2. Roles and permissions

| Role | Can | Cannot | Enforcement or evidence |
| --- | --- | --- | --- |
| Guest | Send Quick Reports and read approved alerts under the required role rule | Open the hazard map or verify reports | `src/app/routes.tsx` — `router` and `ProtectedRoute` guard the map. Baseline SQL `alerts_public_read_approved` filters by approved status. The audited web resident alert routes are protected. An anonymous approved-alert screen or grant needs confirmation [verify V7]. |
| Resident | Use the hazard map, submit and track reports, read eligible alerts | Verify reports or publish official alerts under the required role rules | `src/lib/auth.tsx` — `RESIDENT_ONLY`; `src/app/components/CommunityReports.tsx` — `handleSubmit`; baseline SQL `reports_select_approved_or_own_or_mdrrmo` and `alerts_manage_mdrrmo`. Check server-side moderation boundaries [verify V6]. |
| Barangay official | View reports, comment, post advisories and publish directly to their barangay, up to five alerts per hour | Verify reports. Publishing is scoped to their barangay. | `src/app/components/barangay/BarangayAlerts.tsx` — `review`, `publish`; `src/lib/reportMessages.ts` — `useReportThread`; `src/lib/reportAdvisories.ts` — `useReportAdvisories`. The client describes the alert guard. Its SQL is missing [verify V5–V6]. |
| MDRRMO | Verify reports, manage municipal alerts and maintain flood events | Account administration through the three-role app is outside the audited interface | `src/app/components/MDRRMOAdminDashboard.tsx` — `saveReportReview`, `handleSendAlert`; baseline SQL `alerts_manage_mdrrmo`; migration `flood_events_insert_mdrrmo`, `flood_events_update_mdrrmo`, `flood_events_delete_mdrrmo`. |
| System administrator | Account operations described in the existing reviewer require confirmation | The normal web app accepts only resident, barangay and MDRRMO roles | `src/lib/auth.tsx` — `parseRole`; `src/app/components/ProtectedRoute.tsx` — `WelcomeRoute`, `SignOutMissingProfile`. Confirm `superadmin-users` and its authorization [verify V8]. |

The public `/conditions` route and Android `GuestConditionsScreen` expose a ground-conditions screen. This is extra guest UI compared with the required role rule. Confirm the deployed data that a guest can read [verify V7]. (`src/app/routes.tsx` — `router`; `src/app/components/GuestConditions.tsx` — `GuestConditions`; `bahaba_app/lib/screens/guest_conditions_screen.dart` — `GuestConditionsScreen`.)

## 3. Algorithms

### A. Flood-risk engine

**Purpose and inputs.** Estimate risk per barangay from modelled rainfall. The UI describes the worst three-hour burst and total over the next 24 hours. It reads adjustable rules from `risk_settings` and exposes forecast horizons and source labels. (`src/app/components/RainfallInfo.tsx` — `RainfallInfoPage`; `src/app/components/settings/AutomationSection.tsx` — `DEFAULTS`, `fromRow`, `validate`; `src/lib/floodRisk.ts` — `riskSourceLabel`.)

1. The UI describes comparing the two rain totals independently and using the higher level. Defaults are 30 mm and 60 mm for medium and high in three hours, and 50 mm and 100 mm in 24 hours. (`RainfallInfoPage`; `AutomationSection.tsx` — `DEFAULTS`.)
2. A manual override is a temporary official setting. The UI defaults it to six hours. A hold-down delays lowering the risk, with a three-hour default. Verify the backend order of manual override, hold-down and simulation [verify V2]. (`RainfallInfoPage`; `AutomationSection.tsx` — `DEFAULTS`.)
3. Simulation supplies a rain rate, duration and expiry through the single-row `RAIN_SIMULATION` contract. A forced run requires a signed-in session and throws an error if the function call fails. (`src/lib/floodRisk.ts` — `RAIN_SIMULATION`, `runFloodRiskUpdate`.)

**Example.** A three-hour total of 35 mm is medium. A 24-hour total of 105 mm is high. The displayed rule returns high. **Edge cases.** The settings validator checks threshold order and bounds. Confirm exact window indexing, forecast projections, equality at the boundary, cooldown and the outcome after missing, partial or stale rainfall [verify V2]. A client error only shows the refresh failed. It cannot establish how the server preserved or replaced prior data. (`AutomationSection.tsx` — `validate`; `RainfallInfoPage`; `runFloodRiskUpdate`.)

### B. Alert publishing

**Purpose and inputs.** Turn an official's severity, title, message and expiry into an alert. An all-clear is an alert that communicates the end of danger. A preview lets the official inspect the text. (`src/app/components/barangay/BarangayAlerts.tsx` — `review`, `startAllClear`, `ConfirmPublish`; `src/lib/alerts.ts` — `alertEndIso`, `allClearTitle`.)

1. The barangay official previews and publishes directly. The web client describes a server guard that sets the audience, source and published status. Confirm exact forced fields, ownership and rate-limit counting in the deployed trigger [verify V5]. (`BarangayAlerts.tsx` — `publish` and header comment.)
2. When the official withdraws their own alert, the client sends withdrawn status and a trimmed reason. The client describes a minimum of three characters and a server timestamp [verify V5 for enforcement]. (`src/lib/alerts.ts` — `withdrawAlert`; `BarangayAlerts.tsx` — `BarangayAlertsSection`.)
3. The MDRRMO sends an approved alert to selected targets or the municipality and records an audit entry. Web helpers support editing and republishing eligible rows. (`src/app/components/MDRRMOAdminDashboard.tsx` — `handleSendAlert`; `src/lib/alerts.ts` — `republishAlert`, `editAlert`.)

**Example.** If five qualifying alerts count in the same hour, the sixth is over the documented barangay limit. **Edge cases.** Check simultaneous publishes and what starts the one-hour interval [verify V5]. The resident client refreshes the `active_alerts` view once per visible minute and on alert changes. Exact expiry and all-clear selection comes from a view definition missing in this checkout [verify V5]. (`BarangayAlerts.tsx` — `publish`; `src/lib/residentAlerts.ts` — `useResidentAlerts`.)

### C. Push delivery

**Purpose and inputs.** Deliver alerts to registered devices. A device token is a Firebase address for an app installation. Notification preferences store whether push is enabled and the chosen alert levels. (`bahaba_app/lib/services/push_notification_service.dart` — `registerDevice`, `_upsertToken`; `src/lib/profile.ts` — `parseNotificationPrefs`.)

1. Android requests permission and obtains the device token. It saves the token against the signed-in user and repeats the write when Firebase changes the token. (`push_notification_service.dart` — `registerDevice`, `_upsertToken`.)
2. The database trigger, barangay/device matching, push and level filtering, FCM request, retries and server cleanup of dead tokens all require source confirmation [verify V3]. A dead token is one that Firebase can no longer deliver to. (`src/lib/profile.ts` — `parseNotificationPrefs`; server implementation absent.)
3. The app displays an incoming foreground message and opens Alerts from a notification tap. Android unregisters its device during logout-related cleanup. (`push_notification_service.dart` — `init`, `_showForeground`, `unregisterDevice`.)

**Example.** A user selects two levels, warning and critical. `parseNotificationPrefs` reads those two choices. Confirm the server honors them for an advisory [verify V3]. **Edge cases.** Denied permission and no signed-in user stop registration. Firebase startup failure allows app startup to continue. (`push_notification_service.dart` — `registerDevice`, `_upsertToken`; `bahaba_app/lib/main.dart` — `main`.)

### D. Quick Report anti-abuse

**Purpose and inputs.** Allow a guest to submit water level, location or barangay, a landmark, optional contact details and optional evidence. The request also carries a device identifier and a honeypot field, which is a field intended to catch automated form fillers. (`src/lib/quickReport.ts` — `QuickReportInput`, `getDeviceId`, `submitQuickReport`; `src/app/components/QuickReport.tsx` — `QuickReport`.)

1. The browser keeps an identifier in browser storage. If storage fails, it keeps one in memory. The client calls the same endpoint with `status` or `submit`. (`quickReport.ts` — `getDeviceId`, `quickReportStatus`, `submitQuickReport`.)
2. The UI handles `blocked`, `limit`, `ip_limit` and `busy`. The client documents three reports per device. Confirm server hashing (turning an input into a fingerprint), network limits, honeypot handling, geofence, required fields, concurrent counting and block/unblock semantics [verify V4]. (`quickReport.ts` — `FRIENDLY`, `invoke`; `src/app/components/QuickReportsPanel.tsx` — `QuickReportCard`, `ReasonDialog`.)
3. If the endpoint returns upload authorization, the client can upload a photo using that limited permission. The web encoder reduces image dimensions and quality to fit a 2 MiB limit. (`quickReport.ts` — `compressPhoto`, `uploadQuickReportPhoto`.)

**Example.** After three allowed submissions, a fourth from the same identifier should hit the documented device limit [verify V4]. **Edge cases.** Browser storage failure changes how long the identifier lasts. A report can receive an upload response and then encounter a separate upload error. Check what record remains if the photo fails [verify V4]. (`quickReport.ts` — `getDeviceId`, `invoke`, `uploadQuickReportPhoto`.)

### E. Report lifecycle, messages, advisories and audit

**Purpose and inputs.** Convert a report into visible evidence only after MDRRMO review. Inputs include location, category, description, optional image and a review decision with a reason. (`src/app/components/CommunityReports.tsx` — `handleSubmit`; `src/app/components/MDRRMOAdminDashboard.tsx` — `saveReportReview`.)

1. The signed-in web form checks for a pending report, handles the photo upload and writes a pending row. MDRRMO writes approved or rejected and clears the reason from the opposite decision. The public-facing community feed uses approved or legacy verified status. (`CommunityReports.tsx` — `handleSubmit`, `isApprovedReportStatus`; `MDRRMOAdminDashboard.tsx` — `saveReportReview`.)
2. The Quick Report review screen supports approval, rejection and a separate false-report flag. Its UI can clear the flag. Whether a flag alters device blocking is a backend question [verify V4]. (`src/app/components/QuickReportsPanel.tsx` — `updateReport`, `QuickReportCard`, `ReasonDialog`.)
3. Barangay officials can comment and post advisories. Messages are private report discussion under the role rule. Advisories are official notes surfaced on posted reports. Check the deployed role, author and visibility policies [verify V6]. (`src/lib/reportMessages.ts` — `useReportThread`, `sendableBody`; `src/lib/reportAdvisories.ts` — `useReportAdvisories`, `postableAdvisory`; `src/app/components/PostedReports.tsx` — `PostedReportPage`.)
4. An audit log is a record of who did what. The web helper inserts audit rows. Flood-event changes have a separate database audit trigger. Review audit coverage needs confirmation [verify V6]. (`src/lib/audit.ts` — `writeAuditLog`; flood-history migration — `flood_events_audit`.)

**Example.** A resident submits report 42. While it is pending, a second submission hits the form check. An MDRRMO approval makes report 42 eligible for the posted feed. **Edge cases.** The client precheck alone cannot prevent two simultaneous submissions. Verify database constraints and status guards [verify V6]. (`CommunityReports.tsx` — `handleSubmit`, `isApprovedReportStatus`; `MDRRMOAdminDashboard.tsx` — `saveReportReview`.)

### F. Hazard map and Baha History

**Purpose and inputs.** The hazard map shows current barangay risk. Baha History shows approved location evidence over time. Inputs are barangay coordinates, risk fields, an optional flood-event ID and approved geolocated reports. (`src/app/components/GISHazardMap.tsx` — `toZone`, `GISHazardMap`; flood-history migration — `flood_history`.)

1. Web converts barangay rows into map zones and drops rows without valid coordinates. Android loads barangays through its provider and can ask the phone for location permission. (`GISHazardMap.tsx` — `toZone`; `bahaba_app/lib/providers/resident_providers.dart` — `BarangayProvider.load`; `bahaba_app/lib/screens/resident/hazard_map_screen.dart` — `_startLocationUpdates`.)
2. History requests event options and calls the `flood_history` remote procedure (RPC), which is a database function invoked by the client. SQL merges approved community and Quick Reports with coordinates, excludes flagged Quick Reports, filters on inclusive start and end times when an event is selected, and caps the result at 2,000. It returns a limited display record without reporter contact details. (Flood-history migration — `flood_history`; `src/lib/floodHistory.ts` — `fetchFloodEvents`, `fetchFloodHistory`.)
3. The web map fits the returned markers, loads a photo when a report opens and uses a signed URL where required. Android uses the same history RPC through its repository. (`src/app/components/BahaHistoryMap.tsx` — `fit`, `ReportDetail`; `src/lib/floodHistory.ts` — `historyPhotoUrl`; `bahaba_app/lib/repositories/flood_history_repository.dart` — `FloodHistoryRepository`.)

**Example.** An approved report at 10:00 within a 09:00–12:00 event is eligible if coordinates exist and the report passes the type-specific filters. **Edge cases.** Missing coordinates exclude a report. A nonexistent event ID matches no window. A null event ID removes the window filter. Missing or unauthorized photos have a separate display outcome. (Flood-history migration — `flood_history`; `BahaHistoryMap.tsx` — `ReportDetail`.)

## 4. Code walkthrough

### Web

- `src/lib/supabase.ts` exports `supabase`, the shared client used by account, table, file and function calls. It reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `src/lib/auth.tsx` — `AuthProvider` loads session and profile state. `parseRole` accepts the three app roles. `src/app/routes.tsx` — `router` wraps role-only pages in `ProtectedRoute`, defined in `src/app/components/ProtectedRoute.tsx`. The guard waits for the profile, then redirects signed-out or wrong-role users.
- `src/app/components/GuestConditions.tsx` — `GuestConditions` is called by the public conditions route. It lets a guest select a barangay and uses the ground-report UI. `src/lib/fieldObservations.ts` — `useGroundReports` supplies field-observation data to ground-report consumers.
- `src/app/components/CommunityReports.tsx` — `CommunityReports` loads the resident feed. Its `handleSubmit` calls profile, report and photo storage operations. `src/app/components/PostedReports.tsx` — `PostedReportPage` renders the single-report route.
- `src/app/components/QuickReport.tsx` — `QuickReport` calls the status and submit helpers in `src/lib/quickReport.ts`. The helper `invoke` translates service errors and calls the Edge Function.
- `src/app/components/BarangayAdminDashboard.tsx` — `BarangayAdminDashboard` is the local admin route. `src/app/components/barangay/BarangayAlerts.tsx` — `BarangayAlertsSection` calls the alert table and preview/withdraw helpers.
- `src/app/components/MDRRMOAdminDashboard.tsx` — `MDRRMOAdminDashboard` loads reports, alerts, profile counts and audit records. `saveReportReview` writes decisions. `src/app/components/QuickReportsPanel.tsx` — `QuickReportsPanel` handles the guest-submission review queue.
- `src/lib/reports.ts` — `reportBelongsToBarangay` matches using location information and configured barangay points. Its distance helper computes distance between coordinates. The result is a client-side assignment rule, so verify the database's independently enforced scope [verify V6].
- `src/app/components/GISHazardMap.tsx` — `GISHazardMap` maps current barangay data. `src/app/components/BahaHistoryMap.tsx` — `BahaHistoryMap` uses `src/lib/floodHistory.ts` for history and photos. `src/lib/floodEventReport.ts` — `fetchEventSummary` calls the summary RPC. `buildReportPdf` and `buildReportZip` produce exports [verify V9 for the RPC body].
- `src/app/components/settings/AutomationSection.tsx` — `AutomationSection` reads settings and passes them to the form. `validate` checks edits. `src/lib/bahaCountdown.ts` — `bahaCountdown` derives text from a forecast row and the current time. `expectedImpact` is a separate display heuristic.
- `src/lib/residentAlerts.ts` — `useResidentAlerts` selects local and municipality-wide active alerts, subscribes to alert changes and refreshes while visible. `src/lib/alerts.ts` — `toAlertRow` normalizes returned rows and `withdrawAlert` writes a withdrawal.

### Android

- `bahaba_app/lib/main.dart` — `main` initializes Firebase and Supabase, installs providers and starts synchronization. Android reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. `bahaba_app/lib/app.dart` — `BAHAbaApp` builds the root app.
- `bahaba_app/lib/repositories/auth_repository.dart` — `AuthRepository` handles account calls. `bahaba_app/lib/providers/app_state.dart` — `AppState` holds shared app state. `bahaba_app/lib/repositories/profile_repository.dart` — `ProfileRepository.fetchNotificationPrefs` loads preference data for account UI.
- `bahaba_app/lib/providers/resident_providers.dart` — `BarangayProvider.load`, `AlertProvider.load` and `ReportProvider.submit` connect screen state to data operations. `bahaba_app/lib/repositories/alert_repository.dart` — `AlertRepository.publishBarangayAlert` sends the barangay publish request. `bahaba_app/lib/repositories/report_repository.dart` — `ReportRepository.submit` handles a signed-in report.
- `bahaba_app/lib/providers/admin_providers.dart` — `AdminAlertProvider`, `AdminReportProvider` and `AuditProvider` supply administrative state. `bahaba_app/lib/screens/admin/mdrrmo_dashboard_screen.dart` and `bahaba_app/lib/screens/admin/barangay_dashboard_screen.dart` define `MDRRMOAdminDashboardScreen` and `BarangayAdminDashboardScreen`, the role-specific dashboards.
- `bahaba_app/lib/screens/resident/hazard_map_screen.dart` — `HazardMapScreen` renders current map data. `bahaba_app/lib/screens/resident/baha_history_screen.dart` — `BahaHistoryScreen` loads events and reports using `bahaba_app/lib/repositories/flood_history_repository.dart` — `FloodHistoryRepository`. `bahaba_app/lib/models/flood_event_model.dart` defines the history data records.
- `bahaba_app/lib/services/quick_report_service.dart` — `QuickReportService.submit` and `uploadPhoto` handle the guest request and evidence transfer. `bahaba_app/lib/services/push_notification_service.dart` — `PushNotificationService` registers devices and handles incoming notifications.
- `bahaba_app/lib/data/database_helper.dart` — `DatabaseHelper._onCreate` creates the local SQLite database. SQLite is an on-device database. `bahaba_app/lib/services/sync_service.dart` — `SyncService.syncPending` attempts pending writes and `pullRemote` fetches shared records. This is a local-data path. Confirm offline behavior per feature [verify V10].

### Database and Edge Functions

- Baseline SQL and setup SQL create the five core tables and initial policies. `set_updated_at` stamps profile updates. `supabase/create_profiles_and_assign_barangay.sql` defines an alternate profile setup. Confirm which scripts and later migrations are deployed [verify V1].
- The flood-history migration defines `flood_events_guard`, `flood_events_audit` and `flood_history`. `supabase/migrations/20261025120100_revoke_flood_event_trigger_functions.sql` revokes direct execution of both trigger functions.
- **`update-flood-risk`** is called by `src/lib/floodRisk.ts` — `runFloodRiskUpdate`. Handler source and scheduler are missing [verify V1–V2].
- **`quick-report`** is called by `src/lib/quickReport.ts` — `invoke` and by `bahaba_app/lib/services/quick_report_service.dart` — `QuickReportService`. Handler source is missing [verify V4].
- **`send-push`** and **`superadmin-users`** were requested for review. Handler source and callable entry points are absent from the checkout [verify V3, V8]. The Android receiver is independently visible in `push_notification_service.dart` — `PushNotificationService`.

## 5. Database reference

### Tables with checked-in definitions

| Table | Purpose, keys and relations |
| --- | --- |
| `profiles` | Account profile. UUID `id` references `auth.users`. Includes name, email, phone, role and text barangay. Baseline SQL, `CREATE TABLE profiles`. |
| `barangays` | Barangay name, coordinates, flood risk and update time. Baseline SQL, `CREATE TABLE barangays`. |
| `alerts` | Alert level, title, message, text target, source, state and send time. Baseline SQL, `CREATE TABLE alerts`. Newer lifecycle fields are read by `src/lib/alerts.ts` — `ALERT_COLUMNS` [verify V5]. |
| `community_reports` | Reporter name, location, coordinates, water level, description, photo path, time and review state. Baseline SQL, `CREATE TABLE community_reports`. Later fields need schema confirmation [verify V6]. |
| `audit_logs` | Action, actor display name, timestamp and details. Baseline SQL, `CREATE TABLE audit_logs`. Flood-event changes write here via `flood_events_audit`. |
| `flood_events` | Named time window with `id`, `start_at`, `end_at` and `created_by` referencing `profiles.id`. Flood-history migration, `CREATE TABLE flood_events`. |

### Tables referenced by code or SQL

| Table | Visible contract |
| --- | --- |
| `quick_reports` | Guest reports with time, coordinates, review state, false-report flag and evidence. `src/app/components/QuickReportsPanel.tsx` — `COLUMNS`; flood-history migration — `flood_history` [verify V4]. |
| `risk_settings` | Settings row with thresholds, enable switch, manual duration and hold-down. `src/app/components/settings/AutomationSection.tsx` — `AutomationSection`, `fromRow` [verify V2]. |
| `rain_simulation` | Simulation row with active state, rate, duration and expiry. `src/lib/floodRisk.ts` — `RAIN_SIMULATION` [verify V2]. |
| `device_tokens` | Device registration tied to a signed-in user. `bahaba_app/lib/services/push_notification_service.dart` — `_upsertToken` [verify V3]. |
| `report_messages` | Report-linked messages and sender information. `src/lib/reportMessages.ts` — `toMessage`, `useReportThread` [verify V6]. |
| `report_advisories` | Report-linked advisory body and author metadata. `src/lib/reportAdvisories.ts` — `useReportAdvisories`, `ADVISORY_COLUMNS` [verify V6]. |
| `field_observations` | Barangay, observation kind, status and location. `src/lib/fieldObservations.ts` — `listObservations`, `createObservation` [verify V7]. |
| `pagasa_levels` | Alert reference data read by the web client. `src/lib/alerts.ts` — `usePagasaLevels` [verify V1]. |

| `rainfall_forecast` | Hourly forecast records read by `src/app/components/RainfallForecastPanel.tsx` — `loadForecastRows` [verify V2 for schema]. |
| `app_versions` | Release information read by `src/lib/appVersions.ts` — `loadLatestApkUrl` [verify V1 for schema]. |

### Views, triggers and helpers

- `all_reports` supplies a barangay-filtered report list in `src/app/components/barangay/AllReports.tsx` — `fetchRows`. Confirm its SQL type and access rules [verify V6].
- `barangay_return_to_auto` is called by `src/app/components/barangay/BarangayStatusPanel.tsx` — `ManualLevel`. Confirm its database definition [verify V2].
- `active_alerts` is a view, a named query read like a table. `src/lib/residentAlerts.ts` — `useResidentAlerts` reads it. Confirm its SQL and grants [verify V5].
- `trg_profiles_updated_at` invokes `set_updated_at`. Baseline SQL. `flood_events_guard` checks event metadata before insert/update. `flood_events_audit` records event changes. Flood-history migration.
- `flood_history` returns an approved evidence projection. `is_mdrrmo` is referenced by the event policies. Its definition needs confirmation [verify V1]. `flood_event_summary` is called by `src/lib/floodEventReport.ts` — `fetchEventSummary`. Its definition needs confirmation [verify V9].
- Baseline SQL policy `report_photos_public_read` allows reads from the community photo bucket. The flood-history migration policy `quick_report_photos_select_history` allows authenticated reads of eligible Quick Report evidence. Confirm deployed bucket settings and grants [verify V6].
- Android SQLite tables are `users`, `barangays`, `alerts`, `community_reports` and `audit_logs` [verify V10 for active usage]. See `bahaba_app/lib/data/database_helper.dart` — `_onCreate`.

## 6. Likely panel questions

| Question | Short answer and evidence |
| --- | --- |
| Can a barangay publish an alert immediately? | Yes. It can publish to its own barangay after preview, with a documented five-per-hour cap. MDRRMO verifies reports. See `BarangayAlerts.tsx` — `publish` and `MDRRMOAdminDashboard.tsx` — `saveReportReview`. |
| Why use two rainfall windows? | The shorter window detects intense rain and the longer window captures accumulation. The UI says to use the higher risk. See `RainfallInfo.tsx` — `RainfallInfoPage`. |
| What separates push from live page refresh? | The resident page re-reads alerts while it is open. Android can receive FCM messages and open Alerts from a tap. See `residentAlerts.ts` — `useResidentAlerts`; `push_notification_service.dart` — `init`. |
| Why is storing barangay as text a weakness? | Spelling differences can affect a name match. The baseline defines text fields without a barangay foreign key. See baseline SQL — `CREATE TABLE profiles`, `CREATE TABLE alerts`; `src/lib/reports.ts` — `reportBelongsToBarangay`. |
| Are all database reads narrowly scoped? | The baseline profile SELECT policy permits any authenticated caller. A screen's filter is separate from RLS. Confirm live grants and policies [verify V6]. See baseline SQL — `profiles_select_own_or_authenticated`. |
| Is the evacuation-centers table used? | `evacuation_centers` did not appear in the checked-in SQL or audited client search. Confirm whether it exists in the deployment and whether any external job uses it [verify V9]. |
| Does the displayed countdown prove water depth? | The code derives the display from forecast fields and a heuristic. Treat it as an estimate. See `src/lib/bahaCountdown.ts` — `bahaCountdown`, `expectedImpact`. |
| How do you know a policy actually works? | Check the deployed policy and test using the role it applies to. A browser redirect proves only the client guard. See `ProtectedRoute.tsx` — `ProtectedRoute`; baseline SQL — `reports_update_admin_or_owner` [verify V6]. |

## 7. How to debug

| Symptom | Likely cause to investigate | Where to check |
| --- | --- | --- |
| A signed-in user lands on the wrong dashboard | Missing or unexpected profile role | `src/lib/auth.tsx` — `AuthProvider`, `parseRole`; `ProtectedRoute.tsx` — `ProtectedRoute`. |
| Risk stays unchanged | Automation state, active override, hold-down or scheduler failure | `AutomationSection.tsx` — `fromRow`; `floodRisk.ts` — `runFloodRiskUpdate` [verify V2]. |
| Barangay publish is rejected | Hourly cap, validation, or wrong role/audience | `BarangayAlerts.tsx` — `review`, `publish`; deployed guard [verify V5]. |
| Alert appears in app, but phone is silent | Permission, device registration, preference or server send | `push_notification_service.dart` — `registerDevice`, `_upsertToken`; deployed delivery [verify V3]. |
| Quick Report fails | Function error, quota or separate photo upload failure | `quickReport.ts` — `invoke`, `uploadQuickReportPhoto` [verify V4]. |
| Approved report is missing from history | Missing coordinates, event dates or false-report flag | Flood-history migration — `flood_history`; `BahaHistoryMap.tsx` — `BahaHistoryMap`. |
| An event export fails | Summary RPC failure or export problem | `floodEventReport.ts` — `fetchEventSummary`, `buildReportPdf`, `buildReportZip` [verify V9]. |
| An Android screen shows old data | Local data was shown or remote sync failed | `sync_service.dart` — `pullRemote`, `syncPending`; `resident_providers.dart` — `BarangayProvider.load` [verify V10]. |

## 8. Glossary

| Term | Meaning |
| --- | --- |
| MDRRMO | Municipal Disaster Risk Reduction and Management Office. |
| RLS | Row-level security. Database rules for who may read or change individual records. |
| Trigger | Code that runs automatically on a database event such as inserting or changing a row. |
| Edge Function | A server endpoint called by an app or another service. |
| RPC | A call to a named database function. |
| pg_cron | A Postgres scheduler that runs jobs at set times. BAHAba's job definition requires verification. |
| Open-Meteo | The weather-model data source named in the rainfall UI. |
| FCM | Firebase Cloud Messaging. It routes messages to registered devices. |
| Hold-down | A delay before the displayed risk can fall. |
| Manual override | A time-limited risk level set by an official. |
| Honeypot | A form field intended to identify automated fills. |
| Hash | A derived fingerprint of input data. |
| Signed URL | A URL that grants limited permission to access a file. |
| Foreign key | A database rule that ties one row to an existing row in another table. |

## 9. Items to verify with the team

1. **[verify V1] Deployment inventory.** Obtain the four Edge Function sources, current SQL schema, grants and applied migrations. Confirm `pg_cron` job ownership and cadence, and the `is_mdrrmo` definition.
2. **[verify V2] Risk engine.** Confirm Open-Meteo inputs, historic and future window indexing, projection horizons, threshold equality, override and simulation precedence, cooldown, safe failure and partial data handling.
3. **[verify V3] Push.** Confirm the database trigger, `send-push` authorization and recipient filtering, retry behavior, dead-token cleanup and real-device receipt.
4. **[verify V4] Quick Report.** Confirm hashing, device and network quotas and time windows, honeypot, Odiongan validation, concurrency, false-report block/unblock and failed-photo handling.
5. **[verify V5] Alerts.** Identify the actual guard and policies for direct publishing, five-per-hour enforcement, forced fields, withdrawal, expiry and all-clear. Confirm the `active_alerts` definition.
6. **[verify V6] Reports and access.** Confirm MDRRMO-only verification, barangay report scope, private messages and advisory visibility, photo and profile grants, duplicate-report guard and review audit coverage.
7. **[verify V7] Guests.** Confirm anonymous approved-alert access, ground-conditions access, field observations and map exclusion across both clients.
8. **[verify V8] System administrators.** Confirm `superadmin-users` authorization, supported account actions and audit coverage.
9. **[verify V9] History and deployment-only objects.** Obtain `flood_event_summary` SQL. Confirm whether `evacuation_centers` exists or has external consumers.
10. **[verify V10] Android storage.** Confirm which local tables each feature uses and how it behaves offline in the current app build.

### Corrections carried forward from the earlier reviewer

- Direct barangay publish replaces the pending-approval workflow described in `BAHABA_FUNCTIONS_AND_SCREENS.md` under Barangay dashboard and Core Workflows. The web code describes direct publishing (`BarangayAlerts.tsx` — `publish`).
- The defense rule is MDRRMO-only report verification. Barangay officials view and add context. Compare the earlier reviewer wording with `MDRRMOAdminDashboard.tsx` — `saveReportReview`, and `reportMessages.ts` — `useReportThread`.
- Earlier material described demo map data and missing route guards. The current map uses barangay rows and the router wraps the resident map with a guard (`GISHazardMap.tsx` — `toZone`; `routes.tsx` — `router`).
- Earlier readiness entries assumed live scheduling and backend policy behavior. This guide marks that evidence for confirmation. The guest role statement also needs reconciliation with the protected web alert route and public ground-conditions route (`routes.tsx` — `router`).
