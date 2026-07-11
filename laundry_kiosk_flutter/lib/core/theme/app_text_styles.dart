import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

/// Skala tipografi tunggal Di.Cuciin (Kiosk), berbasis Poppins.
///
/// Default warna: [AppColors.textPrimary] untuk judul/isi, [textSecondary]
/// untuk teks pendukung. Pakai `.copyWith(color: ...)` bila perlu override.
class AppTextStyles {
  AppTextStyles._();

  /// 24 / w700 — judul layar besar.
  static final TextStyle displayLarge = GoogleFonts.poppins(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
    height: 1.2,
  );

  /// 18 / w600 — judul section / header.
  static final TextStyle titleLarge = GoogleFonts.poppins(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
  );

  /// 16 / w600 — subjudul / label kartu.
  static final TextStyle titleMedium = GoogleFonts.poppins(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
  );

  /// 16 / w400 — isi utama.
  static final TextStyle bodyLarge = GoogleFonts.poppins(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    color: AppColors.textPrimary,
    height: 1.4,
  );

  /// 14 / w400 — isi sekunder.
  static final TextStyle bodyMedium = GoogleFonts.poppins(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: AppColors.textSecondary,
    height: 1.4,
  );

  /// 12 / w500 — label kecil / caption.
  static final TextStyle labelSmall = GoogleFonts.poppins(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: AppColors.textSecondary,
  );

  /// Rakit [TextTheme] Material dari skala di atas.
  static TextTheme get textTheme => TextTheme(
    displayLarge: displayLarge,
    displayMedium: displayLarge,
    displaySmall: titleLarge,
    headlineLarge: displayLarge,
    headlineMedium: titleLarge,
    headlineSmall: titleLarge,
    titleLarge: titleLarge,
    titleMedium: titleMedium,
    titleSmall: titleMedium,
    bodyLarge: bodyLarge,
    bodyMedium: bodyMedium,
    bodySmall: labelSmall,
    labelLarge: titleMedium,
    labelMedium: labelSmall,
    labelSmall: labelSmall,
  );
}
