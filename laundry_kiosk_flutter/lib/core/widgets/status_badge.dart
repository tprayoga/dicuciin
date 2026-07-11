import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_radius.dart';
import '../theme/app_spacing.dart';
import '../theme/app_text_styles.dart';

/// Jenis status badge → menentukan pasangan warna (latar / teks).
enum StatusBadgeType { info, success, warning, error, brand }

/// Badge status bentuk pill — SATU-SATUNYA cara merender status order/laundry.
///
/// Label 12px, weight 500. Warna mengikuti [StatusBadgeType].
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {required this.type, super.key});

  final String label;
  final StatusBadgeType type;

  ({Color bg, Color fg}) get _colors => switch (type) {
    StatusBadgeType.info => (bg: AppColors.accentLight, fg: AppColors.accentDark),
    StatusBadgeType.success => (
      bg: AppColors.successLight,
      fg: AppColors.successDark,
    ),
    StatusBadgeType.warning => (
      bg: AppColors.warningLight,
      fg: AppColors.warningDark,
    ),
    StatusBadgeType.error => (bg: AppColors.errorLight, fg: AppColors.errorDark),
    StatusBadgeType.brand => (
      bg: AppColors.primaryLight,
      fg: AppColors.primaryDark,
    ),
  };

  @override
  Widget build(BuildContext context) {
    final c = _colors;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: c.bg,
        borderRadius: AppRadius.radiusPill,
      ),
      child: Text(
        label,
        style: AppTextStyles.labelSmall.copyWith(
          color: c.fg,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}
