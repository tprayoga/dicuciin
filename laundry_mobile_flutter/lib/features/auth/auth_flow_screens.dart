import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_colors.dart';
import '../../shared/widgets/pin_pad.dart';
import '../customer/home_screen.dart';
import '../customer/wallet_controller.dart';
import 'auth_controller.dart';

const _bgColor = AppColors.surfaceAlt;
const _primaryBlue = AppColors.primary;
const _textDark = AppColors.textStrong;
const _textMuted = AppColors.textMuted;
const _borderColor = AppColors.border;
const _disabledButton = AppColors.borderLight;
const _inputRadius = 11.0;

// ── Country picker data ──────────────────────────────────────────────────────

class _Country {
  const _Country(this.flag, this.code, this.dialCode, this.name);
  final String flag;
  final String code;
  final String dialCode;
  final String name;
}

const _countries = [
  _Country('🇮🇩', 'ID', '+62', 'Indonesia'),
  _Country('🇸🇬', 'SG', '+65', 'Singapura'),
  _Country('🇲🇾', 'MY', '+60', 'Malaysia'),
  _Country('🇵🇭', 'PH', '+63', 'Filipina'),
  _Country('🇹🇭', 'TH', '+66', 'Thailand'),
  _Country('🇻🇳', 'VN', '+84', 'Vietnam'),
  _Country('🇧🇳', 'BN', '+673', 'Brunei'),
  _Country('🇧🇷', 'BR', '+55', 'Brasil'),
  _Country('🇨🇦', 'CA', '+1', 'Kanada'),
  _Country('🇨🇳', 'CN', '+86', 'Tiongkok'),
  _Country('🇩🇪', 'DE', '+49', 'Jerman'),
  _Country('🇪🇬', 'EG', '+20', 'Mesir'),
  _Country('🇪🇸', 'ES', '+34', 'Spanyol'),
  _Country('🇫🇷', 'FR', '+33', 'Prancis'),
  _Country('🇬🇧', 'GB', '+44', 'Inggris'),
  _Country('🇮🇳', 'IN', '+91', 'India'),
  _Country('🇮🇹', 'IT', '+39', 'Italia'),
  _Country('🇯🇵', 'JP', '+81', 'Jepang'),
  _Country('🇰🇷', 'KR', '+82', 'Korea Selatan'),
  _Country('🇳🇬', 'NG', '+234', 'Nigeria'),
  _Country('🇳🇱', 'NL', '+31', 'Belanda'),
  _Country('🇳🇿', 'NZ', '+64', 'Selandia Baru'),
  _Country('🇵🇰', 'PK', '+92', 'Pakistan'),
  _Country('🇷🇺', 'RU', '+7', 'Rusia'),
  _Country('🇸🇦', 'SA', '+966', 'Arab Saudi'),
  _Country('🇹🇷', 'TR', '+90', 'Turki'),
  _Country('🇦🇪', 'AE', '+971', 'Uni Emirat Arab'),
  _Country('🇺🇸', 'US', '+1', 'Amerika Serikat'),
  _Country('🇦🇺', 'AU', '+61', 'Australia'),
  _Country('🇿🇦', 'ZA', '+27', 'Afrika Selatan'),
  _Country('🇧🇩', 'BD', '+880', 'Bangladesh'),
];

