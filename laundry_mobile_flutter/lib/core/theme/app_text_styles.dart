import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

/// Skala tipografi terpusat berbasis font Poppins.
///
/// Pakai token ini lalu `.copyWith(color: ...)` bila perlu mengganti warna,
/// alih-alih menulis `TextStyle(fontSize: .., fontWeight: ..)` berulang.
class AppTextStyles {
  AppTextStyles._();

  static TextStyle _base(double size, FontWeight weight, Color color) =>
      GoogleFonts.poppins(fontSize: size, fontWeight: weight, color: color);

  // ── Display / Headline ──────────────────────────────────────────
  static TextStyle get display => _base(34, FontWeight.w700, AppColors.textDark);
  static TextStyle get headline => _base(24, FontWeight.w700, AppColors.textDark);

  // ── Title ───────────────────────────────────────────────────────
  static TextStyle get titleLarge => _base(18, FontWeight.w700, AppColors.textDark);
  static TextStyle get titleMedium => _base(16, FontWeight.w600, AppColors.textDark);
  static TextStyle get titleSmall => _base(15, FontWeight.w600, AppColors.textDark);

  // ── Body ────────────────────────────────────────────────────────
  static TextStyle get bodyLarge => _base(16, FontWeight.w500, AppColors.textDark);
  static TextStyle get bodyMedium => _base(14, FontWeight.w500, AppColors.textDark);
  static TextStyle get bodySmall => _base(13, FontWeight.w500, AppColors.textMuted);

  // ── Label / Caption ─────────────────────────────────────────────
  static TextStyle get label => _base(14, FontWeight.w600, AppColors.textDark);
  static TextStyle get caption => _base(12, FontWeight.w500, AppColors.textMuted);
}
