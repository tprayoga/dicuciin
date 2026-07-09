import 'package:flutter/foundation.dart';

import '../../kiosk_controller.dart';

/// Sub-state UI untuk alur "Login sebagai Member" di kiosk.
enum MemberLoginUiState { initial, qrScan, otpInput, pinLogin, success, error }

/// Ringkasan data member untuk kartu tampilan. UI-ONLY (data dummy).
///
/// TODO: replace dummy member data with API response.
class MemberSummary {
  const MemberSummary({
    required this.name,
    required this.tier,
    required this.walletBalance,
    required this.points,
    required this.activeVouchers,
  });

  final String name;
  final String tier;
  final int walletBalance;
  final int points;
  final int activeVouchers;
}

/// Data dummy lokal — tidak disimpan ke DB, tidak diambil dari backend.
const MemberSummary kDummyMember = MemberSummary(
  name: 'Member Di.Cuciin',
  tier: 'Silver',
  walletBalance: 50000,
  points: 120,
  activeVouchers: 2,
);

/// Controller UI-ONLY untuk login member di kiosk.
///
/// Seluruh aksi masih simulasi lokal (dummy) — belum ada panggilan API.
/// Navigasi ke flow existing (pilih mesin / guest) didelegasikan ke
/// [KioskController] tanpa mengubah business logic-nya.
class MemberLoginUiController extends ChangeNotifier {
  MemberLoginUiController(this._kiosk);

  final KioskController _kiosk;

  MemberLoginUiState state = MemberLoginUiState.initial;

  String phone = '';
  String memberId = '';
  String errorMessage = '';
  bool errorIsConnection = false;
  MemberSummary? member;

  void _go(MemberLoginUiState next) {
    state = next;
    notifyListeners();
  }

  /// Kembali ke pilihan metode login (reset input sementara).
  void backToInitial() {
    phone = '';
    memberId = '';
    errorMessage = '';
    errorIsConnection = false;
    _go(MemberLoginUiState.initial);
  }

  // ── Pilih metode login ──────────────────────────────────────────────
  void openQrScan() => _go(MemberLoginUiState.qrScan);
  void openPhoneOtp() => _go(MemberLoginUiState.otpInput);
  void openPinLogin() => _go(MemberLoginUiState.pinLogin);

  /// Kirim OTP ke nomor HP (lanjut ke fase input OTP pada layar yang sama).
  /// TODO: connect to backend member auth API (request OTP).
  void sendOtp(String phoneInput) {
    final value = phoneInput.trim();
    if (value.length < 8) {
      _fail('Nomor HP belum valid.');
      return;
    }
    phone = value;
    state = MemberLoginUiState.otpInput;
    notifyListeners();
  }

  /// TODO: connect to backend member auth API (resend OTP).
  void resendOtp() {
    // UI-only: belum mengirim ulang apa pun.
    notifyListeners();
  }

  // ── Aksi login (semua dummy) ────────────────────────────────────────
  /// TODO: connect to backend member auth API (verify QR token).
  void simulateQrLogin() => _loginSuccess();

  /// TODO: connect to backend member auth API (verify OTP).
  void verifyOtp(String otpInput) {
    if (otpInput.trim().length != 6) {
      _fail('Kode OTP harus 6 digit.');
      return;
    }
    _loginSuccess();
  }

  /// TODO: connect to backend member auth API (login Member ID + PIN).
  void loginWithMemberIdPin(String id, String pin) {
    if (id.trim().isEmpty || pin.length < 4) {
      _fail('Member ID atau PIN belum sesuai.');
      return;
    }
    memberId = id.trim();
    _loginSuccess();
  }

  /// Pratinjau error koneksi (untuk demo error state).
  void simulateConnectionError() {
    errorIsConnection = true;
    errorMessage = 'Koneksi terputus.';
    _go(MemberLoginUiState.error);
  }

  // ── Navigasi ke flow existing (tanpa ubah business logic) ───────────
  /// Lanjut sebagai guest → masuk flow pilih mesin existing.
  void continueAsGuest() => _kiosk.startOrder();

  /// Setelah login member (dummy) → masuk flow pilih mesin existing.
  /// TODO: integrate wallet/voucher/loyalty member ke checkout.
  void continueToMachineSelection() => _kiosk.startOrder();

  void _fail(String message) {
    errorIsConnection = false;
    errorMessage = message;
    _go(MemberLoginUiState.error);
  }

  void _loginSuccess() {
    // TODO: replace dummy member data with API response.
    member = kDummyMember;
    _go(MemberLoginUiState.success);
  }
}