enum AuthEntryType { login, register }

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // ── ZONE 1: logo + ilustrasi (mengisi) + greeting ─
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const SizedBox(height: 32),

                  // Logo + tagline
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      children: [
                        Image.asset(
                          'assets/branding/logo_dicuciin.png',
                          height: 44,
                          fit: BoxFit.contain,
                          errorBuilder: (_, _, _) => const Text(
                            'dicuciin',
                            style: TextStyle(
                              color: AppColors.primary,
                              fontSize: 34,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(height: 6),
                
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Ilustrasi — Expanded mengisi sisa ruang di zone 1
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Container(
                        width: double.infinity,
                        decoration: BoxDecoration(
                          color: AppColors.tintBlueAlt,
                          borderRadius: BorderRadius.circular(24),
                        ),
                        padding: const EdgeInsets.all(16),
                        child: Image.asset(
                          'assets/branding/illustration_laundry.png',
                          fit: BoxFit.contain,
                          errorBuilder: (_, _, _) => const Icon(
                            Icons.local_laundry_service_rounded,
                            size: 100,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Greeting — selalu rapat di atas buttons
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      children: [
                        Text(
                          'Hi, Selamat Datang👋',
                          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            color: _textDark,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Masuk untuk mulai pengalaman self service\nlaundry yang lebih mudah, cepat, dan modern.',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: _textMuted,
                            fontSize: 14,
                            height: 1.5,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),
                ],
              ),
            ),

            // ── ZONE 2: buttons + copyright (fix di bawah) ────
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 0),
              child: Column(
                children: [
                  _PrimaryButton(
                    label: 'Masuk',
                    enabled: true,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const PhoneInputScreen(
                          entryType: AuthEntryType.login,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 48,
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const PhoneInputScreen(
                            entryType: AuthEntryType.register,
                          ),
                        ),
                      ),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: _primaryBlue, width: 1.5),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(9),
                        ),
                      ),
                      child: const Text(
                        'Daftar',
                        style: TextStyle(
                          color: _primaryBlue,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    '©2026 Powered by dicuciin self service laundry',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: _textMuted,
                      fontSize: 11,
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class PhoneInputScreen extends StatefulWidget {
  const PhoneInputScreen({super.key, required this.entryType});

  final AuthEntryType entryType;

  @override
  State<PhoneInputScreen> createState() => _PhoneInputScreenState();
}

class _PhoneInputScreenState extends State<PhoneInputScreen> {
  final TextEditingController _phoneController = TextEditingController();
  bool _agreed = false;
  _Country _selectedCountry = _countries.first; // default: Indonesia

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _showCountryPicker() async {
    final result = await showModalBottomSheet<_Country>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _CountryPickerSheet(selected: _selectedCountry),
    );
    if (result != null) setState(() => _selectedCountry = result);
  }

  void _showPolicyDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Container(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 16),
              decoration: const BoxDecoration(
                color: _primaryBlue,
                borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
              ),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Kebijakan Privasi & Ketentuan Layanan',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.pop(ctx),
                    child: const Icon(Icons.close, color: Colors.white, size: 20),
                  ),
                ],
              ),
            ),

            // Konten scrollable
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _policySection(
                      'Kebijakan Privasi',
                      'dicuciin berkomitmen melindungi privasi Anda. Berikut adalah '
                      'kebijakan kami terkait pengelolaan data pribadi:\n\n'
                      '1. Data yang Dikumpulkan\n'
                      'Kami mengumpulkan nomor ponsel, nama lengkap, dan alamat email '
                      'yang Anda berikan saat mendaftar, serta data transaksi dan '
                      'penggunaan layanan.\n\n'
                      '2. Penggunaan Data\n'
                      'Data digunakan untuk memproses pesanan laundry, mengirimkan '
                      'notifikasi status, dan meningkatkan layanan kami.\n\n'
                      '3. Keamanan Data\n'
                      'Data disimpan dengan enkripsi dan tidak akan dibagikan kepada '
                      'pihak ketiga tanpa persetujuan Anda, kecuali diwajibkan oleh hukum.\n\n'
                      '4. Hak Pengguna\n'
                      'Anda berhak mengakses, memperbarui, atau menghapus data pribadi '
                      'Anda kapan saja melalui pengaturan akun.',
                    ),
                    const SizedBox(height: 24),
                    _policySection(
                      'Ketentuan Layanan',
                      '1. Penggunaan Layanan\n'
                      'Layanan dicuciin hanya boleh digunakan untuk keperluan laundry '
                      'pribadi yang sah. Pengguna wajib memberikan informasi yang akurat.\n\n'
                      '2. Pembayaran\n'
                      'Pembayaran dilakukan melalui metode yang tersedia di aplikasi. '
                      'Setiap transaksi bersifat final setelah dikonfirmasi.\n\n'
                      '3. Pembatalan & Refund\n'
                      'Pembatalan dapat dilakukan sebelum mesin mulai beroperasi. '
                      'Refund akan dikembalikan ke saldo dompet dalam 1×24 jam.\n\n'
                      '4. Tanggung Jawab\n'
                      'dicuciin tidak bertanggung jawab atas kerusakan akibat '
                      'penggunaan mesin yang tidak sesuai petunjuk.\n\n'
                      '5. Perubahan Ketentuan\n'
                      'Kami berhak memperbarui ketentuan ini sewaktu-waktu. '
                      'Perubahan akan diberitahukan melalui aplikasi.',
                    ),
                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),

            // Tombol setuju
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: SizedBox(
                height: 46,
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: _primaryBlue,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  onPressed: () {
                    setState(() => _agreed = true);
                    Navigator.pop(ctx);
                  },
                  child: const Text(
                    'Saya Setuju & Tutup',
                    style: TextStyle(fontSize: 15),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _policySection(String title, String content) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: _textDark,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          content,
          style: const TextStyle(
            fontSize: 13,
            color: _textMuted,
            height: 1.6,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasPhone = _phoneController.text.trim().isNotEmpty;
    final canContinue = hasPhone && _agreed;

    return Scaffold(
      backgroundColor: _bgColor,
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        backgroundColor: _bgColor,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        toolbarHeight: 52,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back, color: _textDark),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 16),
            Text(
              'Masukkan Nomor Ponselmu',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                color: _textDark,
                fontWeight: FontWeight.w700,
                fontSize: 22,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Kami akan mengirimkan kode OTP pada nomor\ntersebut untuk proses verifikasi',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: _textMuted,
                fontSize: 15,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 20),
            // Input nomor ponsel
            Container(
              height: 52,
              decoration: BoxDecoration(
                border: Border.all(color: _borderColor),
                borderRadius: BorderRadius.circular(_inputRadius),
                color: _bgColor,
              ),
              child: Row(
                children: [
                  // Tombol pilih negara
                  GestureDetector(
                    onTap: _showCountryPicker,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 0, 10, 0),
                      child: Row(
                        children: [
                          Text(
                            _selectedCountry.flag,
                            style: const TextStyle(fontSize: 22),
                          ),
                          const SizedBox(width: 4),
                          const Icon(
                            Icons.keyboard_arrow_down_rounded,
                            color: _textMuted,
                            size: 18,
                          ),
                        ],
                      ),
                    ),
                  ),
                  Container(width: 1, height: 22, color: _borderColor),
                  const SizedBox(width: 12),
                  Text(
                    _selectedCountry.dialCode,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: _textDark,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: TextField(
                      controller: _phoneController,
                      keyboardType: TextInputType.number,
                      maxLength: 13,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(
                        border: InputBorder.none,
                        hintText: hasPhone ? null : '81222952857',
                        isCollapsed: true,
                        counterText: '',
                      ),
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: _textDark,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 8, 20, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Checkbox + teks persetujuan
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    value: _agreed,
                    onChanged: (v) => setState(() => _agreed = v ?? false),
                    activeColor: _primaryBlue,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    visualDensity: VisualDensity.compact,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Wrap(
                    children: [
                      GestureDetector(
                        onTap: () => setState(() => _agreed = !_agreed),
                        child: const Text(
                          'Melanjutkan, saya setuju dengan ',
                          style: TextStyle(fontSize: 13, color: _textMuted),
                        ),
                      ),
                      GestureDetector(
                        onTap: () => _showPolicyDialog(context),
                        child: const Text(
                          'Kebijakan Privasi & Ketentuan Layanan',
                          style: TextStyle(
                            fontSize: 13,
                            color: _primaryBlue,
                            fontWeight: FontWeight.w600,
                            decoration: TextDecoration.underline,
                            decorationColor: _primaryBlue,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _PrimaryButton(
              label: 'Lanjut',
              enabled: canContinue,
              onTap: canContinue
                  ? () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => OtpInputScreen(
                            entryType: widget.entryType,
                            fullPhone: '+62 ${_phoneController.text}',
                          ),
                        ),
                      )
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}

class OtpInputScreen extends StatefulWidget {
  const OtpInputScreen({
    super.key,
    required this.entryType,
    required this.fullPhone,
  });

  final AuthEntryType entryType;
  final String fullPhone;

  @override
  State<OtpInputScreen> createState() => _OtpInputScreenState();
}

class _OtpInputScreenState extends State<OtpInputScreen> {
  final TextEditingController _otpController = TextEditingController();
  final FocusNode _focusNode = FocusNode();

  Timer? _timer;
  int _remainingSeconds = 89;
  bool _isSubmitting = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    _startTimer();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _focusNode.dispose();
    _otpController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final otp = _otpController.text;
    final canVerify = otp.length == 4;

    return Scaffold(
      backgroundColor: _bgColor,
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        backgroundColor: _bgColor,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        toolbarHeight: 52,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back, color: _textDark),
        ),
      ),
      body: GestureDetector(
        onTap: () => _focusNode.requestFocus(),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 16),
              Text(
                'Masukkan Nomor Ponselmu',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: _textDark,
                  fontWeight: FontWeight.w700,
                  fontSize: 22,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'Silakan masukkan kode OTP yang dikirim ke nomor\n${_maskPhone(widget.fullPhone)}',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: _textMuted,
                  fontSize: 15,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: List.generate(4, (index) {
                  final isActive = otp.length == index;
                  final char = otp.length > index ? otp[index] : '';

                  return Container(
                    width: 52,
                    height: 56,
                    margin: EdgeInsets.only(right: index == 3 ? 0 : 10),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(_inputRadius),
                      border: Border.all(
                        color: isActive ? _primaryBlue : _borderColor,
                        width: isActive ? 2 : 1,
                      ),
                      color: _bgColor,
                    ),
                    child: Center(
                      child: Text(
                        char,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: _textMuted,
                            ),
                      ),
                    ),
                  );
                }),
              ),
              Opacity(
                opacity: 0,
                child: SizedBox(
                  height: 0,
                  child: TextField(
                    controller: _otpController,
                    focusNode: _focusNode,
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(4),
                    ],
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Tidak menerima kodenya?',
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(color: _textMuted),
              ),
              const SizedBox(height: 6),
              RichText(
                text: TextSpan(
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: _textMuted,
                    fontSize: 15,
                  ),
                  children: [
                    const TextSpan(text: 'Kirim Ulang '),
                    TextSpan(
                      text: _remainingSeconds > 0
                          ? _formatTime(_remainingSeconds)
                          : 'Sekarang',
                      style: TextStyle(
                        color: _remainingSeconds > 0 ? _textDark : _primaryBlue,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              if (_submitError != null) ...[
                const SizedBox(height: 12),
                Text(
                  _submitError!,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppColors.errorDark,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        child: _PrimaryButton(
          label: 'Verifikasi',
          enabled: canVerify && !_isSubmitting,
          onTap: canVerify && !_isSubmitting ? _handleVerify : null,
        ),
      ),
    );
  }

  Future<void> _handleVerify() async {
    if (widget.entryType == AuthEntryType.register) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => CompleteDataScreen(fullPhone: widget.fullPhone),
        ),
      );
      return;
    }

    setState(() {
      _isSubmitting = true;
      _submitError = null;
    });

    try {
      await context.read<AuthController>().signInPreview(phone: widget.fullPhone);
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
        (route) => false,
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _submitError = 'Gagal login. Coba lagi.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSubmitting = false;
        });
      }
    }
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_remainingSeconds <= 0) {
        timer.cancel();
        return;
      }
      setState(() {
        _remainingSeconds -= 1;
      });
    });
  }

  String _formatTime(int totalSeconds) {
    final minutes = totalSeconds ~/ 60;
    final seconds = totalSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  String _maskPhone(String fullPhone) {
    final digitsOnly = fullPhone.replaceAll(RegExp(r'[^0-9]'), '');
    if (digitsOnly.length <= 4) return '******$digitsOnly';
    return '******${digitsOnly.substring(digitsOnly.length - 4)}';
  }
}

