import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../data/seed_data.dart';

/// Quick Report: anonymous flood reports through the "quick-report" Edge
/// Function (no login). Limits (3 per device), IP limits and blocking are
/// enforced server-side; the device id only lets the server count this phone.
/// Matches the web app's Quick Report.
class QuickReportService {
  QuickReportService._();
  static final QuickReportService instance = QuickReportService._();

  static const mdrrmoHotlineLabel = '+63 919 079 8427';
  static const mdrrmoHotlineTel = '+639190798427';
  static const emergencyHotline = '911';

  static const descriptionMax = 500;
  static const maxPhotoBytes = 2 * 1024 * 1024;

  static const _deviceKey = 'bahaba_device_id';
  String? _deviceId;

  SupabaseClient get _client => Supabase.instance.client;

  /// One UUID per install, kept in shared_preferences (in memory if that fails).
  Future<String> deviceId() async {
    final cached = _deviceId;
    if (cached != null) return cached;
    try {
      final prefs = await SharedPreferences.getInstance();
      var id = prefs.getString(_deviceKey);
      if (id == null || id.isEmpty) {
        id = const Uuid().v4();
        await prefs.setString(_deviceKey, id);
      }
      return _deviceId = id;
    } catch (e) {
      debugPrint('Quick Report device id not persisted: $e');
      return _deviceId = const Uuid().v4();
    }
  }

  Future<QuickReportStatus> status() async {
    final data = await _invoke({'action': 'status'});
    return QuickReportStatus(
      max: _int(data['max'], 3),
      remaining: _int(data['remaining'], 0),
      blocked: data['blocked'] == true,
    );
  }

  Future<QuickReportResult> submit(QuickReportInput input) async {
    final data = await _invoke({'action': 'submit', ...input.toJson()});
    final upload = data['upload'];
    return QuickReportResult(
      remaining: _int(data['remaining'], 0),
      upload: upload is Map && upload['path'] is String && upload['token'] is String
          ? (path: upload['path'] as String, token: upload['token'] as String)
          : null,
    );
  }

  /// Uploads the (already compressed) photo to the signed URL; false on failure.
  Future<bool> uploadPhoto(
    ({String path, String token}) upload,
    Uint8List bytes,
    String ext,
  ) async {
    try {
      await _client.storage.from('quick-report-photos').uploadBinaryToSignedUrl(
            upload.path,
            upload.token,
            bytes,
            FileOptions(contentType: ext == 'png' ? 'image/png' : ext == 'webp' ? 'image/webp' : 'image/jpeg'),
          );
      return true;
    } catch (e) {
      debugPrint('Quick Report photo upload failed: $e');
      return false;
    }
  }

  /// Barangay names from the table when readable without login; otherwise
  /// [fallbackBarangays].
  Future<List<String>> barangays() async {
    try {
      final rows = await _client.from('barangays').select('name').order('name');
      final names = rows
          .map((r) => (r['name'] ?? '').toString().trim())
          .where((n) => n.isNotEmpty)
          .toList();
      if (names.isNotEmpty) return names;
    } catch (e) {
      debugPrint('Barangay list not readable without login: $e');
    }
    return fallbackBarangays;
  }

  /// TODO: replace with the official list of the 25 Odiongan barangays (names
  /// must match barangays.name exactly, or the server answers "Unknown barangay").
  static final List<String> fallbackBarangays =
      (SeedData.barangays.map((b) => b.name).toList()..sort());

  Future<Map<String, dynamic>> _invoke(Map<String, dynamic> body) async {
    final payload = {'device_id': await deviceId(), ...body};
    try {
      final res = await _client.functions.invoke('quick-report', body: payload);
      final data = res.data;
      if (data is Map && data['error'] != null) throw _fromBody(data);
      if (data is Map<String, dynamic>) return data;
      if (data is Map) return Map<String, dynamic>.from(data);
      throw const QuickReportException(_generic);
    } on FunctionException catch (e) {
      final details = e.details;
      if (details is Map && details['error'] != null) throw _fromBody(details);
      debugPrint('quick-report failed: ${e.status} ${e.reasonPhrase}');
      throw const QuickReportException(_generic);
    } on QuickReportException {
      rethrow;
    } catch (e) {
      debugPrint('quick-report request failed: $e');
      throw const QuickReportException(_generic);
    }
  }

  static const _generic =
      "We couldn't send that right now. Please check your connection and try again, or call the MDRRMO.";

  static const _friendly = {
    'blocked': 'This device can no longer send Quick Reports. Please call the MDRRMO or 911.',
    'limit': 'You have used all 3 Quick Reports. Create an account to keep reporting.',
    'ip_limit': 'Too many Quick Reports were sent from this network. Please try again later or call the MDRRMO.',
    'busy': 'The service is busy right now. Please try again in a minute.',
  };

  /// The function's own error text is user-facing; known codes get our wording if it is missing.
  QuickReportException _fromBody(Map body) {
    final code = body['code'] is String ? body['code'] as String : null;
    final text = body['error'] is String ? (body['error'] as String).trim() : '';
    return QuickReportException(
      text.isNotEmpty ? text : (_friendly[code] ?? _generic),
      code: code,
    );
  }

  static int _int(Object? v, int fallback) =>
      v is num ? v.toInt() : int.tryParse('$v') ?? fallback;
}

class QuickReportStatus {
  final int max;
  final int remaining;
  final bool blocked;
  const QuickReportStatus({required this.max, required this.remaining, required this.blocked});
}

class QuickReportResult {
  final int remaining;
  final ({String path, String token})? upload;
  const QuickReportResult({required this.remaining, required this.upload});
}

/// Safe-to-show message (never a raw exception).
class QuickReportException implements Exception {
  final String message;
  final String? code;
  const QuickReportException(this.message, {this.code});
  @override
  String toString() => message;
}

enum WaterLevel {
  ankle('ankle', 'Ankle'),
  knee('knee', 'Knee'),
  waist('waist', 'Waist'),
  chest('chest', 'Chest'),
  overhead('overhead', 'Over head');

  const WaterLevel(this.id, this.label);
  final String id;
  final String label;
}

class QuickReportInput {
  final WaterLevel waterLevel;
  final String? barangay;
  final double? lat;
  final double? lng;
  final String? landmark;
  final String? description;
  final String? reporterName;
  final String? reporterPhone;
  final String? photoExt;

  const QuickReportInput({
    required this.waterLevel,
    this.barangay,
    this.lat,
    this.lng,
    this.landmark,
    this.description,
    this.reporterName,
    this.reporterPhone,
    this.photoExt,
  });

  Map<String, dynamic> toJson() {
    String? clean(String? s) => (s == null || s.trim().isEmpty) ? null : s.trim();
    final desc = clean(description);
    return {
      'water_level': waterLevel.id,
      if (clean(barangay) != null) 'barangay': clean(barangay),
      if (lat != null && lng != null) ...{'lat': lat, 'lng': lng},
      if (clean(landmark) != null) 'landmark': clean(landmark),
      if (desc != null)
        'description': desc.length > QuickReportService.descriptionMax
            ? desc.substring(0, QuickReportService.descriptionMax)
            : desc,
      if (clean(reporterName) != null) 'reporter_name': clean(reporterName),
      if (clean(reporterPhone) != null) 'reporter_phone': clean(reporterPhone),
      if (photoExt != null) ...{'want_photo': true, 'photo_ext': photoExt},
      // Honeypot: always empty from the app (bots that fill it are rejected).
      'website': '',
    };
  }
}
