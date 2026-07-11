import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';
import 'app_spacing.dart';
import 'app_text_styles.dart';

/// Tema aplikasi terpusat. Dipakai di `MaterialApp(theme: AppTheme.light)`.
class AppTheme {
  AppTheme._();

  static ThemeData get light {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      primary: AppColors.primary,
      error: AppColors.error,
      surface: AppColors.surface,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: AppColors.background,
      textTheme: GoogleFonts.poppinsTextTheme().apply(
        bodyColor: AppColors.textDark,
        displayColor: AppColors.textDark,
      ),
      // AppBar default: brand oranye, teks/ikon putih, tanpa elevation, judul
      // di tengah (parity dengan kiosk). Screen auth yang memakai AppBar terang
      // menyetel backgroundColor sendiri sehingga tidak terpengaruh.
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        titleTextStyle: AppTextStyles.titleLarge.copyWith(
          color: AppColors.onPrimary,
        ),
        iconTheme: const IconThemeData(color: AppColors.onPrimary),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceAlt,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppRadius.md),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
      ),
      dividerColor: AppColors.borderLight,
    );
  }
}

/// Jarak default umum agar tidak menulis angka literal di banyak tempat.
class AppGaps {
  AppGaps._();

  static const SizedBox xs = SizedBox(height: AppSpacing.xs, width: AppSpacing.xs);
  static const SizedBox sm = SizedBox(height: AppSpacing.sm, width: AppSpacing.sm);
  static const SizedBox md = SizedBox(height: AppSpacing.md, width: AppSpacing.md);
  static const SizedBox lg = SizedBox(height: AppSpacing.lg, width: AppSpacing.lg);
}