class CompleteDataScreen extends StatefulWidget {
  const CompleteDataScreen({super.key, required this.fullPhone});

  final String fullPhone;

  @override
  State<CompleteDataScreen> createState() => _CompleteDataScreenState();
}

class _CompleteDataScreenState extends State<CompleteDataScreen> {
  // Controllers
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _birthDateController = TextEditingController();

  // FocusNodes untuk deteksi blur
  final FocusNode _nameFocus = FocusNode();
  final FocusNode _emailFocus = FocusNode();

  // Touched per field (error tampil setelah user meninggalkan field)
  bool _touchedName = false;
  bool _touchedEmail = false;
  bool _touchedBirth = false;
  bool _touchedGender = false;
  bool _submitted = false;

  String? _gender;

  // ── Validasi ─────────────────────────────────────────────────
  bool get _isNameValid => _nameController.text.trim().isNotEmpty;
  bool get _isEmailValid =>
      RegExp(r'^[\w.-]+@([\w-]+\.)+[\w-]{2,}$')
          .hasMatch(_emailController.text.trim());
  bool get _isBirthValid => _birthDateController.text.isNotEmpty;
  bool get _isGenderValid => _gender != null;
  bool get _isFormValid =>
      _isNameValid && _isEmailValid && _isBirthValid && _isGenderValid;

