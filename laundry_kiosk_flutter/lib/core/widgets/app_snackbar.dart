import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';
import '../theme/app_text_styles.dart';

/// Helper snackbar dengan warna semantik + ikon kecil.
///
/// Pakai [showSuccessSnackbar] / [showErrorSnackbar]. Keduanya visual-only,
/// tidak menyentuh logika apa pun.
void showSuccessSnackbar(BuildContext context, String message) {
  _show(
    context,
    message: message,
    icon: Icons.check_circle_rounded,
    bg: AppColors.successDark,
  );
}

void showErrorSnackbar(BuildContext context, String message) {
  _show(
    context,
    message: message,
    icon: Icons.error_rounded,
    bg: AppColors.errorDark,
  );
}

void _show(
  BuildContext context, {
  required String message,
  required IconData icon,
  required Color bg,
}) {
  final messenger = ScaffoldMessenger.of(context);
  messenger
    ..clearSnackBars()
    ..showSnackBar(
      SnackBar(
        backgroundColor: bg,
        behavior: SnackBarBehavior.floating,
        shape: const RoundedRectangleBorder(borderRadius: AppRadius.radiusMd),
        content: Row(
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(
                message,
                style: AppTextStyles.bodyMedium.copyWith(color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
}
