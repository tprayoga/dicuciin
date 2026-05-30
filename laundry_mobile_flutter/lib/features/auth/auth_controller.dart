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

  Future<void> register({
    required String name,
    String? email,
    String? phone,
    required String password,
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
      );
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
      _errorMessage = 'Gagal membuat akun. Coba lagi.';
      notifyListeners();
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
    String? phone,
  }) async {
    if (_user == null || _accessToken == null) return false;

    _isProfileUpdating = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _user = await _authService.updateProfile(
        accessToken: _accessToken!,
        userId: _user!.id,
        name: name,
        email: email,
        phone: phone,
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