  // Error tampil bila sudah disentuh DAN tidak valid
  bool get _showNameError => (_touchedName || _submitted) && !_isNameValid;
  bool get _showEmailError => (_touchedEmail || _submitted) && !_isEmailValid;
  bool get _showBirthError => (_touchedBirth || _submitted) && !_isBirthValid;
  bool get _showGenderError => (_touchedGender || _submitted) && !_isGenderValid;

  String get _emailErrorMsg => _emailController.text.trim().isEmpty
      ? 'Email wajib diisi'
      : 'Format email tidak valid (contoh: nama@email.com)';

  @override
  void initState() {
    super.initState();
    _nameController.addListener(_rebuild);
    _emailController.addListener(_rebuild);

    // Tandai touched saat focus keluar
    _nameFocus.addListener(() {
      if (!_nameFocus.hasFocus && _nameController.text.isNotEmpty) {
        setState(() => _touchedName = true);
      }
    });
    _emailFocus.addListener(() {
      if (!_emailFocus.hasFocus && _emailController.text.isNotEmpty) {
        setState(() => _touchedEmail = true);
      }
    });
  }

  void _rebuild() => setState(() {});

  @override
  void dispose() {
    _nameController.removeListener(_rebuild);
    _emailController.removeListener(_rebuild);
    _nameController.dispose();
    _emailController.dispose();
    _birthDateController.dispose();
    _nameFocus.dispose();
    _emailFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bgColor,
      appBar: AppBar(
        backgroundColor: _bgColor,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back, color: _textDark),
        ),
        titleSpacing: 0,
        title: Text(
          'Lengkapi Data',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: _textDark,
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Lengkapi Data Diri',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: _textDark,
                          fontWeight: FontWeight.w700,
                          fontSize: 18,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Masukkan informasi mengenai\ndata diri Anda',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              color: _textMuted,
                              height: 1.25,
                              fontSize: 14,
                            ),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 80,
                  height: 80,
                  decoration: const BoxDecoration(
                    color: AppColors.tintBlue,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.account_circle_outlined,
                    size: 40,
                    color: AppColors.textMutedLight,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Nama Lengkap
            _LabeledInput(
              label: 'Nama Lengkap',
              hint: 'Masukan nama lengkap',
              controller: _nameController,
              focusNode: _nameFocus,
              isError: _showNameError,
            ),
            if (_showNameError)
              _errorText('Nama lengkap wajib diisi'),
            const SizedBox(height: 14),

            // Email
            _LabeledInput(
              label: 'Email',
              hint: 'Masukan alamat email',
              controller: _emailController,
              focusNode: _emailFocus,
              keyboardType: TextInputType.emailAddress,
              isError: _showEmailError,
            ),
            if (_showEmailError)
              _errorText(_emailErrorMsg),
            const SizedBox(height: 14),

            // Tanggal Lahir
            _LabeledInput(
              label: 'Tanggal Lahir',
              hint: 'Pilih tanggal lahir',
              controller: _birthDateController,
              readOnly: true,
              suffixIcon: Icons.calendar_today_outlined,
              onTap: _pickDate,
              isError: _showBirthError,
            ),
            if (_showBirthError)
              _errorText('Tanggal lahir wajib dipilih'),
            const SizedBox(height: 14),

            // Jenis Kelamin
            _GenderDropdown(
              value: _gender,
              onChanged: (value) {
                setState(() {
                  _gender = value;
                  _touchedGender = true;
                });
              },
              isError: _showGenderError,
            ),
            if (_showGenderError)
              _errorText('Jenis kelamin wajib dipilih'),

            const SizedBox(height: 24),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 8, 20, 12),
        child: _PrimaryButton(
          label: 'Lanjut',
          enabled: _isFormValid,
          onTap: () {
            // Tandai semua field sebagai touched untuk tampilkan semua error
            setState(() {
              _submitted = true;
              _touchedName = true;
              _touchedEmail = true;
              _touchedBirth = true;
              _touchedGender = true;
            });
            if (!_isFormValid) return;
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => UploadProfileScreen(
                  fullPhone: widget.fullPhone,
                  fullName: _nameController.text.trim(),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _errorText(String msg) => Padding(
    padding: const EdgeInsets.only(top: 5, left: 2),
    child: Row(
      children: [
        const Icon(Icons.error_outline, size: 13, color: AppColors.error),
        const SizedBox(width: 4),
        Expanded(
          child: Text(
            msg,
            style: const TextStyle(fontSize: 12, color: AppColors.error),
          ),
        ),
      ],
    ),
  );

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final selected = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 20),
      firstDate: DateTime(1950),
      lastDate: DateTime(now.year - 5),
    );
    // Tandai touched meskipun user cancel
    setState(() => _touchedBirth = true);
    if (selected == null || !mounted) return;
    _birthDateController.text =
        '${selected.day.toString().padLeft(2, '0')}/'
        '${selected.month.toString().padLeft(2, '0')}/'
        '${selected.year}';
    setState(() {});
  }
}

