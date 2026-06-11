import 'package:flutter/foundation.dart';

import '../auth/auth_controller.dart';
import '../auth/auth_service.dart';

/// State wallet. PIN wallet & saldo disambungkan ke backend.
/// Saldo diambil dari `GET /wallets/customer/:id`, pembayaran via `/pay`.
class WalletController extends ChangeNotifier {
  WalletController({required AuthService authService})
      : _authService = authService;

  final AuthService _authService;

  int _balance = 0;
  bool _loadingBalance = false;

  // Kredensial & status PIN diisi dari AuthController (lihat ProxyProvider).
  String? _accessToken;
  String? _customerId;
  bool _hasPin = false;

  int get balance => _balance;
  bool get loadingBalance => _loadingBalance;

  /// Sudah ada PIN wallet yang diset (sumber kebenaran: backend via /auth/me).
  bool get hasPin => _hasPin;

  /// Disinkronkan dari AuthController setiap kali user/auth berubah.
  void syncFromAuth(AuthController auth) {
    final customer = auth.user?.customer;
    final nextHasPin = customer?.hasWalletPin ?? false;
    final nextToken = auth.accessToken;
    final nextCustomerId = customer?.id;

    final changed = nextHasPin != _hasPin ||
        nextToken != _accessToken ||
        nextCustomerId != _customerId;

    final shouldLoad = nextCustomerId != null &&
        nextToken != null &&
        (nextCustomerId != _customerId || nextToken != _accessToken);

    _accessToken = nextToken;
    _customerId = nextCustomerId;
    _hasPin = nextHasPin;

    // Logout / belum login → reset saldo.
    if (nextCustomerId == null) _balance = 0;

    // Hindari notifyListeners saat fase build (update ProxyProvider).
    if (changed) {
      Future.microtask(notifyListeners);
    }
    if (shouldLoad) {
      Future.microtask(loadBalance);
    }
  }

  /// Muat saldo terkini dari backend. Aman dipanggil berulang.
  Future<void> loadBalance() async {
    final token = _accessToken;
    final customerId = _customerId;
    if (token == null || customerId == null) return;

    _loadingBalance = true;
    notifyListeners();
    try {
      _balance = await _authService.getWalletBalance(
        accessToken: token,
        customerId: customerId,
      );
    } catch (_) {
      // Diamkan: saldo tetap nilai terakhir; UI bisa tampilkan apa adanya.
    } finally {
      _loadingBalance = false;
      notifyListeners();
    }
  }

  /// Set / ganti PIN wallet di backend. Melempar [ApiException] bila gagal.
  Future<void> setPin(String pin) async {
    final token = _accessToken;
    final customerId = _customerId;
    if (token == null || customerId == null) {
      throw StateError('Belum login: tidak bisa menyimpan PIN.');
    }
    await _authService.setWalletPin(
      accessToken: token,
      customerId: customerId,
      pin: pin,
    );
    _hasPin = true;
    notifyListeners();
  }

  /// Verifikasi PIN wallet ke backend. true bila cocok, false bila salah.
  Future<bool> verifyPin(String input) async {
    final token = _accessToken;
    final customerId = _customerId;
    if (token == null || customerId == null) return false;
    return _authService.verifyWalletPin(
      accessToken: token,
      customerId: customerId,
      pin: input,
    );
  }

  bool canPay(int amount) => amount <= _balance;

  /// Bayar [amount] untuk [orderId] memakai saldo. Backend memotong saldo,
  /// membuat Payment, dan menandai order PAID. Saldo lokal diperbarui dari
  /// respons server. Melempar [ApiException] bila gagal (mis. saldo kurang).
  Future<void> payOrder({
    required String orderId,
    required int amount,
  }) async {
    final token = _accessToken;
    final customerId = _customerId;
    if (token == null || customerId == null) {
      throw StateError('Belum login: tidak bisa membayar.');
    }
    _balance = await _authService.payWithWallet(
      accessToken: token,
      customerId: customerId,
      orderId: orderId,
      amount: amount,
    );
    notifyListeners();
  }

  /// Top up saldo via backend. Saldo diperbarui dari respons server.
  Future<void> topUp(int amount) async {
    final token = _accessToken;
    final customerId = _customerId;
    if (amount <= 0 || token == null || customerId == null) return;
    _balance = await _authService.topUpWallet(
      accessToken: token,
      customerId: customerId,
      amount: amount,
    );
    notifyListeners();
  }
}
