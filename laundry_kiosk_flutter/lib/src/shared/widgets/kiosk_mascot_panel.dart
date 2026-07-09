import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// Warna brand Di.Cuciin (selaras dengan konstanta di kiosk_app.dart).
// Kiosk belum punya kelas token terpusat; nilai disamakan agar konsisten.
const _kPrimary = Color(0xFF0360DA);
const _kTextDark = Color(0xFF272526);
const _kTextMuted = Color(0xFF667A9E);
const _kTextMutedLight = Color(0xFF90A1BE);
const _kTintBlue = Color(0xFFE7EEF8);

/// Panel maskot untuk layar kiosk (landscape, layar besar).
///
/// Aturan kiosk:
/// - Idle screen boleh memakai maskot besar ([large] = true).
/// - Untuk payment/error gunakan ukuran sedang ([large] = false).
/// - Maskot tidak menutupi tombol utama; CTA tetap jelas di bawah.
/// - Aman untuk layout landscape (konten membungkus & terbatas lebarnya).
class KioskMascotPanel extends StatelessWidget {
  const KioskMascotPanel({
    super.key,
    required this.mascotAsset,
    required this.title,
    required this.message,
    this.primaryButtonText,
    this.onPrimaryPressed,
    this.large = false,
    this.showCard = true,
  });

  final String mascotAsset;
  final String title;
  final String message;
  final String? primaryButtonText;
  final VoidCallback? onPrimaryPressed;

  /// Maskot besar (untuk idle/welcome). Default sedang.
  final bool large;

  /// Bila true, dibungkus kartu dengan latar lembut & sudut membulat.
  final bool showCard;

  @override
  Widget build(BuildContext context) {
    final imageSize = large ? 260.0 : 160.0;

    final content = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Image.asset(
          mascotAsset,
          width: imageSize,
          height: imageSize,
          fit: BoxFit.contain,
          errorBuilder: (context, error, stack) => Icon(
            Icons.image_not_supported_outlined,
            size: imageSize * 0.5,
            color: _kTextMutedLight,
          ),
        ),
        SizedBox(height: large ? 24 : 16),
        Text(
          title,
          textAlign: TextAlign.center,
          style: GoogleFonts.poppins(
            fontSize: large ? 30 : 22,
            fontWeight: FontWeight.w700,
            color: _kTextDark,
          ),
        ),
        const SizedBox(height: 8),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: GoogleFonts.poppins(
              fontSize: large ? 18 : 15,
              fontWeight: FontWeight.w500,
              color: _kTextMuted,
            ),
          ),
        ),
        if (primaryButtonText != null) ...[
          SizedBox(height: large ? 28 : 20),
          SizedBox(
            height: 56,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: _kPrimary,
                padding: const EdgeInsets.symmetric(horizontal: 40),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: onPrimaryPressed,
              child: Text(
                primaryButtonText!,
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ],
    );

    if (!showCard) {
      return Center(child: content);
    }

    return Center(
      child: Container(
        padding: EdgeInsets.all(large ? 40 : 28),
        decoration: BoxDecoration(
          color: _kTintBlue.withValues(alpha: 0.45),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: _kPrimary.withValues(alpha: 0.12)),
        ),
        child: content,
      ),
    );
  }
}