class UploadProfileScreen extends StatefulWidget {
  const UploadProfileScreen({
    super.key,
    required this.fullPhone,
    required this.fullName,
  });

  final String fullPhone;
  final String fullName;

  @override
  State<UploadProfileScreen> createState() => _UploadProfileScreenState();
}

class _UploadProfileScreenState extends State<UploadProfileScreen> {
  File? _imageFile;
  int? _selectedAvatar; // index 0–5, null = belum pilih

  bool get _hasSelection => _imageFile != null || _selectedAvatar != null;

  static const _avatarColors = [
    AppColors.primary,
    AppColors.success,
    AppColors.warning,
    Color(0xFF7B1FA2), // ungu
    Color(0xFFD81B60), // pink
    Color(0xFF00838F), // teal
  ];

  Future<void> _showImageSourceSheet() async {
    await showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Pilih Foto Profil',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: _textDark,
                ),
              ),
              const SizedBox(height: 16),
              _sourceOption(
                icon: Icons.camera_alt_outlined,
                label: 'Ambil Foto dari Kamera',
                onTap: () => _pickImage(ImageSource.camera),
              ),
              const SizedBox(height: 12),
              _sourceOption(
                icon: Icons.photo_library_outlined,
                label: 'Pilih dari Galeri',
                onTap: () => _pickImage(ImageSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sourceOption({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: () {
        Navigator.pop(context);
        onTap();
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(icon, color: _primaryBlue, size: 22),
            const SizedBox(width: 14),
            Text(
              label,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: _textDark,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickImage(ImageSource source) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: source,
      imageQuality: 80,
      maxWidth: 512,
    );
    if (picked == null) return;
    setState(() {
      _imageFile = File(picked.path);
      _selectedAvatar = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bgColor,
      appBar: AppBar(
        backgroundColor: _bgColor,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back, color: _textDark),
        ),
        titleSpacing: 0,
        title: Text(
          'Foto Profil',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: _textDark,
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            const SizedBox(height: 24),
            const Text(
              'Tambahkan foto profil',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: _textDark,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Pilih foto dari galeri atau\npilih salah satu avatar di bawah',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: _textMuted, height: 1.4),
            ),
            const SizedBox(height: 32),

            // ── Avatar besar + tombol kamera ─────────────────────
            GestureDetector(
              onTap: _showImageSourceSheet,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 150,
                    height: 150,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _selectedAvatar != null
                          ? _avatarColors[_selectedAvatar!]
                          : AppColors.tintBlue,
                      border: Border.all(
                        color: _hasSelection
                            ? _primaryBlue
                            : AppColors.borderLight,
                        width: 3,
                      ),
                    ),
                    child: _imageFile != null
                        ? ClipOval(
                            child: Image.file(
                              _imageFile!,
                              fit: BoxFit.cover,
                              width: 150,
                              height: 150,
                            ),
                          )
                        : Icon(
                            Icons.person,
                            size: 72,
                            color: _selectedAvatar != null
                                ? Colors.white
                                : AppColors.textMutedLight,
                          ),
                  ),
                  // Tombol kamera
                  Positioned(
                    bottom: 4,
                    right: 4,
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _primaryBlue,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: const Icon(
                        Icons.camera_alt,
                        color: Colors.white,
                        size: 18,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 36),

            // ── Pilih avatar ─────────────────────────────────────
            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Atau pilih avatar:',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: _textMuted,
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(_avatarColors.length, (i) {
                final isSelected = _selectedAvatar == i && _imageFile == null;
                return GestureDetector(
                  onTap: () => setState(() {
                    _selectedAvatar = i;
                    _imageFile = null;
                  }),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _avatarColors[i],
                      border: Border.all(
                        color: isSelected ? _textDark : Colors.transparent,
                        width: 3,
                      ),
                    ),
                    child: isSelected
                        ? const Icon(Icons.check, color: Colors.white, size: 24)
                        : const Icon(Icons.person, color: Colors.white, size: 26),
                  ),
                );
              }),
            ),

            const SizedBox(height: 32),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(24, 8, 24, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!_hasSelection)
              const Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Text(
                  'Pilih foto atau avatar terlebih dahulu',
                  style: TextStyle(fontSize: 12, color: AppColors.error),
                  textAlign: TextAlign.center,
                ),
              ),
            _PrimaryButton(
              label: 'Simpan',
              enabled: _hasSelection,
              onTap: _hasSelection ? _handleSave : null,
            ),
          ],
        ),
      ),
    );
  }

  void _handleSave() {
    // Langkah terakhir register: buat PIN wallet, lalu masuk ke Home.
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CreatePinScreen(
          fullPhone: widget.fullPhone,
          fullName: widget.fullName,
        ),
      ),
    );
  }
}

