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

  Future<LoginResult> register({
    required String name,
    String? email,
    String? phone,
    required String password,
  }) async {
    final payload = await _apiClient.post(
      '/auth/register',
      body: jsonEncode({
        'name': name,
        'email': email,
        'phone': phone,
        'password': password,
      }),
    );

    final loginResult = LoginResult.fromJson(payload as Map<String, dynamic>);
    final hydratedUser = await getMe(loginResult.tokens.accessToken);
    return LoginResult(user: hydratedUser, tokens: loginResult.tokens);
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
