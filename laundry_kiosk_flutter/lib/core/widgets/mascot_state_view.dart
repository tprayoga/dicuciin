import 'package:flutter/material.dart';

import '../../src/core/assets/kiosk_mascot_assets.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../theme/app_text_styles.dart';

/// State visual yang punya maskot pendamping.
///
/// Hanya mencakup state yang aset maskotnya benar-benar tersedia. `loading`
/// TIDAK punya maskot khusus → memakai [CircularProgressIndicator] berwarna
/// primary (lihat aturan di [MascotStateView]).
enum MascotState { success, error, empty, loading, noConnection }

/// Pemetaan state → path aset maskot yang SUDAH diverifikasi ada di disk.
/// `null` berarti tidak ada maskot untuk state tersebut (loading).
const Map<MascotState, String?> _mascotForState = {
  MascotState.success: KioskMascotAssets.paymentSuccessBasketConfetti,
  MascotState.error: KioskMascotAssets.confused,
  MascotState.empty: KioskMascotAssets.emptyPageSweeping,
  MascotState.noConnection: KioskMascotAssets.errorNoInternet,
  MascotState.loading: null,
};

/// Ikon fallback bila aset gagal dimuat (bukan path yang direka).
const Map<MascotState, IconData> _fallbackIcon = {
  MascotState.success: Icons.check_circle_rounded,
  MascotState.error: Icons.error_outline_rounded,
  MascotState.empty: Icons.inbox_outlined,
  MascotState.noConnection: Icons.wifi_off_rounded,
  MascotState.loading: Icons.hourglass_empty_rounded,
};

/// Tampilan state penuh dengan maskot Di.Cuciin, judul, pesan, dan aksi opsional.
///
/// Layout: maskot (tinggi responsif, maksimum ~200) → judul (titleLarge) →
/// pesan (bodyMedium, textSecondary, tengah) → tombol aksi opsional.
/// Terpusat vertikal, padding horizontal [AppSpacing.xl].
class MascotStateView extends StatelessWidget {
  const MascotStateView({
    super.key,
    required this.state,
    this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    this.customMascot,
  });

  final MascotState state;
  final String? title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;

  /// Widget maskot khusus (mengganti aset default state).
  final Widget? customMascot;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.xl,
          vertical: AppSpacing.xxl,
        ),
        child: LayoutBuilder(
          builder: (context, _) {
            // Ukuran maskot responsif terhadap tinggi layar (clamp 120..200).
            final screenH = MediaQuery.sizeOf(context).height;
            final mascotSize = (screenH * 0.24).clamp(120.0, 200.0);

            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                _MascotVisual(
                  state: state,
                  size: mascotSize,
                  customMascot: customMascot,
                ),
                if (title != null) ...[
                  const SizedBox(height: AppSpacing.xl),
                  Text(
                    title!,
                    textAlign: TextAlign.center,
                    style: AppTextStyles.titleLarge,
                  ),
                ],
                if (message != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Text(
                      message!,
                      textAlign: TextAlign.center,
                      style: AppTextStyles.bodyMedium,
                    ),
                  ),
                ],
                if (actionLabel != null && onAction != null) ...[
                  const SizedBox(height: AppSpacing.xxl),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 320),
                    child: SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: onAction,
                        child: Text(actionLabel!),
                      ),
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Bagian visual: maskot (dengan animasi bob halus untuk loading yang bermaskot),
/// atau spinner primary bila loading tanpa maskot.
class _MascotVisual extends StatefulWidget {
  const _MascotVisual({
    required this.state,
    required this.size,
    this.customMascot,
  });

  final MascotState state;
  final double size;
  final Widget? customMascot;

  @override
  State<_MascotVisual> createState() => _MascotVisualState();
}

class _MascotVisualState extends State<_MascotVisual>
    with SingleTickerProviderStateMixin {
  late final AnimationController _bob = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _bob.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final asset = _mascotForState[widget.state];

    // Loading tanpa maskot → spinner primary.
    if (widget.customMascot == null &&
        widget.state == MascotState.loading &&
        asset == null) {
      return SizedBox(
        height: widget.size,
        child: const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
      );
    }

    final Widget mascot =
        widget.customMascot ??
        Image.asset(
          asset!,
          height: widget.size,
          fit: BoxFit.contain,
          errorBuilder: (context, error, stack) =>
              _iconPlaceholder(widget.state, widget.size),
        );

    // Animasi bob halus hanya untuk loading yang punya maskot.
    if (widget.state == MascotState.loading) {
      return AnimatedBuilder(
        animation: _bob,
        builder: (context, child) => Transform.translate(
          offset: Offset(0, -6 * _bob.value),
          child: child,
        ),
        child: mascot,
      );
    }
    return mascot;
  }

  /// Placeholder ikon dalam lingkaran primaryLight bila aset gagal dimuat.
  static Widget _iconPlaceholder(MascotState state, double size) {
    final d = size * 0.7;
    return Container(
      width: d,
      height: d,
      decoration: const BoxDecoration(
        color: AppColors.primaryLight,
        shape: BoxShape.circle,
      ),
      child: Icon(
        _fallbackIcon[state] ?? Icons.image_not_supported_outlined,
        size: d * 0.5,
        color: AppColors.primaryDark,
      ),
    );
  }
}
