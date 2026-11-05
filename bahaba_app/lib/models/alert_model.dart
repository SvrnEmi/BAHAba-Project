/// ISO-standard alert levels used across the system.
enum AlertLevel {
  advisory,
  warning,
  critical;

  static AlertLevel fromString(String value) {
    switch (value) {
      case 'warning':
        return AlertLevel.warning;
      case 'critical':
        return AlertLevel.critical;
      default:
        return AlertLevel.advisory;
    }
  }

  String get value {
    switch (this) {
      case AlertLevel.advisory:
        return 'advisory';
      case AlertLevel.warning:
        return 'warning';
      case AlertLevel.critical:
        return 'critical';
    }
  }

  String get label {
    switch (this) {
      case AlertLevel.advisory:
        return 'ADVISORY';
      case AlertLevel.warning:
        return 'WARNING';
      case AlertLevel.critical:
        return 'CRITICAL';
    }
  }

  /// PAGASA color name, always shown together with [pagasaLabel].
  String get pagasaColor {
    switch (this) {
      case AlertLevel.advisory:
        return 'Yellow';
      case AlertLevel.warning:
        return 'Orange';
      case AlertLevel.critical:
        return 'Red';
    }
  }

  String get pagasaLabel {
    switch (this) {
      case AlertLevel.advisory:
        return 'Be Alert';
      case AlertLevel.warning:
        return 'Be Prepared';
      case AlertLevel.critical:
        return 'Take Action';
    }
  }

  /// "Orange - Be Prepared".
  String get pagasaText => '$pagasaColor - $pagasaLabel';

  static AlertLevel fromPagasaColor(String color) {
    switch (color) {
      case 'orange':
        return AlertLevel.warning;
      case 'red':
        return AlertLevel.critical;
      default:
        return AlertLevel.advisory;
    }
  }

  String get description {
    switch (this) {
      case AlertLevel.advisory:
        return 'Information and awareness';
      case AlertLevel.warning:
        return 'Potential danger, prepare to act';
      case AlertLevel.critical:
        return 'Immediate danger, act now';
    }
  }

  String get colorHex {
    switch (this) {
      case AlertLevel.advisory:
        return '#3B82F6';
      case AlertLevel.warning:
        return '#EAB308';
      case AlertLevel.critical:
        return '#EF4444';
    }
  }
}

/// Communication channels for alert broadcast.
enum AlertChannel {
  push,
  sms;

  static AlertChannel fromString(String value) {
    switch (value) {
      case 'sms':
        return AlertChannel.sms;
      default:
        return AlertChannel.push;
    }
  }

  /// Parses the stored comma-separated `channels` column. Values other than
  /// push/sms (left in older rows) are skipped; duplicates are dropped.
  static List<AlertChannel> parseList(String? csv) => (csv ?? '')
      .split(',')
      .map((c) => c.trim())
      .where((c) => c == 'push' || c == 'sms')
      .toSet()
      .map(fromString)
      .toList();

  String get value {
    switch (this) {
      case AlertChannel.push:
        return 'push';
      case AlertChannel.sms:
        return 'sms';
    }
  }

  String get label {
    switch (this) {
      case AlertChannel.push:
        return 'Push Notification';
      case AlertChannel.sms:
        return 'SMS';
    }
  }
}

/// Alert status. Only approved (published) and withdrawn are still set; the
/// others remain for older rows.
enum AlertStatus {
  pending,
  approved,
  rejected,
  withdrawn;

  static AlertStatus fromString(String value) {
    switch (value) {
      case 'approved':
        return AlertStatus.approved;
      case 'rejected':
        return AlertStatus.rejected;
      case 'withdrawn':
        return AlertStatus.withdrawn;
      default:
        return AlertStatus.pending;
    }
  }

  String get value {
    switch (this) {
      case AlertStatus.pending:
        return 'pending';
      case AlertStatus.approved:
        return 'approved';
      case AlertStatus.rejected:
        return 'rejected';
      case AlertStatus.withdrawn:
        return 'withdrawn';
    }
  }

  String get label {
    switch (this) {
      case AlertStatus.pending:
        return 'Not published';
      case AlertStatus.approved:
        return 'Published';
      case AlertStatus.rejected:
        return 'Rejected';
      case AlertStatus.withdrawn:
        return 'Withdrawn';
    }
  }
}

class Alert {
  final int? id;
  final AlertLevel level;
  final String title;
  final String message;
  final String targetBarangay;
  final List<AlertChannel> channels;
  final String sentAt;
  final int recipients;
  final String createdBy;
  final AlertStatus status;
  final String? rejectionReason;
  final String? source; // 'mdrrmo' | 'barangay' | automatic

  /// Supabase-only fields (not in the local SQLite cache, so not in toMap).
  final String? withdrawnReason;

  const Alert({
    this.id,
    required this.level,
    required this.title,
    required this.message,
    required this.targetBarangay,
    required this.channels,
    required this.sentAt,
    required this.recipients,
    required this.createdBy,
    this.status = AlertStatus.approved,
    this.rejectionReason,
    this.source = 'mdrrmo',
    this.withdrawnReason,
  });

  /// "Barangay", "MDRRMO" or "Automatic".
  String get sourceLabel => switch (source) {
        'barangay' => 'Barangay',
        'mdrrmo' || null || '' => 'MDRRMO',
        _ => 'Automatic',
      };

  /// Push / preview line: "[Orange - Be Prepared] Title".
  String get previewText => '[${level.pagasaText}] $title';

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'level': level.value,
      'title': title,
      'message': message,
      'target_barangay': targetBarangay,
      'channels': channels.map((c) => c.value).join(','),
      'sent_at': sentAt,
      'recipients': recipients,
      'created_by': createdBy,
      'status': status.value,
      'rejection_reason': rejectionReason,
      'source': source,
    };
  }

  factory Alert.fromMap(Map<String, dynamic> map) {
    return Alert(
      id: map['id'] as int?,
      level: AlertLevel.fromString(map['level'] as String),
      title: map['title'] as String,
      message: map['message'] as String,
      targetBarangay: map['target_barangay'] as String,
      channels: AlertChannel.parseList(map['channels'] as String?),
      sentAt: map['sent_at'] as String,
      recipients: map['recipients'] as int? ?? 0,
      createdBy: map['created_by'] as String,
      status: AlertStatus.fromString(map['status'] as String? ?? 'approved'),
      rejectionReason: map['rejection_reason'] as String?,
      source: map['source'] as String? ?? 'mdrrmo',
    );
  }
}

