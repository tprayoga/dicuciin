import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../shared/widgets/app_buttons.dart';
import '../../shared/widgets/app_toast.dart';
import 'auth_controller.dart';

/// Alur lupa password: nomor HP → OTP (WhatsApp) → password baru.
/// Memakai purpose RESET_PASSWORD pada endpoint OTP.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

enum _Step { phone, otp, newPassword }

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  _Step _step = _Step.phone;
  bool _busy = false;

  final _phoneController = TextEditingController();
  final _otpController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();

  String _phone = '';
  String _verificationToken = '';
  bool _obscure = true;

  @override
  void dispose() {
    _phoneController.dispose();
    _otpController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  /// Normalisasi ke format internasional digit-only (Indonesia +62).
  String _normalize(String raw) {
    var local = raw.replaceAll(RegExp(r'[^0-9]'), '');
    if (local.startsWith('0')) local = local.substring(1);
    if (local.startsWith('62')) return local;
    return '62$local';
  }

  Future<void> _sendOtp() async {
    FocusScope.of(context).unfocus();
    final phone = _normalize(_phoneController.text);
    if (phone.length < 9) {
      AppToast.error(context, 'Nomor HP tidak valid.');
      return;
    }
    setState(() => _busy = true);
    try {
      await context
          .read<AuthController>()
          .requestOtp(phone: phone, purpose: 'RESET_PASSWORD');
      if (!mounted) return;
      setState(() {
        _phone = phone;
        _step = _Step.otp;
      });
      AppToast.success(context, 'Kode OTP dikirim via WhatsApp.');
    } on ApiException catch (e) {
      if (mounted) AppToast.error(context, e.message);
    } catch (_) {
      if (mounted) AppToast.error(context, 'Gagal mengirim OTP. Coba lagi.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verifyOtp() async {
    FocusScope.of(context).unfocus();
    final code = _otpController.text.trim();
    if (code.length != 4) {
      AppToast.error(context, 'Masukkan 4 digit kode OTP.');
      return;
    }
    setState(() => _busy = true);
    try {
      final token = await context.read<AuthController>().verifyOtp(
            phone: _phone,
            code: code,
            purpose: 'RESET_PASSWORD',
          );
      if (!mounted) return;
      setState(() {
        _verificationToken = token;
        _step = _Step.newPassword;
      });
    } on ApiException catch (e) {
      if (mounted) AppToast.error(context, e.message);
    } catch (_) {
      if (mounted) AppToast.error(context, 'Verifikasi gagal. Coba lagi.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitNewPassword() async {
    FocusScope.of(context).unfocus();
    final pass = _passwordController.text;
    final confirm = _confirmController.text;
    if (pass.length < 8) {
      AppToast.error(context, 'Password minimal 8 karakter.');
      return;
    }
    if (pass != confirm) {
      AppToast.error(context, 'Konfirmasi password tidak cocok.');
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AuthController>().resetPassword(
            phone: _phone,
            newPassword: pass,
            verificationToken: _verificationToken,
          );
      if (!mounted) return;
      AppToast.success(context, 'Password berhasil direset. Silakan masuk.');
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) AppToast.error(context, e.message);
    } catch (_) {
      if (mounted) AppToast.error(context, 'Gagal reset password. Coba lagi.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: AppColors.textDark,
        title: const Text('Lupa Password'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
          child: switch (_step) {
            _Step.phone => _phoneStep(),
            _Step.otp => _otpStep(),
            _Step.newPassword => _passwordStep(),
          },
        ),
      ),
    );
  }

  Widget _heading(String title, String subtitle) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textDark)),
          const SizedBox(height: 6),
          Text(subtitle,
              style: const TextStyle(fontSize: 14, color: AppColors.textMuted)),
          const SizedBox(height: 24),
        ],
      );

  Widget _field({
    required TextEditingController controller,
    required String label,
    String? hint,
    TextInputType? keyboardType,
    List<TextInputFormatter>? formatters,
    bool obscure = false,
    Widget? suffix,
  }) =>
      TextField(
        controller: controller,
        keyboardType: keyboardType,
        inputFormatters: formatters,
        obscureText: obscure,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          suffixIcon: suffix,
          border:
              OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );

  Widget _action(String label, VoidCallback onTap) => _busy
      ? const AppDisabledButton(label: 'Mohon tunggu…')
      : AppPrimaryButton(label: label, onTap: onTap);

  Widget _phoneStep() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('Masukkan nomor HP',
              'Kami akan kirim kode OTP ke WhatsApp nomor terdaftar Anda.'),
          _field(
            controller: _phoneController,
            label: 'Nomor HP',
            hint: '08xxxxxxxxxx',
            keyboardType: TextInputType.phone,
            formatters: [FilteringTextInputFormatter.digitsOnly],
          ),
          const SizedBox(height: 24),
          _action('Kirim OTP', _sendOtp),
        ],
      );

  Widget _otpStep() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('Verifikasi OTP',
              'Masukkan 4 digit kode yang dikirim ke WhatsApp $_phone.'),
          _field(
            controller: _otpController,
            label: 'Kode OTP',
            hint: '1234',
            keyboardType: TextInputType.number,
            formatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(4),
            ],
          ),
          const SizedBox(height: 24),
          _action('Verifikasi', _verifyOtp),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _busy ? null : _sendOtp,
            child: const Text('Kirim ulang kode'),
          ),
        ],
      );

  Widget _passwordStep() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _heading('Buat password baru', 'Minimal 8 karakter.'),
          _field(
            controller: _passwordController,
            label: 'Password baru',
            obscure: _obscure,
            suffix: IconButton(
              icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
          ),
          const SizedBox(height: 16),
          _field(
            controller: _confirmController,
            label: 'Konfirmasi password',
            obscure: _obscure,
          ),
          const SizedBox(height: 24),
          _action('Simpan password', _submitNewPassword),
        ],
      );
}
