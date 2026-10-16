/// User roles in the BAHAba system.
enum UserRole {
  resident,
  mdrrmo,
  barangay;

  static UserRole fromString(String value) {
    switch (value) {
      case 'mdrrmo':
        return UserRole.mdrrmo;
      case 'barangay':
        return UserRole.barangay;
      default:
        return UserRole.resident;
    }
  }

  String get value {
    switch (this) {
      case UserRole.resident:
        return 'resident';
      case UserRole.mdrrmo:
        return 'mdrrmo';
      case UserRole.barangay:
        return 'barangay';
    }
  }

  String get label {
    switch (this) {
      case UserRole.resident:
        return 'Resident';
      case UserRole.mdrrmo:
        return 'MDRRMO Admin';
      case UserRole.barangay:
        return 'Barangay Admin';
    }
  }
}

class User {
  final String? id;
  final String fullName;
  final String email;
  final String password;
  final String phone;
  final String? barangay;
  final UserRole role;

  const User({
    this.id,
    required this.fullName,
    required this.email,
    required this.password,
    required this.phone,
    this.barangay,
    required this.role,
  });

  User copyWith({String? fullName, String? phone, String? barangay}) {
    return User(
      id: id,
      fullName: fullName ?? this.fullName,
      email: email,
      password: password,
      phone: phone ?? this.phone,
      barangay: barangay ?? this.barangay,
      role: role,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'full_name': fullName,
      'email': email,
      'password': password,
      'phone': phone,
      'barangay': barangay,
      'role': role.value,
    };
  }

  factory User.fromMap(Map<String, dynamic> map) {
    final rawId = map['id'];
    final rawBarangayId = map['barangay_id'] ?? map['barangay'];

    return User(
      id: rawId?.toString(),
      fullName: (map['name'] ?? map['full_name'] ?? 'User') as String,
      email: map['email'] as String,
      password: map['password'] as String? ?? '',
      phone: map['phone'] as String? ?? '',
      barangay: rawBarangayId?.toString(),
      role: UserRole.fromString((map['role'] as String? ?? 'resident')),
    );
  }
}