class CreatePinScreen extends StatefulWidget {
  const CreatePinScreen({
    super.key,
    required this.fullPhone,
    required this.fullName,
  });

  final String fullPhone;
  final String fullName;

  @override
  State<CreatePinScreen> createState() => _CreatePinScreenState();
}

class _CreatePinScreenState extends State<CreatePinScreen> {
  static const _pinLength = 6;

  String _input = '';
  String? _firstPin; // PIN tahap pertama, menunggu konfirmasi
  String? _error;
  bool _isSubmitting = false;

  bool get _isConfirmStep => _firstPin != null;

  void _onDigit(String d) {
    if (_isSubmitting || _input.length >= _pinLength) return;
    setState(() {
      _input += d;
      _error = null;
    });
    if (_input.length == _pinLength) _onComplete();
  }

  void _onBackspace() {
    if (_input.isEmpty) return;
    setState(() {
      _input = _input.substring(0, _input.length - 1);
      _error = null;
    });
  }

  Future<void> _onComplete() async {
    // Beri jeda kecil agar titik terakhir sempat terlihat.
    await Future<void>.delayed(const Duration(milliseconds: 120));
    if (!mounted) return;

    if (!_isConfirmStep) {
      setState(() {
        _firstPin = _input;
        _input = '';
      });
      return;
    }

    if (_input != _firstPin) {
      setState(() {
        _error = 'PIN tidak cocok. Ulangi dari awal.';
        _firstPin = null;
        _input = '';
      });
      return;
    }

    await _finish(_input);
  }

