import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_text_styles.dart';
import 'app_buttons.dart';

/// Varian visual kartu maskot. Menentukan warna aksen latar/judul, bukan logika.
enum MascotMessageVariant {
  info,
  success,
  warning,
  error,
  empty,
  promo,
  wallet,
  voucher,
  loyalty,
  payment,
  machine,
}

/// Kartu pesan dengan maskot Di.Cuciin sebagai *helper* visual.
///
/// Aturan desain:
/// - Maskot hanya pelengkap; informasi & CTA tetap dominan.
/// - Warna mengikuti [AppColors] (tidak ada hardcode hex baru).
/// - Gambar punya `errorBuilder` agar tidak crash bila aset hilang.
/// - Aman di layar kecil: teks bisa membungkus, gambar berukuran terbatas.
class MascotMessageCard extends StatelessWidget {
  const MascotMessageCard({
    super.key,
    required this.mascotAsset,
    required this.title,
    required this.message,
    this.primaryButtonText,
    this.onPrimaryPressed,
    this.secondaryButtonText,
    this.onSecondaryPressed,
    this.variant = MascotMessageVariant.info,
    this.compact = false,
    this.fullWidth = true,
  });

  final String mascotAsset;
  final String title;
  final String message;
  final String? primaryButtonText;
  final VoidCallback? onPrimaryPressed;
  final String? secondaryButtonText;
  final VoidCallback? onSecondaryPressed;
  final MascotMessageVariant variant;

  /// Tampilan ringkas (gambar lebih kecil, padding lebih rapat) untuk inline.
  final bool compact;

  /// Bila false, kartu menyesuaikan lebar konten (mis. di tengah halaman).
  final bool fullWidth;

  _VariantStyle get _style {
    switch (variant) {
      case MascotMessageVariant.success:
        return _VariantStyle(AppColors.success, AppColors.successBg);
      case MascotMessageVariant.warning:
        return _VariantStyle(AppColors.warning, AppColors.warningBg);
      case MascotMessageVariant.error:
        return _VariantStyle(AppColors.error, AppColors.errorBg);
      case MascotMessageVariant.promo:
      case MascotMessageVariant.voucher:
        return _VariantStyle(AppColors.brandOrange, const Color(0xFFFFF1E6));
      case MascotMessageVariant.wallet:
      case MascotMessageVariant.payment:
        return _VariantStyle(AppColors.primary, AppColors.tintBlueAlt);
      case MascotMessageVariant.loyalty:
        return _VariantStyle(AppColors.primaryAccent, const Color(0xFFFFF1E6));
      case MascotMessageVariant.machine:
        return _VariantStyle(AppColors.primaryDark, AppColors.tintBlue);
      case MascotMessageVariant.empty:
        return _VariantStyle(AppColors.textMuted, AppColors.surfaceAlt);
      case MascotMessageVariant.info:
        return _VariantStyle(AppColors.primary, AppColors.tintBlue);
    }
  }

  @override
  Widget build(BuildContext context) {
    final style = _style;
    final imageSize = compact ? 64.0 : 104.0;
    final pad = compact ? AppSpacing.md : AppSpacing.xl;

    final card = Container(
      width: fullWidth ? double.infinity : null,
      padding: EdgeInsets.all(pad),
      decoration: BoxDecoration(
        color: style.background,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: style.accent.withValues(alpha: 0.18)),
      ),
      child: compact ? _buildCompact(style, imageSize) : _buildStacked(style, imageSize),
    );

    return card;
  }

  Widget _buildStacked(_VariantStyle style, double imageSize) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _mascot(imageSize),
        const SizedBox(height: AppSpacing.md),
        Text(title, textAlign: TextAlign.center, style: AppTextStyles.titleMedium),
        const SizedBox(height: AppSpacing.xs),
        Text(
          message,
          textAlign: TextAlign.center,
          style: AppTextStyles.bodySmall,
        ),
        if (_hasActions) ...[
          const SizedBox(height: AppSpacing.lg),
          _actions(),
        ],
      ],
    );
  }

  Widget _buildCompact(_VariantStyle style, double imageSize) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _mascot(imageSize),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: AppTextStyles.titleSmall),
              const SizedBox(height: 2),
              Text(message, style: AppTextStyles.bodySmall),
              if (_hasActions) ...[
                const SizedBox(height: AppSpacing.sm),
                _actions(),
              ],
            ],
          ),
        ),
      ],
    );
  }

  bool get _hasActions =>
      (primaryButtonText != null) || (secondaryButtonText != null);

  Widget _actions() {
    final children = <Widget>[];
    if (primaryButtonText != null) {
      children.add(AppPrimaryButton(
        label: primaryButtonText!,
        onTap: onPrimaryPressed,
      ));
    }
    if (secondaryButtonText != null) {
      if (children.isNotEmpty) {
        children.add(const SizedBox(height: AppSpacing.sm));
      }
      children.add(AppOutlineButton(
        label: secondaryButtonText!,
        onTap: onSecondaryPressed,
      ));
    }
    return Column(mainAxisSize: MainAxisSize.min, children: children);
  }

  Widget _mascot(double size) {
    return Image.asset(
      mascotAsset,
      width: size,
      height: size,
      fit: BoxFit.contain,
      errorBuilder: (context, error, stack) => Icon(
        Icons.image_not_supported_outlined,
        size: size * 0.6,
        color: AppColors.textMutedLight,
      ),
    );
  }
}

class _VariantStyle {
  const _VariantStyle(this.accent, this.background);
  final Color accent;
  final Color background;
}
