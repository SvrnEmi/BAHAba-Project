import 'package:supabase_flutter/supabase_flutter.dart';

/// A row of public.emergency_contacts. A null [barangay] is a municipal contact.
class EmergencyContact {
  final int id;
  final String? barangay;
  final String name;
  final String? role;
  final String phone;

  const EmergencyContact({
    required this.id,
    this.barangay,
    required this.name,
    this.role,
    required this.phone,
  });

  factory EmergencyContact.fromRow(Map<String, dynamic> row) {
    final role = (row['role'] ?? '').toString().trim();
    return EmergencyContact(
      id: (row['id'] as num).toInt(),
      barangay: row['barangay'] as String?,
      name: (row['name'] ?? '').toString(),
      role: role.isEmpty ? null : role,
      phone: (row['phone'] ?? '').toString(),
    );
  }

  /// Digits and + only, for the dialer.
  String get dialNumber => phone.replaceAll(RegExp(r'[^0-9+]'), '');
}

class EmergencyContactsService {
  static const _columns = 'id, barangay, name, role, phone, sort_order';

  /// Municipal contacts plus [barangay]'s, by sort_order. Without a barangay,
  /// only the municipal ones.
  static Future<List<EmergencyContact>> fetch(String? barangay) async {
    final query =
        Supabase.instance.client.from('emergency_contacts').select(_columns);
    final scoped = barangay == null || barangay.isEmpty
        ? query.isFilter('barangay', null)
        : query.or('barangay.is.null,barangay.eq."$barangay"');
    // Dart's order() is descending unless told otherwise.
    final rows = await scoped
        .order('sort_order', ascending: true)
        .order('name', ascending: true);
    return rows.map(EmergencyContact.fromRow).toList();
  }
}
