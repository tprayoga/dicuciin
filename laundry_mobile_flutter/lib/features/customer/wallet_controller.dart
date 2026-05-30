import 'package:flutter/foundation.dart';

/// State wallet (mock, in-memory). Menyimpan saldo + PIN wallet.
/// Nanti diganti sambungan ke API wallet backend.
class WalletController extends ChangeNotifier {
  int _balance = 100000;
  String? _pin;

  int get balance => _balance;

  /// Sudah ada PIN yang diset (mis. saat register).
  bool get hasPin => _pin != null;

  void setPin(String pin) {
    _pin = pin;
    notifyListeners();
  }

  bool verifyPin(String input) => _pin != null && _pin == input;

  bool canPay(int amount) => amount <= _balance;

  /// Potong saldo sebesar [amount]. Mengembalikan false jika saldo kurang.
  bool pay(int amount) {
    if (amount > _balance) return false;
    _balance -= amount;
    notifyListeners();
    return true;
  }

  void topUp(int amount) {
    if (amount <= 0) return;
    _balance += amount;
    notifyListeners();
  }
}
