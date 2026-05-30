import '../../customer/models/customer_models.dart';

class AuthTokens {
  AuthTokens({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;

  factory AuthTokens.fromJson(Map<String, dynamic> json) {
    return AuthTokens(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
    );
  }
}

class AppUser {
  AppUser({
    required this.id,
    required this.name,
    required this.role,
    this.email,
    this.phone,
    this.customer,
  });

  final String id;
  final String name;
  final String role;
  final String? email;
  final String? phone;
  final CustomerProfile? customer;

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? 'Customer',
      role: (json['role'] as String?) ?? 'CUSTOMER',
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      customer: json['customer'] is Map<String, dynamic>
          ? CustomerProfile.fromJson(json['customer'] as Map<String, dynamic>)
          : null,
    );
  }
}

class LoginResult {
  LoginResult({required this.user, required this.tokens});

  final AppUser user;
  final AuthTokens tokens;

  factory LoginResult.fromJson(Map<String, dynamic> json) {
    return LoginResult(
      user: AppUser.fromJson(json['user'] as Map<String, dynamic>),
      tokens: AuthTokens.fromJson(json),
    );
  }
}
