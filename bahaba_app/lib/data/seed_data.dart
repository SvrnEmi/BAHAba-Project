import '../config/barangays.dart';
import '../models/barangay_model.dart';
import '../models/alert_model.dart';
import '../models/community_report_model.dart';
import '../models/audit_log_model.dart';
import '../models/user_model.dart';

/// Seed data used to populate the local SQLite database on first launch.
/// Mirrors the data in the React web prototype.
class SeedData {
  /// The 25 official barangays (see [officialBarangays]); the map cache is
  /// replaced from Supabase once it can be read.
  static final List<Barangay> barangays = [
    for (final b in officialBarangays)
      Barangay(
        name: b.name,
        lat: b.lat,
        lng: b.lng,
        floodRisk: FloodRisk.low,
        lastUpdate: '',
      ),
  ];

  /// Default user accounts (resident, mdrrmo, barangay admin).
  static const List<User> users = [
    User(
      fullName: 'Juan Dela Cruz',
      email: 'resident@bahaba.app',
      password: 'resident123',
      phone: '09171234567',
      barangay: 'Tuburan',
      role: UserRole.resident,
    ),
    User(
      fullName: 'Maria Santos',
      email: 'mdrrmo@bahaba.app',
      password: 'mdrrmo123',
      phone: '09181234567',
      barangay: null,
      role: UserRole.mdrrmo,
    ),
    User(
      fullName: 'Pedro Reyes',
      email: 'barangay@bahaba.app',
      password: 'barangay123',
      phone: '09191234567',
      barangay: 'Tuburan',
      role: UserRole.barangay,
    ),
  ];

  /// Sample alerts already broadcast.
  static List<Alert> alerts() {
    return [
      const Alert(
        level: AlertLevel.critical,
        title: 'Flash Flood Emergency - Tuburan',
        message:
            'CRITICAL: Flash flood warning. Evacuate immediately. Water level rising rapidly.',
        targetBarangay: 'Tuburan',
        channels: [AlertChannel.push, AlertChannel.sms],
        sentAt: '2024-05-04 14:30',
        recipients: 543,
        createdBy: 'Admin: Maria Santos',
        status: AlertStatus.approved,
      ),
      const Alert(
        level: AlertLevel.warning,
        title: 'Heavy Rainfall Warning - Multiple Barangays',
        message:
            'WARNING: Heavy rainfall expected. Monitor water levels closely. Prepare evacuation kits.',
        targetBarangay: 'All Barangays',
        channels: [AlertChannel.push],
        sentAt: '2024-05-04 12:15',
        recipients: 1234,
        createdBy: 'Admin: Juan Dela Cruz',
        status: AlertStatus.approved,
      ),
      const Alert(
        level: AlertLevel.advisory,
        title: 'Flood Advisory - Poctoy',
        message:
            'ADVISORY: Minor flooding in coastal areas. Exercise caution. Roads remain passable.',
        targetBarangay: 'Poctoy',
        channels: [AlertChannel.push],
        sentAt: '2024-05-04 10:00',
        recipients: 456,
        createdBy: 'Admin: Pedro Reyes',
        status: AlertStatus.approved,
      ),
      // Local demo rows with the old status value; no screen shows them.
      const Alert(
        level: AlertLevel.warning,
        title: 'Rising Water Level - Main Road',
        message:
            'Water level at main bridge has reached 2.5 meters. Residents near river advised to prepare evacuation kits.',
        targetBarangay: 'Tuburan',
        channels: [AlertChannel.push, AlertChannel.sms],
        sentAt: '2024-05-04 15:30',
        recipients: 0,
        createdBy: 'Brgy. Captain Juan Santos',
        status: AlertStatus.pending,
        source: 'barangay',
      ),
      const Alert(
        level: AlertLevel.critical,
        title: 'Immediate Evacuation Required',
        message:
            'Flash flood imminent. All residents in low-lying areas must evacuate immediately to evacuation center.',
        targetBarangay: 'Panique',
        channels: [AlertChannel.push, AlertChannel.sms],
        sentAt: '2024-05-04 13:45',
        recipients: 0,
        createdBy: 'Brgy. Captain Pedro Reyes',
        status: AlertStatus.pending,
        source: 'barangay',
      ),
    ];
  }

  /// Sample community flood reports.
  static List<CommunityReport> reports() {
    return [
      const CommunityReport(
        userName: 'Juan D.',
        location: 'Barangay Tuburan, Near Bridge',
        lat: 12.4018,
        lng: 122.0234,
        waterLevel: WaterLevel.knee,
        description:
            'Water rising rapidly near the main bridge. Vehicles struggling to pass.',
        status: ReportStatus.approved,
        timestamp: '2024-05-04 14:30',
      ),
      const CommunityReport(
        userName: 'Maria S.',
        location: 'Barangay Gabawan',
        lat: 12.3867,
        lng: 122.0189,
        waterLevel: WaterLevel.ankle,
        description:
            'Minor flooding in agricultural area. Water starting to subside.',
        status: ReportStatus.pending,
        timestamp: '2024-05-04 15:15',
      ),
      const CommunityReport(
        userName: 'Pedro L.',
        location: 'Barangay Ligaya',
        lat: 12.4123,
        lng: 122.0345,
        waterLevel: WaterLevel.ankle,
        description: 'Light flooding in low-lying areas, subsiding.',
        status: ReportStatus.approved,
        timestamp: '2024-05-04 13:45',
      ),
      const CommunityReport(
        userName: 'Rosa M.',
        location: 'Barangay Libertad, Riverside Area',
        lat: 12.3912,
        lng: 122.0223,
        waterLevel: WaterLevel.waist,
        description:
            'Severe flooding affecting residential areas near the river.',
        status: ReportStatus.rejected,
        timestamp: '2024-05-04 12:20',
        rejectionReason: 'Duplicate report - already verified under report #12',
      ),
    ];
  }

  /// Sample audit trail entries.
  static List<AuditLog> auditLogs() {
    return const [
      AuditLog(
        action: 'ALERT_CREATED',
        user: 'Admin: Maria Santos',
        timestamp: '2024-05-04 14:30:15',
        details: 'Created CRITICAL alert for Tuburan - Flash Flood Emergency',
      ),
      AuditLog(
        action: 'REPORT_VERIFIED',
        user: 'Admin: Juan Dela Cruz',
        timestamp: '2024-05-04 14:15:42',
        details: 'Verified report #456 from resident Juan D. - Tuburan flooding',
      ),
      AuditLog(
        action: 'REPORT_REJECTED',
        user: 'Admin: Maria Santos',
        timestamp: '2024-05-04 13:45:30',
        details: 'Rejected report #443 - Reason: Duplicate report',
      ),
      AuditLog(
        action: 'ALERT_CREATED',
        user: 'Admin: Pedro Reyes',
        timestamp: '2024-05-04 12:15:05',
        details: 'Created WARNING alert for All Barangays - Heavy Rainfall',
      ),
      AuditLog(
        action: 'SYSTEM_LOGIN',
        user: 'Admin: Maria Santos',
        timestamp: '2024-05-04 08:00:12',
        details: 'Admin logged into system from IP: 192.168.1.1',
      ),
    ];
  }
}

