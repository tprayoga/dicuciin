import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/network/api_exception.dart';
import '../../core/storage/token_storage.dart';
import 'auth_service.dart';
import 'models/auth_models.dart';

enum AuthStatus { loading, authenticated, unauthenticated }

class AuthController extends ChangeNotifier {
  AuthController({required AuthService authService, required TokenStorage tokenStorage})
      : _authService = authService,
        _tokenStorage = tokenStorage {
    unawaited(initialize());
  }

  final AuthService _authService;
  final TokenStorage _tokenStorage;

  AuthStatus _status = AuthStatus.loading;
  AppUser? _user;
  String? _accessToken;
  String? _refreshToken;
  String? _errorMessage;
  bool _isProfileUpdating = false;

  /// Refresh yang sedang berjalan — dipakai bersama semua request yang kena 401
  /// pada saat yang sama (server merotasi refresh token; refresh ganda dengan
  /// token lama akan ditolak).
  Future<String?>? _refreshing;

  static const sessionExpiredMessage = 'Sesi berakhir. Silakan masuk lagi.';

  AuthStatus get status => _status;
  AppUser? get user => _user;
  String? get accessToken => _accessToken;
  String? get errorMessage => _errorMessage;
  bool get isProfileUpdating => _isProfileUpdating;
  bool get isLoading => _status == AuthStatus.loading;
  bool get isAuthenticated =>
      _status == AuthStatus.authenticated && _user != null && _accessToken != null;

  Future<void> initialize() async {
    _status = AuthStatus.loading;
    _errorMessage = null;
    notifyListeners();

    try {
      final savedAccess = await _tokenStorage.readAccessToken();
      final savedRefresh = await _tokenStorage.readRefreshToken();

      _accessToken = savedAccess;
      _refreshToken = savedRefresh;

      if (_accessToken == null && _refreshToken == null) {
        _setUnauthenticated();
        return;
      }

      await _hydrateUser();
    } catch (_) {
      await signOut(localOnly: true);
      _setUnauthenticated();
    }
  }

