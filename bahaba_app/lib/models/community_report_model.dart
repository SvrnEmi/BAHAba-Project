/// Water level categories for community flood reports.
enum WaterLevel {
  ankle,
  knee,
  waist,
  chest,
  overhead;

  static WaterLevel fromString(String value) {
    switch (value) {
      case 'knee':
        return WaterLevel.knee;
      case 'waist':
        return WaterLevel.waist;
      case 'chest':
        return WaterLevel.chest;
      case 'overhead':
        return WaterLevel.overhead;
      default:
        return WaterLevel.ankle;
    }
  }

  String get value {
    switch (this) {
      case WaterLevel.ankle:
        return 'ankle';
      case WaterLevel.knee:
        return 'knee';
      case WaterLevel.waist:
        return 'waist';
      case WaterLevel.chest:
        return 'chest';
      case WaterLevel.overhead:
        return 'overhead';
    }
  }

  String get label {
    switch (this) {
      case WaterLevel.ankle:
        return 'Ankle-high (<0.3m)';
      case WaterLevel.knee:
        return 'Knee-high (0.3-0.6m)';
      case WaterLevel.waist:
        return 'Waist-high (0.6-1.2m)';
      case WaterLevel.chest:
        return 'Chest-high (1.2-1.8m)';
      case WaterLevel.overhead:
        return 'Overhead (>1.8m)';
    }
  }
}

/// Status of a community report in the verification workflow.
enum ReportStatus {
  pending,
  approved,
  rejected;

  static ReportStatus fromString(String value) {
    switch (value) {
      case 'approved':
        return ReportStatus.approved;
      case 'rejected':
        return ReportStatus.rejected;
      default:
        return ReportStatus.pending;
    }
  }

  String get value {
    switch (this) {
      case ReportStatus.pending:
        return 'pending';
      case ReportStatus.approved:
        return 'approved';
      case ReportStatus.rejected:
        return 'rejected';
    }
  }

  String get label {
    switch (this) {
      case ReportStatus.pending:
        return 'Pending';
      case ReportStatus.approved:
        return 'Approved';
      case ReportStatus.rejected:
        return 'Rejected';
    }
  }
}

extension ReportStatusX on String {
  ReportStatus get asReportStatus => switch (this) {
    'approved' => ReportStatus.approved,
    'rejected' => ReportStatus.rejected,
    _ => ReportStatus.pending,
  };
}

class CommunityReport {
  final int? id;
  final String userName;
  final String location;
  final double? lat;
  final double? lng;
  final WaterLevel waterLevel;
  final String description;
  final String? photoPath;
  final ReportStatus status;
  final String timestamp;
  final String? rejectionReason;
  final String? adminReply;
  final String? adminReplyAt;

  const CommunityReport({
    this.id,
    required this.userName,
    required this.location,
    this.lat,
    this.lng,
    required this.waterLevel,
    required this.description,
    this.photoPath,
    this.status = ReportStatus.pending,
    required this.timestamp,
    this.rejectionReason,
    this.adminReply,
    this.adminReplyAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'user_name': userName,
      'location': location,
      'lat': lat,
      'lng': lng,
      'water_level': waterLevel.value,
      'description': description,
      'photo_path': photoPath,
      'status': status.value,
      'timestamp': timestamp,
      'rejection_reason': rejectionReason,
      'admin_reply': adminReply,
      'admin_reply_at': adminReplyAt,
    };
  }

  factory CommunityReport.fromMap(Map<String, dynamic> map) {
    return CommunityReport(
      id: map['id'] as int?,
      userName: map['user_name'] as String,
      location: map['location'] as String,
      lat: (map['lat'] as num?)?.toDouble(),
      lng: (map['lng'] as num?)?.toDouble(),
      waterLevel: WaterLevel.fromString(map['water_level'] as String),
      description: map['description'] as String,
      photoPath: map['photo_path'] as String?,
      status: ReportStatus.fromString(map['status'] as String),
      timestamp: map['timestamp'] as String,
      rejectionReason: map['rejection_reason'] as String?,
      adminReply: map['admin_reply'] as String?,
      adminReplyAt: map['admin_reply_at'] as String?,
    );
  }
}

