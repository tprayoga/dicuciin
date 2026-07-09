import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/assets/kiosk_mascot_assets.dart';
import '../../kiosk_controller.dart';
import '../../shared/widgets/kiosk_mascot_panel.dart';
import 'member_login_controller.dart';
import 'member_login_widgets.dart';

// Palet brand Di.Cuciin (selaras dengan kiosk_app.dart).
const _primary = Color(0xFF0360DA);
const _textDark = Color(0xFF272526);
const _line = Color(0xFFBFCDE0);
const _background = Color(0xFFF2F5FA);

/// Layar "Login sebagai Member" untuk kiosk (UI-only).
///
/// Dirender oleh router kiosk saat `KioskStage.memberLogin`. Sub-state internal
/// (QR/OTP/PIN/success/error) dikelola [MemberLoginUiController] — belum
/// memanggil backend. Flow guest & business logic tidak diubah.
class MemberLoginScreen extends StatelessWidget {
  const MemberLoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<MemberLoginUiController>(
      create: (_) => MemberLoginUiController(context.read<KioskController>()),
      child: const _MemberLoginView(),
    );
  }
}

class _MemberLoginView extends StatelessWidget {
  const _MemberLoginView();

  @override
  Widget build(BuildContext context) {
    final c = context.watch<MemberLoginUiController>();
    return Scaffold(
      backgroundColor: _background,
      body: SafeArea(
        child: switch (c.state) {
          MemberLoginUiState.initial => const _InitialState(),
          MemberLoginUiState.qrScan => const _QrScanState(),
          MemberLoginUiState.otpInput => const _OtpState(),
          MemberLoginUiState.pinLogin => const _PinState(),
          MemberLoginUiState.success => const _SuccessState(),
          MemberLoginUiState.error => const _ErrorState(),
        },
      ),
    );
  }
}

// ── Komponen umum ─────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  const _Header({required this.title, required this.onBack});

  final String title;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 4),
      child: Row(
        children: [
          IconButton(
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back, color: _textDark),
          ),
          const SizedBox(width: 4),
          Text(
            title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: _textDark,
            ),
          ),
        ],
      ),
    );
  }
}