  Future<void> _finish(String pin) async {
    setState(() => _isSubmitting = true);
    try {
      context.read<WalletController>().setPin(pin);
      await context.read<AuthController>().signInPreview(
        phone: widget.fullPhone,
        name: widget.fullName,
      );
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
        (route) => false,
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _error = 'Gagal menyimpan PIN. Coba lagi.';
        _firstPin = null;
        _input = '';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bgColor,
      appBar: AppBar(
        backgroundColor: _bgColor,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back, color: _textDark),
        ),
        titleSpacing: 0,
        title: Text(
          'PIN Wallet',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: _textDark,
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            children: [
              const SizedBox(height: 12),
              Container(
                width: 64,
                height: 64,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.tintBlue,
                ),
                child: const Icon(
                  Icons.lock_outline,
                  color: _primaryBlue,
                  size: 30,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                _isConfirmStep ? 'Konfirmasi PIN' : 'Buat PIN Wallet',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: _textDark,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                _isConfirmStep
                    ? 'Masukkan ulang 6 digit PIN untuk konfirmasi.'
                    : 'Buat 6 digit PIN untuk mengamankan pembayaran wallet.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 14,
                  color: _textMuted,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 32),
              PinDots(
                length: _pinLength,
                filled: _input.length,
                error: _error != null,
              ),
              const SizedBox(height: 14),
              SizedBox(
                height: 20,
                child: _error != null
                    ? Text(
                        _error!,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.error,
                          fontWeight: FontWeight.w500,
                        ),
                      )
                    : null,
              ),
              const Spacer(),
              if (_isSubmitting)
                const Padding(
                  padding: EdgeInsets.only(bottom: 24),
                  child: CircularProgressIndicator(),
                )
              else
                PinKeypad(onDigit: _onDigit, onBackspace: _onBackspace),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _LabeledInput extends StatelessWidget {
  const _LabeledInput({
    required this.label,
    required this.hint,
    required this.controller,
    this.focusNode,
    this.keyboardType,
    this.readOnly = false,
    this.suffixIcon,
    this.onTap,
    this.isError = false,
  });

  final String label;
  final String hint;
  final TextEditingController controller;
  final FocusNode? focusNode;
  final TextInputType? keyboardType;
  final bool readOnly;
  final IconData? suffixIcon;
  final VoidCallback? onTap;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final borderColor = isError ? AppColors.error : _borderColor;
    final focusColor = isError ? AppColors.error : _primaryBlue;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: isError ? AppColors.error : _textDark,
            fontWeight: FontWeight.w600,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          focusNode: focusNode,
          keyboardType: keyboardType,
          readOnly: readOnly,
          onTap: onTap,
          decoration: InputDecoration(
            hintText: hint,
            suffixIcon: suffixIcon == null
                ? null
                : Icon(
                    suffixIcon,
                    color: isError ? AppColors.error : _textMuted,
                    size: 20,
                  ),
            filled: true,
            fillColor: isError
                ? AppColors.errorBg.withValues(alpha: 0.4)
                : _bgColor,
            hintStyle: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(color: _textMuted, fontSize: 15),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 14,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(_inputRadius),
              borderSide: BorderSide(
                color: borderColor,
                width: isError ? 1.5 : 1,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(_inputRadius),
              borderSide: BorderSide(color: focusColor, width: 1.5),
            ),
          ),
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(color: _textDark, fontSize: 16),
        ),
      ],
    );
  }
}

class _GenderDropdown extends StatelessWidget {
  const _GenderDropdown({
    required this.value,
    required this.onChanged,
    this.isError = false,
  });