  Future<void> signIn({required String identifier, required String password}) async {
    _status = AuthStatus.loading;
    _errorMessage = null;
    notifyListeners();

    try {
      final result = await _authService.login(identifier: identifier, password: password);
      _accessToken = result.tokens.accessToken;
      _refreshToken = result.tokens.refreshToken;
      _user = result.user;
      await _tokenStorage.writeTokens(
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      );
      _status = AuthStatus.authenticated;
      notifyListeners();
    } on ApiException catch (e) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = e.message;
      notifyListeners();
    } catch (_) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = 'Gagal login. Coba lagi.';
      notifyListeners();
    }
  }

  /// Minta OTP via WhatsApp. Stateless terhadap status auth global
  /// (loading dikelola lokal di layar OTP). Melempar [ApiException] bila gagal.
  Future<int> requestOtp({required String phone, String purpose = 'REGISTER'}) {
    return _authService.requestOtp(phone: phone, purpose: purpose);
  }

  /// Verifikasi OTP, kembalikan verificationToken. Melempar [ApiException] bila gagal.
  Future<String> verifyOtp({
    required String phone,
    required String code,
    String purpose = 'REGISTER',
  }) {
    return _authService.verifyOtp(phone: phone, code: code, purpose: purpose);
  }

  /// Reset password via OTP (purpose RESET_PASSWORD).
  Future<void> resetPassword({
    required String phone,
    required String newPassword,
    required String verificationToken,
  }) {
    return _authService.resetPassword(
      phone: phone,
      newPassword: newPassword,
      verificationToken: verificationToken,
    );
  }

  /// Langkah akhir register: buat akun (butuh verificationToken + password),
  /// lalu set PIN wallet. Status auth menjadi authenticated bila sukses.
  /// Melempar bila gagal agar UI bisa menampilkan error tanpa pindah layar.
  Future<void> completeRegistration({
    required String name,
    String? email,
    required String phone,
    required String password,
    required String verificationToken,
    required String walletPin,
    String? birthDate,
    String? gender,
    String? occupation,
    List<int>? photoBytes,
    String? photoName,
  }) async {
    _status = AuthStatus.loading;
    _errorMessage = null;
    notifyListeners();

    try {
      final result = await _authService.register(
        name: name,
        email: email,
        phone: phone,
        password: password,
        verificationToken: verificationToken,
        birthDate: birthDate,
        gender: gender,
        occupation: occupation,
      );
      final accessToken = result.tokens.accessToken;
      _accessToken = accessToken;
      _refreshToken = result.tokens.refreshToken;
      _user = result.user;
      await _tokenStorage.writeTokens(
        accessToken: accessToken,
        refreshToken: result.tokens.refreshToken,
      );

      final customerId = result.user.customer?.id;
      if (customerId != null) {
        await _authService.setWalletPin(
          accessToken: accessToken,
          customerId: customerId,
          pin: walletPin,
        );
      }

      // Upload foto profil bila user memilih foto (bukan avatar preset).
      // Best-effort: kegagalan upload tidak membatalkan registrasi.
      if (photoBytes != null && photoBytes.isNotEmpty) {
        try {
          await _authService.uploadAvatar(
            accessToken: accessToken,
            userId: result.user.id,
            bytes: photoBytes,
            filename: photoName ?? 'avatar.jpg',
          );
        } catch (_) {
          // abaikan; foto bisa diunggah ulang dari profil nanti.
        }
      }

      // Refresh profil agar hasWalletPin & avatarUrl tersinkron.
      _user = await _authService.getMe(accessToken);

      _status = AuthStatus.authenticated;
      notifyListeners();
    } on ApiException catch (e) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = e.message;
      notifyListeners();
      rethrow;
    } catch (_) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = 'Gagal membuat akun. Coba lagi.';
      notifyListeners();
      rethrow;
    }
  }

  Future<void> signInPreview({
    required String phone,
    String? name,
  }) async {
    _status = AuthStatus.loading;
    _errorMessage = null;
    notifyListeners();

    _accessToken = 'preview-token';
    _refreshToken = null;
    _user = AppUser(
      id: 'preview-${DateTime.now().millisecondsSinceEpoch}',
      name: (name == null || name.trim().isEmpty) ? 'Customer' : name.trim(),
      role: 'CUSTOMER',
      phone: phone,
    );
    _status = AuthStatus.authenticated;
    notifyListeners();
  }

  /// Batch 5 (T1): dipasang ke [ApiClient.onUnauthorized]. Mengembalikan access
  /// token baru, atau null bila sesi benar-benar berakhir (lalu logout lokal
  /// dengan pesan "Sesi berakhir").
  Future<String?> handleUnauthorized(String failedAccessToken) async {
    // Request lain sudah me-refresh → cukup pakai token terbaru.
    if (_accessToken != null && _accessToken != failedAccessToken) {
      return _accessToken;
    }
    if (_status != AuthStatus.authenticated && _status != AuthStatus.loading) {
      return null;
    }
    final inflight = _refreshing;
    if (inflight != null) return inflight;
    final future = _refreshOnce();
    _refreshing = future;
    try {
      return await future;
    } finally {
      _refreshing = null;
    }
  }

  Future<String?> _refreshOnce() async {
    if (_refreshToken == null) {
      await _expireSession();
      return null;
    }
    try {
      await _refreshAccessToken();
      notifyListeners();
      return _accessToken;
    } on ApiException catch (e) {
      // 401/403 = refresh token ditolak (dicabut, kedaluwarsa, dipakai ulang).
      // Error lain (jaringan, 5xx) = sesi dipertahankan; request gagal biasa.
      if (e.statusCode == 401 || e.statusCode == 403) {
        await _expireSession();
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _expireSession() async {
    if (_status == AuthStatus.unauthenticated) return;
    await signOut(localOnly: true);
    _errorMessage = sessionExpiredMessage;
    notifyListeners();
  }

  /// Batch 5: ganti kata sandi. Melempar [ApiException] dengan pesan server.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final token = _accessToken;
    if (token == null) throw ApiException(sessionExpiredMessage, statusCode: 401);
    await _authService.changePassword(
      accessToken: token,
      currentPassword: currentPassword,
      newPassword: newPassword,
    );
  }

  /// Batch 5: keluar dari semua perangkat, lalu logout lokal.
  Future<void> signOutEverywhere() async {
    final token = _accessToken;
    if (token != null) {
      await _authService.logoutAll(accessToken: token);
    }
    await signOut(localOnly: true);
  }

  Future<void> signOut({bool localOnly = false}) async {
    if (!localOnly && _accessToken != null && _refreshToken != null) {
      try {
        await _authService.logout(
          accessToken: _accessToken!,
          refreshToken: _refreshToken!,
        );
      } catch (_) {
        // Best effort logout.
      }
    }

    await _tokenStorage.clear();
    _accessToken = null;
    _refreshToken = null;
    _user = null;
    _errorMessage = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  Future<bool> updateProfile({
    required String name,
    String? email,
  }) async {
    if (_user == null || _accessToken == null) return false;

    _isProfileUpdating = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _user = await _authService.updateProfile(
        accessToken: _accessToken!,
        name: name,
        email: email,
      );
      _isProfileUpdating = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _errorMessage = e.message;
      _isProfileUpdating = false;
      notifyListeners();
      return false;
    } catch (_) {
      _errorMessage = 'Gagal memperbarui profil.';
      _isProfileUpdating = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> _hydrateUser() async {
    if (_accessToken == null && _refreshToken == null) {
      _setUnauthenticated();
      return;
    }

    try {
      if (_accessToken == null && _refreshToken != null) {
        await _refreshAccessToken();
      }

      if (_accessToken == null) {
        _setUnauthenticated();
        return;
      }

      _user = await _authService.getMe(_accessToken!);
      _status = AuthStatus.authenticated;
      notifyListeners();
    } on ApiException {
      if (_refreshToken == null) {
        _setUnauthenticated();
        return;
      }

      try {
        await _refreshAccessToken();
        if (_accessToken == null) {
          _setUnauthenticated();
          return;
        }

        _user = await _authService.getMe(_accessToken!);
        _status = AuthStatus.authenticated;
        notifyListeners();
      } catch (_) {
        await signOut(localOnly: true);
      }
    }
  }

  Future<void> _refreshAccessToken() async {
    if (_refreshToken == null) return;

    final tokens = await _authService.refresh(_refreshToken!);
    _accessToken = tokens.accessToken;
    _refreshToken = tokens.refreshToken;
    await _tokenStorage.writeTokens(
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    );
  }

  void _setUnauthenticated() {
    _status = AuthStatus.unauthenticated;
    _user = null;
    _accessToken = null;
    _refreshToken = null;
    notifyListeners();
  }
}
