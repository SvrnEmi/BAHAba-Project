 # BAHAba Functions and Screens

 ## 1. Product Overview

 BAHAba is a community-centered flood communication system for Odiongan, Romblon. It connects residents, Barangay officials, and the Municipal Disaster Risk Reduction and Management Office (MDRRMO) through:

 - Flood-risk visibility by Barangay
 - Official flood alerts
 - GPS-based community flood reports
 - Photo evidence and water-level observations
 - Review and approval workflows
 - Administrative monitoring and analytics
 - Online and offline-aware mobile experiences

 The repository contains two clients:

 | Client | Location | Main purpose | Data source |
 | --- | --- | --- | --- |
 | Web prototype | Repository root (`src/`) | Browser-based resident and admin prototype | Supabase |
 | Flutter mobile app | `bahaba_app/` | Android-focused resident/admin app | Supabase Auth plus local SQLite/cache with providers and repositories |

 The web implementation is the current source of truth for the routes and Supabase approval behavior described below. The Flutter app uses Supabase Auth and shared Supabase profile data for authentication, while retaining local SQLite and its own navigation/provider layer for mobile data workflows.

 ## 2. User Roles

 ### Resident

 Residents can:

 - Create an account with name, email, phone number, Barangay, and password.
 - Sign in through Supabase Auth.
 - View the current flood status and a map preview.
 - Open the GIS hazard map and inspect Barangay risk zones.
 - Read approved official alerts.
 - Submit a flood report with a location, GPS coordinates, water level, description, and optional photo.
 - View approved community reports.

 ### Barangay Admin

