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
  sms,
  facebook,
  twitter;

  static AlertChannel fromString(String value) {
    switch (value) {
      case 'sms':
        return AlertChannel.sms;
      case 'facebook':
        return AlertChannel.facebook;
      case 'twitter':
        return AlertChannel.twitter;
      default:
        return AlertChannel.push;
    }
  }

  String get value {
    switch (this) {
      case AlertChannel.push:
        return 'push';
      case AlertChannel.sms:
        return 'sms';
      case AlertChannel.facebook:
        return 'facebook';
      case AlertChannel.twitter:
        return 'twitter';
    }
  }

  String get label {
    switch (this) {
      case AlertChannel.push:
        return 'Push Notification';
      case AlertChannel.sms:
        return 'SMS';
      case AlertChannel.facebook:
        return 'Facebook';
      case AlertChannel.twitter:
        return 'X (Twitter)';
    }
  }
}

/// Alert status for the barangay → MDRRMO verification workflow.
enum AlertStatus {
  pending,
  approved,
  rejected;

  static AlertStatus fromString(String value) {
    switch (value) {
      case 'approved':
        return AlertStatus.approved;
      case 'rejected':
        return AlertStatus.rejected;
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
    }
  }

  String get label {
    switch (this) {
      case AlertStatus.pending:
        return 'Pending';
      case AlertStatus.approved:
        return 'Approved';
      case AlertStatus.rejected:
        return 'Rejected';
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
  final String? source; // 'mdrrmo' | 'barangay'

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
  });

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
      channels: (map['channels'] as String)
          .split(',')
          .where((c) => c.isNotEmpty)
          .map(AlertChannel.fromString)
          .toList(),
      sentAt: map['sent_at'] as String,
      recipients: map['recipients'] as int? ?? 0,
      createdBy: map['created_by'] as String,
      status: AlertStatus.fromString(map['status'] as String? ?? 'approved'),
      rejectionReason: map['rejection_reason'] as String?,
      source: map['source'] as String? ?? 'mdrrmo',
    );
  }
}

