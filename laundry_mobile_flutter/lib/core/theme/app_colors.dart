import 'package:flutter/material.dart';

/// Token warna terpusat untuk seluruh aplikasi.
///
/// Gunakan token ini alih-alih menulis `Color(0xFF...)` langsung di widget,
/// supaya warna konsisten dan mudah diubah dari satu tempat.
class AppColors {
  AppColors._();

  // ── Brand / Primary ─────────────────────────────────────────────
  static const Color primary = Color(0xFF1A73E8);
  static const Color primaryDark = Color(0xFF0B4A93);
  static const Color primaryAccent = Color(0xFF29CC5F);

  // ── Teks ────────────────────────────────────────────────────────
  static const Color textDark = Color(0xFF131722);
  static const Color textStrong = Color(0xFF101828);
  static const Color textMuted = Color(0xFF667A9E);
  static const Color textMutedLight = Color(0xFF90A1BE);

  // ── Permukaan / Background ──────────────────────────────────────
  static const Color background = Color(0xFFF2F5FA);
  static const Color surface = Colors.white;
  static const Color surfaceAlt = Color(0xFFF7F9FC);

  /// Tint biru muda untuk chip, ikon-bg, kartu lembut.
  static const Color tintBlue = Color(0xFFE7EEF8);
  static const Color tintBlueAlt = Color(0xFFEAF3FF);

  // ── Garis / Border ──────────────────────────────────────────────
  static const Color border = Color(0xFFBFCDE0);
  static const Color borderLight = Color(0xFFD6E0EE);

  // ── Status: Sukses ──────────────────────────────────────────────
  static const Color success = Color(0xFF21A84E);
  static const Color successDark = Color(0xFF1FA74F);
  static const Color successBg = Color(0xFFE6F8EB);

  // ── Status: Peringatan ──────────────────────────────────────────
  static const Color warning = Color(0xFFF39800);
  static const Color warningBg = Color(0xFFF5EFE2);

  // ── Status: Error ───────────────────────────────────────────────
  static const Color error = Color(0xFFE1442F);
  static const Color errorDark = Color(0xFFD92D20);
  static const Color errorBg = Color(0xFFFCE7E5);
}

/// Warna brand spesifik penyedia pembayaran (bukan bagian dari tema umum).
/// Dipisah karena nilainya ditentukan oleh masing-masing brand, bukan desain UI.
class PaymentBrandColors {
  PaymentBrandColors._();

  static const Color bca = Color(0xFF0071CE);
  static const Color bri = Color(0xFF005CB9);
  static const Color bni = Color(0xFFF77C1C);
  static const Color mandiri = Color(0xFF005AA9);
  static const Color permata = Color(0xFF0D8D72);
  static const Color cimb = Color(0xFFA71930);
}