Barangay administrators manage the Barangay assigned to their authenticated profile. They can:

 - View resident, alert, report, and water-level statistics for the Barangay.
 - Draft and submit an advisory, warning, or critical alert.
 - View whether each alert is pending, approved, or rejected.
 - View community reports associated with the Barangay dashboard.
 - Preview an alert before submission.

 Barangay alerts are submitted as `pending` and require MDRRMO verification before they are visible in the public alert feed.

 ### MDRRMO Admin

 MDRRMO administrators have system-wide oversight. They can:

 - View active-user, alert, pending-report, and uptime metrics.
 - Review Barangay alerts.
 - Create approved system alerts for all Barangays or a selected target.
 - Approve or reject community reports.
 - Delete community reports.
 - Review report trends, alert distribution, participation, and Barangay activity charts.
 - Inspect the audit trail.

 ## 3. Web Routes and Screens

 Routes are defined in `src/app/routes.tsx`.

 ### Public and authentication screens

 #### `/` - Splash screen

 Component: `Splash`

 Functions:

 - Displays the BAHAba identity and flood-communication tagline.
 - Provides the `Get Started` action.
 - Navigates to `/login`.

 #### `/login` - Sign-in screen

 Component: `Login`

 Functions:

 - Collects email and password.
 - Toggles password visibility.
 - Signs in with Supabase Auth.
 - Looks up the authenticated profile role.
 - Routes residents to `/home`, Barangay admins to `/admin/barangay`, and MDRRMO admins to `/admin/mdrrmo`.
 - Displays friendly messages for invalid credentials, unconfirmed email, invalid email, rate limits, and missing fields.
 - Resends the confirmation email when the account is unconfirmed.
 - Links to account registration.

 Current limitation: `Remember me` is visual only, and `Forgot password?` has no implemented action.

 #### `/register` - Account registration screen

 Component: `Register`

 Functions:

 - Collects full name, email, phone number, Barangay, password, and password confirmation.
 - Validates required fields, an eight-character minimum password, and matching passwords.
 - Requires agreement to the Terms of Service and Privacy Policy checkbox.
 - Creates a resident account through Supabase Auth with resident metadata.
 - Creates or updates the resident profile when a session is returned immediately.
 - Requests email confirmation when Supabase does not return a session.
 - Supports password visibility toggle and return navigation to login.

 Current limitation: the terms and privacy documents are not linked from this screen.

 Shared authentication behavior:

 - Supabase Auth owns account sessions and email-confirmation state for both clients.
 - A profile is created immediately only when registration returns a session.
 - When email confirmation is required, profile creation is deferred until the confirmed user signs in; the profile is then created from the registration metadata saved in Auth.

 ### Resident screens

 Resident screens are wrapped by `Layout`, which provides the four-item bottom navigation: Home, Map, Alerts, and Reports.

 #### `/home` - Resident home dashboard

 Component: `Home`

 Functions:

 - Shows the BAHAba / Odiongan Flood Monitor header.
 - Shows the resident's Barangay name, live flood-risk level, and last update time in the current flood status card.
 - Shows the last-updated time displayed by the prototype.
 - Provides a hazard-map preview and opens `/map`.
 - Provides shortcuts to `/alerts` and `/reports?openForm=true`.
 - Shows the offline maps and alerts information banner.
 - Provides logout navigation to `/login`.

 The current status card loads the resident's profile Barangay and subscribes to live flood-risk updates for that Barangay.

 #### `/map` - GIS hazard map

 Component: `GISHazardMap`

 Functions:

 - Renders an OpenStreetMap view using Pigeon Maps.
 - Displays nine configured Odiongan Barangay flood zones with colored markers and zone overlays.
 - Uses red, yellow, and green to represent high, medium, and low risk.
 - Lets users select a marker or Barangay list item.
 - Centers and zooms the map on a selected Barangay.
 - Shows a detail modal with risk, water level, population, evacuated families, last update, description, and GPS coordinates.
 - Attempts to obtain the user GPS location through the browser Geolocation API.
 - Provides a control to center the map on the user location.
 - Toggles the flood-risk legend.
 - Toggles the displayed Online/Offline mode label.

 Current limitation: the Barangay map dataset is component-local demo data and the offline toggle changes UI state only.

 #### `/alerts` - Alerts and notifications

 Component: `Alerts`

 Functions:

 - Loads approved records from the Supabase `alerts` table.
 - Orders alerts by newest `sent_at` timestamp.
 - Displays alert level, title, message, target Barangay, and timestamp.
 - Maps advisory, warning, and critical levels to low, medium, and high visual priority.
 - Subscribes to newly inserted alert records for live updates.
 - Shows an empty state while no approved alerts are available.
 - Includes a prototype social-media update section for MDRRMO and LGU posts.

 Security behavior: the database policy exposes approved alerts to authenticated users; pending and rejected alerts should not appear in the resident feed.

 Current limitation: social-media entries are static prototype content, not an external feed integration.

 #### `/reports` - Community reports

 Component: `CommunityReports`

 Functions:

 - Loads and displays approved community reports from Supabase.
 - Shows reporter, time, verification status, location, water level, description, GPS, and optional photo.
 - Opens the report form from the page button or the `openForm=true` query parameter.
 - Captures the current GPS position using the browser Geolocation API.
 - Collects a location label, water level, and description.
 - Accepts one optional image up to 5 MB and uploads it to the `report-photos` bucket.
 - Requires GPS, location, and description before submission.
 - Prevents a reporter from submitting another report while they have a pending report.
 - Inserts new reports with `pending` status.
 - Clears the form and shows a success dialog after submission.
 - Listens for report insert, update, and delete events and only keeps approved reports in the public feed.

 Water-level values:

 | Value | Meaning |
 | --- | --- |
 | `ankle` | Low |
 | `knee` | Medium |
 | `waist` | High |
 | `chest` | Severe |
 | `overhead` | Critical |

 ### Admin entry screen

 #### `/admin` - Admin selection

 Component: `AdminSelection`

 Functions:

 - Presents MDRRMO Admin and Barangay Admin entry choices.
 - Explains the scope and responsibilities of each role.
 - Routes to `/admin/mdrrmo` or `/admin/barangay`.
 - Provides a return action to `/login`.

 Current limitation: this is a role-selection UI, not an authorization boundary. Actual authorization is supplied by the authenticated profile and Supabase policies.

 ### MDRRMO admin screen

 #### `/admin/mdrrmo` - System dashboard

 Component: `MDRRMOAdminDashboard`

 Shared dashboard functions:

 - Loads reports, alerts, profile count, and audit logs from Supabase.
 - Maintains live community-report insert, update, and delete subscriptions.
 - Shows active users, alerts sent within 24 hours, pending reports, and uptime.
 - Provides the following tabs:

 | Tab | Functions |
 | --- | --- |
 | Overview | Pending-alert notice, recent activity, quick actions, and summary information |
 | Verify Barangay Alerts | Review and process Barangay-created alerts |
 | Analytics & Metrics | Report trends, Barangay activity, alert distribution, and user participation charts |
 | Create System Alert | Create an advisory, warning, or critical alert; choose target and channels; save as approved |
 | Verify Reports | Review report details and photos; approve, reject, or delete reports |
 | Audit Trail | Review recorded administrative activity |

 System-alert behavior:

 - Requires a non-empty message.
 - Requires at least one selected channel.
 - Supports push, SMS, Facebook, and Twitter channel selections in the UI.
 - Creates an alert in Supabase with `approved` status.
 - Adds the new alert to local state and displays a success notification.

 Report moderation behavior:

 - Updates a report to `approved` or `rejected` in Supabase.
 - Removes a deleted report locally after confirmation.
 - Records a local audit entry for report deletion.

 Current limitations: delivery channels are represented in the data and UI but are not connected to push, SMS, Facebook, or Twitter providers; Settings is visual only; some dashboard metrics are prototype estimates.

 ### Barangay admin screen

 #### `/admin/barangay` - Barangay dashboard

 Component: `BarangayAdminDashboard`

 Functions:

 - Loads alerts, community reports, and resident count for the assigned Barangay.
 - Shows Barangay residents, approved active alerts, report count, and estimated current water level.
 - Provides the following tabs:

 | Tab | Functions |
 | --- | --- |
 | Overview | Recent alert/report activity and current Barangay status |
 | Create Alert | Compose and preview an advisory, warning, or critical alert |
 | My Alerts | Review alert history and pending/approved/rejected state |
 | Community Reports | Inspect reports visible to the Barangay dashboard |

 Alert-submission behavior:

 - Requires title and message.
 - Targets the assigned Barangay.
 - Uses push as the initial channel.
 - Sets the alert status to `pending`.
 - Sends the alert to MDRRMO for verification.

 Current limitations: Settings and the report View action are visual placeholders. Community reports do not currently carry a Barangay foreign-key column, so the dashboard cannot apply a database-level Barangay filter to that collection yet.

 ## 4. Flutter Mobile Screens

 The Flutter client mirrors the resident and admin journeys with Supabase authentication, local SQLite data, repositories, and Provider state management. The screen inventory is:

 ### Authentication and entry

 - `splash_screen.dart`: app launch and transition into authentication.
 - `login_screen.dart`: resident/admin sign-in flow.
 - `register_screen.dart`: resident registration flow.
 - `admin/admin_selection_screen.dart`: selection of MDRRMO or Barangay administration.

 ### Resident screens

 - `resident/main_shell.dart`: resident navigation shell.
 - `resident/home_screen.dart`: resident overview and flood status.
 - `resident/hazard_map_screen.dart`: map, flood-risk zones, and GPS-related map actions.
 - `resident/community_reports_screen.dart`: create, view, and manage local community reports.
 - `resident/alerts_screen.dart`: view stored alerts.

 ### Admin screens

 - `admin/mdrrmo_dashboard_screen.dart`: MDRRMO metrics, alert/report review, and administrative actions.
 - `admin/barangay_dashboard_screen.dart`: Barangay-scoped monitoring and alert creation.

 Mobile-specific behavior:

 - Uses Supabase Auth for sign-in, registration, email confirmation, and session state.
 - Uses SQLite through `DatabaseHelper`.
 - Uses repositories for alerts, reports, users, Barangays, and audit logs.
 - Uses Provider classes for resident/admin state.
 - Supports seeded Odiongan demo data.
 - Uses local preferences for persisted app state where configured.
 - Uses `flutter_map` and device GPS for map functionality.
 - Uses `image_picker` for report photos.
 - Uses `fl_chart` for dashboard analytics.

 The Flutter app is a separate implementation from the Supabase-backed web prototype. A feature added to one client should be checked against the other before being considered complete across the product.

 ## 5. Core Workflows

 ### Resident alert workflow

 1. Resident opens `/alerts` or the Alerts tab.
 2. Client requests approved alerts.
 3. New approved alerts can arrive through the live database subscription.
 4. Resident reads the severity, target Barangay, message, and timestamp.

 ### Community-report workflow

 1. Resident opens Submit Flood Report.
 2. Resident enters a location label and description.
 3. Resident captures GPS coordinates.
 4. Resident selects a water-level category.
 5. Resident optionally uploads a photo no larger than 5 MB.
 6. Client checks for an existing pending report.
 7. Client stores the new report as `pending`.
 8. MDRRMO reviews the report.
 9. Approved reports appear in the public community feed; rejected reports remain out of that feed.

 ### Barangay-alert workflow

 1. Barangay admin creates an alert.
 2. Client stores it as `pending` for the target Barangay.
 3. MDRRMO reviews the alert.
 4. Approved alerts become visible to residents.
 5. Rejected alerts remain unavailable to residents and retain their rejection state.

 ### MDRRMO-alert workflow

 1. MDRRMO selects an alert level and target.
 2. MDRRMO writes a message and chooses one or more channels.
 3. Client stores the alert directly as `approved`.
 4. The alert is immediately eligible for the resident alert feed.
 5. The dashboard records the action in its activity state.

 ## 6. Data Model

 The web database is defined in `supabase/schema.sql`.

 ### `profiles`

 - `id`: UUID linked to `auth.users`
 - `name`, `email`, `phone`
 - `role`: `resident`, `barangay`, or `mdrrmo`
 - `barangay`
 - `created_at`, `updated_at`

 ### `barangays`

 - `id`, `name`
 - `flood_risk`: `low`, `medium`, or `high`
 - `last_update`
 - `lat`, `lng`

 ### `alerts`

 - `level`: `advisory`, `warning`, or `critical`
 - `title`, `message`
 - `target_barangay`
 - `channels`, `recipients`, `created_by`
 - `sent_at`
 - `status`: `pending`, `approved`, or `rejected`
 - `rejection_reason`, `source`

 ### `community_reports`

 - `user_name`, `location`
 - Optional `lat`, `lng`
 - `water_level`: `ankle`, `knee`, `waist`, `chest`, or `overhead`
 - `description`, optional `photo_path`
 - `status`: `pending`, `approved`, or `rejected`
 - `timestamp`, optional `rejection_reason`

 ### `audit_logs`

 - `action`
 - `user_name`
 - `timestamp`
 - `details`

 ### Storage

 The public Supabase Storage bucket `report-photos` stores uploaded community-report images. Authenticated users may upload; public readers may view.

 ## 7. Permissions and Visibility

 | Resource | Resident | Barangay admin | MDRRMO admin |
 | --- | --- | --- | --- |
 | Approved alerts | Read | Read | Read/manage |
 | Pending/rejected alerts | No public read | Own Barangay dashboard | Manage |
 | Approved reports | Read | Dashboard read | Read/manage |
 | Pending reports | Own report visibility through policy | Dashboard read in current prototype | Read/manage |
 | Create reports | Yes | Authenticated policy | Authenticated policy |
 | Approve/reject reports | No | UI does not moderate | Yes |
 | Audit logs | No | No | Read/insert |
 | Report photos | Upload/read through storage policy | Read | Read/manage |

 The UI is not a substitute for authorization. Supabase Row Level Security policies must remain enabled and tested for every role.

 ## 8. Status and Severity Rules

 ### Alert status

 - `pending`: submitted for review and not public.
 - `approved`: public and eligible for the resident alert feed.
 - `rejected`: not public; rejection reason may be retained for administrators.

 ### Report status

 - `pending`: awaiting MDRRMO review.
 - `approved`: verified and visible in the public report feed.
 - `rejected`: excluded from the public report feed.

 ### Severity

 - `advisory`: information and awareness.
 - `warning`: potential danger; prepare to act.
 - `critical`: immediate danger; act now.

 ## 9. Implementation Gaps and Follow-up Work

 The following items are visible in the current prototype and should be tracked separately from implemented functionality:

 - Add protected route guards and redirect unauthorized users before rendering admin screens.
 - Replace the admin selection screen with role-aware routing after authentication.
 - Connect Home flood status to the database or a monitoring service.
 - Replace the hard-coded map dataset with the `barangays` table and a real flood-zone geometry source.
 - Implement actual offline caching and synchronization for the web and Flutter clients.
 - Implement password reset and make Remember me functional.
 - Link Terms of Service and Privacy Policy content.
 - Connect alert channels to real push, SMS, and social integrations.
 - Filter Barangay dashboard reports by the authenticated administrator's Barangay.
 - Persist every administrative action to `audit_logs`, including approvals, rejections, and alert creation.
 - Add rejection-reason controls to moderation screens.
 - Replace prototype metric estimates with documented operational definitions.
 - Add automated tests for role permissions, approval visibility, duplicate pending reports, image limits, and live updates.

 ## 10. Validation Checklist

 ### Resident

 - [ ] Register with valid data and confirm email.
 - [ ] Sign in as resident and land on Home.
 - [ ] View the map and open a Barangay detail modal.
 - [ ] View only approved alerts.
 - [ ] Submit a report with GPS and without a photo.
 - [ ] Submit a report with a photo under 5 MB.
 - [ ] Confirm a pending duplicate report is blocked.
 - [ ] Confirm only approved reports appear publicly.

 ### Barangay admin

 - [ ] Create an alert with each severity level.
 - [ ] Confirm the alert is stored as pending.
 - [ ] Confirm it is absent from the public alert feed until approved.
 - [ ] Confirm alert history shows the current state.

 ### MDRRMO admin

 - [ ] Load dashboard data and charts with empty and populated tables.
 - [ ] Approve and reject community reports.
 - [ ] Delete a report and verify live feed removal.
 - [ ] Create an approved system alert.
 - [ ] Confirm alert and report visibility changes through Supabase policies.
 - [ ] Confirm audit entries are created for administrative actions.

 ## 11. Running the Clients

 ### Web prototype

 ```bash
 npm install
 npm run dev
 ```

 Build validation:

 ```bash
 npm run build
 ```

 End-to-end tests:

 ```bash
 npm run test:e2e
 ```

 ### Flutter app

 ```bash
 cd bahaba_app
 flutter pub get
 flutter run
 ```

 The Flutter app requires a configured Flutter SDK and Android device or emulator. Its local database is seeded on first run; clear app data to recreate the seeded database.