  final String? value;
  final ValueChanged<String?> onChanged;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final borderColor = isError ? AppColors.error : _borderColor;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Jenis Kelamin',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: isError ? AppColors.error : _textDark,
            fontWeight: FontWeight.w600,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: value,
          decoration: InputDecoration(
            hintText: 'Pilih jenis kelamin',
            filled: true,
            fillColor: isError
                ? AppColors.errorBg.withValues(alpha: 0.4)
                : _bgColor,
            hintStyle: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(color: _textMuted, fontSize: 15),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 14,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(_inputRadius),
              borderSide: BorderSide(
                color: borderColor,
                width: isError ? 1.5 : 1,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(_inputRadius),
              borderSide: BorderSide(
                color: isError ? AppColors.error : _primaryBlue,
                width: 1.5,
              ),
            ),
          ),
          dropdownColor: Colors.white,
          style: Theme.of(context)
              .textTheme
              .titleMedium
              ?.copyWith(color: _textDark, fontSize: 16),
          icon: Icon(
            Icons.keyboard_arrow_down_rounded,
            color: isError ? AppColors.error : _textMuted,
          ),
          items: const [
            DropdownMenuItem(value: 'Laki-laki', child: Text('Laki-laki')),
            DropdownMenuItem(value: 'Perempuan', child: Text('Perempuan')),
          ],
          onChanged: onChanged,
        ),
      ],
    );
  }
}

// ── Country Picker Bottom Sheet ──────────────────────────────────────────────

class _CountryPickerSheet extends StatefulWidget {
  const _CountryPickerSheet({required this.selected});
  final _Country selected;

  @override
  State<_CountryPickerSheet> createState() => _CountryPickerSheetState();
}

class _CountryPickerSheetState extends State<_CountryPickerSheet> {
  final _searchCtrl = TextEditingController();
  List<_Country> _filtered = _countries;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  void _onSearch(String q) {
    final query = q.toLowerCase();
    setState(() {
      _filtered = _countries
          .where((c) =>
              c.name.toLowerCase().contains(query) ||
              c.dialCode.contains(query) ||
              c.code.toLowerCase().contains(query))
          .toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollCtrl) => Column(
        children: [
          // Drag handle
          Container(
            margin: const EdgeInsets.symmetric(vertical: 10),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.borderLight,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Judul + tutup
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            child: Row(
              children: [
                const Text(
                  'Pilih Negara',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: _textDark,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: const Icon(Icons.close, color: _textMuted),
                ),
              ],
            ),
          ),

          // Search bar
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: TextField(
              controller: _searchCtrl,
              onChanged: _onSearch,
              decoration: InputDecoration(
                hintText: 'Cari negara atau kode...',
                hintStyle: const TextStyle(color: _textMuted, fontSize: 14),
                prefixIcon: const Icon(Icons.search, color: _textMuted, size: 20),
                filled: true,
                fillColor: AppColors.background,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),

          // Divider
          const Divider(height: 1),

          // Daftar negara
          Expanded(
            child: _filtered.isEmpty
                ? const Center(
                    child: Text(
                      'Negara tidak ditemukan',
                      style: TextStyle(color: _textMuted),
                    ),
                  )
                : ListView.builder(
                    controller: scrollCtrl,
                    itemCount: _filtered.length,
                    itemBuilder: (_, i) {
                      final country = _filtered[i];
                      final isSelected = country.code == widget.selected.code;

                      return InkWell(
                        onTap: () => Navigator.pop(context, country),
                        child: Container(
                          color: isSelected
                              ? AppColors.tintBlueAlt
                              : Colors.transparent,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 14,
                          ),
                          child: Row(
                            children: [
                              Text(
                                country.flag,
                                style: const TextStyle(fontSize: 26),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Text(
                                  country.name,
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: isSelected
                                        ? FontWeight.w600
                                        : FontWeight.w400,
                                    color: isSelected
                                        ? _primaryBlue
                                        : _textDark,
                                  ),
                                ),
                              ),
                              Text(
                                country.dialCode,
                                style: TextStyle(
                                  fontSize: 14,
                                  color: isSelected
                                      ? _primaryBlue
                                      : _textMuted,
                                  fontWeight: isSelected
                                      ? FontWeight.w600
                                      : FontWeight.w400,
                                ),
                              ),
                              if (isSelected) ...[
                                const SizedBox(width: 8),
                                const Icon(
                                  Icons.check_circle,
                                  color: _primaryBlue,
                                  size: 18,
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    required this.label,
    required this.enabled,
    this.onTap,
  });

  final String label;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: enabled ? _primaryBlue : _disabledButton,
          borderRadius: BorderRadius.circular(9),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(9),
            onTap: enabled ? onTap : null,
            child: Center(
              child: Text(
                label,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 16,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