SizedBox _bigPrimary(String label, VoidCallback? onTap, {IconData? icon}) {
  return SizedBox(
    height: 56,
    width: double.infinity,
    child: FilledButton.icon(
      style: FilledButton.styleFrom(
        backgroundColor: _primary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      onPressed: onTap,
      icon: icon == null ? const SizedBox.shrink() : Icon(icon, size: 20),
      label: Text(
        label,
        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
      ),
    ),
  );
}

SizedBox _bigOutline(String label, VoidCallback? onTap) {
  return SizedBox(
    height: 52,
    width: double.infinity,
    child: OutlinedButton(
      style: OutlinedButton.styleFrom(
        side: const BorderSide(color: _primary),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      onPressed: onTap,
      child: Text(
        label,
        style: const TextStyle(
          color: _primary,
          fontSize: 16,
          fontWeight: FontWeight.w700,
        ),
      ),
    ),
  );
}

// ── 1. Initial: pilihan metode login ──────────────────────────────────

class _InitialState extends StatelessWidget {
  const _InitialState();

  @override
  Widget build(BuildContext context) {
    final c = context.read<MemberLoginUiController>();
    return Column(
      children: [
        _Header(
          title: 'Login Member',
          onBack: () => context.read<KioskController>().newOrder(),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            children: [
              const KioskMascotPanel(
                mascotAsset: KioskMascotAssets.kioskFastLoginQr,
                title: 'Login sebagai member',
                message: 'Pakai wallet, voucher, dan loyalty point kamu.',
                showCard: false,
              ),
              const SizedBox(height: 8),
              MemberLoginMethodCard(
                icon: Icons.qr_code_scanner_rounded,
                title: 'Scan QR Member',
                description: 'Scan QR member dari aplikasi Di.Cuciin kamu.',
                buttonText: 'Mulai Scan QR',
                highlighted: true,
                onPressed: c.openQrScan,
              ),
              const SizedBox(height: 14),
              MemberLoginMethodCard(
                icon: Icons.smartphone_rounded,
                title: 'Login dengan Nomor HP',
                description: 'Masukkan nomor HP yang terdaftar.',
                buttonText: 'Lanjut Nomor HP',
                onPressed: c.openPhoneOtp,
              ),
              const SizedBox(height: 14),
              MemberLoginMethodCard(
                icon: Icons.dialpad_rounded,
                title: 'Login dengan Member ID',
                description: 'Masukkan Member ID dan PIN.',
                buttonText: 'Lanjut Member ID',
                onPressed: c.openPinLogin,
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: _bigOutline('Lanjut sebagai Guest', c.continueAsGuest),
        ),
      ],
    );
  }
}

// ── 2. QR Scan ────────────────────────────────────────────────────────

class _QrScanState extends StatelessWidget {
  const _QrScanState();

  @override
  Widget build(BuildContext context) {
    final c = context.read<MemberLoginUiController>();
    return Column(
      children: [
        _Header(title: 'Scan QR Member', onBack: c.backToInitial),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            children: [
              const KioskMascotPanel(
                mascotAsset: KioskMascotAssets.kioskFastLoginQr,
                title: 'Scan QR member',
                message: 'Arahkan QR member ke kamera kiosk.',
                showCard: false,
              ),
              const SizedBox(height: 8),
              // Area scanner simulasi (UI-only).
              AspectRatio(
                aspectRatio: 1,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: _primary, width: 3),
                  ),
                  child: const Center(
                    child: Icon(
                      Icons.qr_code_2_rounded,
                      size: 160,
                      color: _line,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: Column(
            children: [
              _bigPrimary('Simulasi QR Berhasil', c.simulateQrLogin),
              const SizedBox(height: 10),
              _bigOutline('Kembali', c.backToInitial),
            ],
          ),
        ),
      ],
    );
  }
}

// ── 3. OTP (fase nomor HP → fase kode OTP) ────────────────────────────

class _OtpState extends StatefulWidget {
  const _OtpState();

  @override
  State<_OtpState> createState() => _OtpStateState();
}

class _OtpStateState extends State<_OtpState> {
  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();

  @override
  void dispose() {
    _phoneController.dispose();
    _otpController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.watch<MemberLoginUiController>();
    final phoneSent = c.phone.isNotEmpty;
    return Column(
      children: [
        _Header(title: 'Login Nomor HP', onBack: c.backToInitial),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            children: [
              KioskMascotPanel(
                mascotAsset: KioskMascotAssets.waiting,
                title: phoneSent ? 'Masukkan kode OTP' : 'Masukkan nomor HP',
                message: phoneSent
                    ? 'Masukkan kode OTP yang dikirim ke ${c.phone}.'
                    : 'Masukkan nomor HP yang terdaftar.',
                showCard: false,
              ),
              const SizedBox(height: 8),
              if (!phoneSent)
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  style: const TextStyle(fontSize: 18),
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(15),
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Nomor HP',
                    hintText: 'cth: 0812xxxxxxx',
                  ),
                )
              else
                TextField(
                  controller: _otpController,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 8,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Kode OTP (6 digit)',
                    hintText: '••••••',
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: phoneSent
              ? Column(
                  children: [
                    _bigPrimary(
                      'Verifikasi OTP',
                      () => c.verifyOtp(_otpController.text),
                    ),
                    const SizedBox(height: 10),
                    _bigOutline('Kirim Ulang', c.resendOtp),
                  ],
                )
              : _bigPrimary(
                  'Kirim OTP',
                  () => c.sendOtp(_phoneController.text),
                ),
        ),
      ],
    );
  }
}

// ── 4. PIN Login (Member ID + PIN) ────────────────────────────────────

class _PinState extends StatefulWidget {
  const _PinState();

  @override
  State<_PinState> createState() => _PinStateState();
}

class _PinStateState extends State<_PinState> {
  final _memberIdController = TextEditingController();
  final _pinController = TextEditingController();

  @override
  void dispose() {
    _memberIdController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.read<MemberLoginUiController>();
    return Column(
      children: [
        _Header(title: 'Login Member ID', onBack: c.backToInitial),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            children: [
              const KioskMascotPanel(
                mascotAsset: KioskMascotAssets.kioskPinConfirmationSecurity,
                title: 'Masuk dengan Member ID',
                message: 'Masukkan Member ID dan PIN.',
                showCard: false,
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _memberIdController,
                style: const TextStyle(fontSize: 18),
                decoration: const InputDecoration(
                  labelText: 'Member ID',
                  hintText: 'cth: DC123456',
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _pinController,
                obscureText: true,
                keyboardType: TextInputType.number,
                style: const TextStyle(fontSize: 18, letterSpacing: 4),
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                decoration: const InputDecoration(
                  labelText: 'PIN',
                  hintText: '••••',
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: _bigPrimary(
            'Masuk',
            () => c.loginWithMemberIdPin(
              _memberIdController.text,
              _pinController.text,
            ),
          ),
        ),
      ],
    );
  }
}

// ── 5. Success ────────────────────────────────────────────────────────

class _SuccessState extends StatelessWidget {
  const _SuccessState();

  @override
  Widget build(BuildContext context) {
    final c = context.read<MemberLoginUiController>();
    final member = c.member ?? kDummyMember;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
            children: [
              const KioskMascotPanel(
                mascotAsset: KioskMascotAssets.paymentSuccessBasketConfetti,
                title: 'Login berhasil',
                message: 'Selamat datang kembali, Member Di.Cuciin.',
                showCard: false,
              ),
              const SizedBox(height: 12),
              MemberSummaryCard(
                name: member.name,
                tier: member.tier,
                walletBalance: member.walletBalance,
                points: member.points,
                activeVouchers: member.activeVouchers,
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: _bigPrimary(
            'Lanjut Pilih Mesin',
            c.continueToMachineSelection,
            icon: Icons.local_laundry_service_rounded,
          ),
        ),
      ],
    );
  }
}

// ── 6. Error ──────────────────────────────────────────────────────────

class _ErrorState extends StatelessWidget {
  const _ErrorState();

  @override
  Widget build(BuildContext context) {
    final c = context.read<MemberLoginUiController>();
    final asset = c.errorIsConnection
        ? KioskMascotAssets.errorNoInternet
        : KioskMascotAssets.confused;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
            children: [
              KioskMascotPanel(
                mascotAsset: asset,
                title: 'Login belum berhasil',
                message: c.errorMessage.isEmpty
                    ? 'Login belum berhasil. Coba lagi atau lanjut sebagai guest.'
                    : '${c.errorMessage} Coba lagi atau lanjut sebagai guest.',
                showCard: false,
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
          child: Column(
            children: [
              _bigPrimary('Coba Lagi', c.backToInitial),
              const SizedBox(height: 10),
              _bigOutline('Lanjut sebagai Guest', c.continueAsGuest),
            ],
          ),
        ),
      ],
    );
  }
}
