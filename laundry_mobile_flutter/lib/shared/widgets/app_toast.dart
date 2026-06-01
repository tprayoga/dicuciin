import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// Toast/snackbar terpusat dengan gaya konsisten (mengambang, ikon berwarna).
///
/// Dikelola oleh ScaffoldMessenger root MaterialApp sehingga tetap tampil
/// walau terjadi perpindahan halaman (mis. setelah login/registrasi).
class AppToast {
  AppToast._();

  static void success(BuildContext context, String message) => _show(
        context,
        message,
        icon: Icons.check_circle_rounded,
        color: AppColors.success,
      );

  static void error(BuildContext context, String message) => _show(
        context,
        message,
        icon: Icons.error_rounded,
        color: AppColors.error,
      );

  static void info(BuildContext context, String message) => _show(
        context,
        message,
        icon: Icons.info_rounded,
        color: AppColors.primary,
      );

  static void _show(
    BuildContext context,
    String message, {
    required IconData icon,
    required Color color,
  }) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.clearSnackBars();
    messenger.showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: Colors.white,
        elevation: 10,
        duration: const Duration(seconds: 3),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 18),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: color.withValues(alpha: 0.25)),
        ),
        content: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: AppColors.textStrong,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
