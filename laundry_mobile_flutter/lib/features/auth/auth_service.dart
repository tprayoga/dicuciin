import 'dart:convert';

import '../../core/network/api_client.dart';
import 'models/auth_models.dart';

class AuthService {
  AuthService(this._apiClient);

  final ApiClient _apiClient;

  Future<LoginResult> login({
    required String identifier,
    required String password,
  }) async {
    final payload = await _apiClient.post(
      '/auth/login',
      body: jsonEncode({
        'identifier': identifier,
        'password': password,
      }),
    );

    return LoginResult.fromJson(payload as Map<String, dynamic>);
  }

  /// Minta OTP dikirim via WhatsApp. Mengembalikan masa berlaku (detik).
  Future<int> requestOtp({
    required String phone,
    String purpose = 'REGISTER',
  }) async {
    final payload = await _apiClient.post(
      '/auth/otp/request',
      body: jsonEncode({'phone': phone, 'purpose': purpose}),
    );

    final map = payload as Map<String, dynamic>;
    return (map['expiresInSeconds'] as num?)?.toInt() ?? 300;
  }

  /// Verifikasi OTP. Mengembalikan verificationToken untuk dipakai saat register.
  Future<String> verifyOtp({
    required String phone,
    required String code,
    String purpose = 'REGISTER',
  }) async {
    final payload = await _apiClient.post(
      '/auth/otp/verify',
      body: jsonEncode({'phone': phone, 'code': code, 'purpose': purpose}),
    );

    return (payload as Map<String, dynamic>)['verificationToken'] as String;
  }

  Future<LoginResult> register({
    required String name,
    String? email,
    required String phone,
    required String password,
    required String verificationToken,
    String? birthDate,
    String? gender,
    String? occupation,
  }) async {
    final payload = await _apiClient.post(
      '/auth/register',
      body: jsonEncode({
        'name': name,
        if (email != null && email.isNotEmpty) 'email': email,
        'phone': phone,
        'password': password,
        'verificationToken': verificationToken,
        if (birthDate != null && birthDate.isNotEmpty) 'birthDate': birthDate,
        if (gender != null && gender.isNotEmpty) 'gender': gender,
        if (occupation != null && occupation.isNotEmpty)
          'occupation': occupation,
      }),
    );

    final loginResult = LoginResult.fromJson(payload as Map<String, dynamic>);
    final hydratedUser = await getMe(loginResult.tokens.accessToken);
    return LoginResult(user: hydratedUser, tokens: loginResult.tokens);
  }

  /// Upload foto profil (bytes, aman untuk Web). Mengembalikan URL.
  Future<String?> uploadAvatar({
    required String accessToken,
    required String userId,
    required List<int> bytes,
    required String filename,
  }) async {
    final payload = await _apiClient.postMultipartBytes(
      '/uploads/profile/$userId',
      headers: {'Authorization': 'Bearer $accessToken'},
      fileField: 'file',
      bytes: bytes,
      filename: filename,
    );
    return (payload as Map<String, dynamic>?)?['url'] as String?;
  }

  /// Set PIN wallet 6 digit (disimpan ter-hash di server).
  Future<void> setWalletPin({
    required String accessToken,
    required String customerId,
    required String pin,
  }) async {
    await _apiClient.post(
      '/wallets/customer/$customerId/pin/set',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({'pin': pin}),
    );
  }

  /// Verifikasi PIN wallet. true bila cocok.
  Future<bool> verifyWalletPin({
    required String accessToken,
    required String customerId,
    required String pin,
  }) async {
    final payload = await _apiClient.post(
      '/wallets/customer/$customerId/pin/verify',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({'pin': pin}),
    );

    return (payload as Map<String, dynamic>?)?['valid'] == true;
  }

  /// Ambil saldo wallet terkini (dalam rupiah penuh).
  Future<int> getWalletBalance({
    required String accessToken,
    required String customerId,
  }) async {
    final payload = await _apiClient.get(
      '/wallets/customer/$customerId',
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    final map = payload as Map<String, dynamic>;
    return (map['balance'] as num?)?.round() ?? 0;
  }

  /// Bayar order memakai saldo wallet. Mengembalikan saldo terbaru.
  Future<int> payWithWallet({
    required String accessToken,
    required String customerId,
    required String orderId,
    required int amount,
    String? idempotencyKey,
  }) async {
    final payload = await _apiClient.post(
      '/wallets/customer/$customerId/pay',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({
        'orderId': orderId,
        'amount': amount,
        'idempotencyKey': ?idempotencyKey,
      }),
    );
    final wallet = (payload as Map<String, dynamic>)['wallet'] as Map<String, dynamic>?;
    return (wallet?['balance'] as num?)?.round() ?? 0;
  }

  /// Top up saldo wallet. Mengembalikan saldo terbaru.
  Future<int> topUpWallet({
    required String accessToken,
    required String customerId,
    required int amount,
    String? idempotencyKey,
  }) async {
    final payload = await _apiClient.post(
      '/wallets/customer/$customerId/topup',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({
        'amount': amount,
        'idempotencyKey': ?idempotencyKey,
      }),
    );
    final wallet = (payload as Map<String, dynamic>)['wallet'] as Map<String, dynamic>?;
    return (wallet?['balance'] as num?)?.round() ?? 0;
  }

  Future<AuthTokens> refresh(String refreshToken) async {
    final payload = await _apiClient.post(
      '/auth/refresh',
      body: jsonEncode({'refreshToken': refreshToken}),
    );

    return AuthTokens.fromJson(payload as Map<String, dynamic>);
  }

  Future<AppUser> getMe(String accessToken) async {
    final payload = await _apiClient.get(
      '/auth/me',
      headers: {'Authorization': 'Bearer $accessToken'},
    );

    return AppUser.fromJson(payload as Map<String, dynamic>);
  }

  Future<void> logout({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _apiClient.post(
      '/auth/logout',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({'refreshToken': refreshToken}),
    );
  }

  Future<AppUser> updateProfile({
    required String accessToken,
    required String userId,
    required String name,
    String? email,
    String? phone,
  }) async {
    await _apiClient.patch(
      '/users/$userId',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({
        'name': name,
        'email': email,
        'phone': phone,
      }),
    );

    return getMe(accessToken);
  }
}
