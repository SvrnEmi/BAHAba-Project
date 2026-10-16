/// A single entry in the system audit trail.
class AuditLog {
  final int? id;
  final String action;
  final String user;
  final String timestamp;
  final String details;

  const AuditLog({
    this.id,
    required this.action,
    required this.user,
    required this.timestamp,
    required this.details,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'action': action,
      'user': user,
      'timestamp': timestamp,
      'details': details,
    };
  }

  factory AuditLog.fromMap(Map<String, dynamic> map) {
    return AuditLog(
      id: map['id'] as int?,
      action: map['action'] as String,
      user: map['user'] as String,
      timestamp: map['timestamp'] as String,
      details: map['details'] as String,
    );
  }
}

