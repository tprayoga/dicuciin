import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../shared/widgets/app_toast.dart';
import 'auth_controller.dart';

/// Ganti kata sandi dari menu Akun (Batch 5). Server mewajibkan kata sandi
/// lama dan mengeluarkan perangkat lain; sesi di HP ini tetap aktif.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _submitting = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  InputDecoration _decoration(String label) => InputDecoration(
        labelText: label,
        suffixIcon: IconButton(
          icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
          onPressed: () => setState(() => _obscure = !_obscure),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ubah Kata Sandi')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _current,
                  obscureText: _obscure,
                  decoration: _decoration('Kata sandi saat ini'),
                  validator: (v) =>
                      (v == null || v.isEmpty) ? 'Masukkan kata sandi saat ini' : null,
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _next,
                  obscureText: _obscure,
                  decoration: _decoration('Kata sandi baru'),
                  validator: (v) {
                    if (v == null || v.length < 8) return 'Minimal 8 karakter';
                    if (v == _current.text) {
                      return 'Harus berbeda dari kata sandi saat ini';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _confirm,
                  obscureText: _obscure,
                  decoration: _decoration('Ulangi kata sandi baru'),
                  validator: (v) =>
                      v != _next.text ? 'Kata sandi tidak sama' : null,
                ),
                const SizedBox(height: AppSpacing.sm),
                const Text(
                  'Setelah diubah, perangkat lain yang masuk dengan akun ini akan dikeluarkan.',
                  style: TextStyle(fontSize: 12, color: AppColors.textMutedLight),
                ),
                if (_error != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  Text(_error!, style: const TextStyle(color: AppColors.error)),
                ],
                const SizedBox(height: AppSpacing.lg),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
                    child: _submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Simpan Kata Sandi'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_submitting || !_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await context.read<AuthController>().changePassword(
            currentPassword: _current.text,
            newPassword: _next.text,
          );
      if (!mounted) return;
      AppToast.success(context, 'Kata sandi berhasil diubah.');
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Gagal mengubah kata sandi. Coba lagi.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
