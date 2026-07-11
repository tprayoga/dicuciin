import 'package:flutter/material.dart';

/// Token warna terpusat untuk seluruh aplikasi.
///
/// Gunakan token ini alih-alih menulis `Color(0xFF...)` langsung di widget,
/// supaya warna konsisten dan mudah diubah dari satu tempat.
///
/// Palet Di.Cuciin V02 — brand ORANYE dominan + netral hangat + aksen biru
/// (selaras dengan aplikasi kiosk). Nama token dipertahankan dari V01 agar
/// seluruh screen ikut berganti tema tanpa perubahan kode.
class AppColors {
  AppColors._();

  // ── Brand / Primary (oranye — DOMINAN) ──────────────────────────
  static const Color primary = Color(0xFFFC5F00); // brand orange
  static const Color primaryDark = Color(0xFFC94C00); // pressed / teks kecil
  static const Color primaryAccent = Color(0xFFFD6A01); // aksen oranye brand

  /// Latar chip/badge, kontainer ikon, state terpilih (peach lembut).
  static const Color primaryLight = Color(0xFFFFE9DB);

  /// Sorotan section yang sangat lembut.
  static const Color primaryUltraLight = Color(0xFFFFF6F0);

  // ── Aksen biru (informasi) ──────────────────────────────────────
  /// Elemen informasional, badge status netral, tautan.
  static const Color accent = Color(0xFF2563EB);
  static const Color accentDark = Color(0xFF1E40AF);
  static const Color accentLight = Color(0xFFDBEAFE);

  // ── Aksen brand lain ────────────────────────────────────────────
  static const Color brandOrange = Color(0xFFFD6A01);
  static const Color brandTurquoise = Color(0xFF05DCF3);
  static const Color brandCream = Color(0xFFFFFBF5); // natural hangat

  // ── Netral untuk teks di atas brand ─────────────────────────────
  static const Color onPrimary = Color(0xFFFFFFFF);

  /// Putih lembut untuk teks sekunder di atas brand.
  static final Color onPrimaryMuted = Colors.white.withValues(alpha: 0.80);

  // ── Teks (stone hangat) ─────────────────────────────────────────
  static const Color textDark = Color(0xFF1C1917); // brand black hangat
  static const Color textStrong = Color(0xFF1C1917);
  static const Color textMuted = Color(0xFF78716C);
  static const Color textMutedLight = Color(0xFFA8A29E);

  /// Alias semantik (parity dengan kiosk).
  static const Color textPrimary = Color(0xFF1C1917);
  static const Color textSecondary = Color(0xFF78716C);
  static const Color textHint = Color(0xFFA8A29E);

  // ── Permukaan / Background (off-white hangat) ───────────────────
  static const Color background = Color(0xFFFFFBF5);
  static const Color surface = Colors.white;
  static const Color surfaceAlt = Color(0xFFFFF6F0);

  /// Tint lembut untuk chip, ikon-bg, kartu (kini peach hangat, bukan biru).
  static const Color tintBlue = Color(0xFFFFE9DB);
  static const Color tintBlueAlt = Color(0xFFFFF6F0);

  // ── Garis / Border (hangat) ─────────────────────────────────────
  static const Color border = Color(0xFFE7D8C9);
  static const Color borderLight = Color(0xFFF0E7DD);

  // ── Status: Sukses ──────────────────────────────────────────────
  static const Color success = Color(0xFF10B981);
  static const Color successDark = Color(0xFF047857);
  static const Color successBg = Color(0xFFD1FAE5);
  static const Color successLight = Color(0xFFD1FAE5);

  // ── Status: Peringatan ──────────────────────────────────────────
  static const Color warning = Color(0xFFEAB308);
  static const Color warningDark = Color(0xFFA16207);
  static const Color warningBg = Color(0xFFFEF9C3);
  static const Color warningLight = Color(0xFFFEF9C3);

  // ── Status: Error ───────────────────────────────────────────────
  static const Color error = Color(0xFFEF4444);
  static const Color errorDark = Color(0xFFB91C1C);
  static const Color errorBg = Color(0xFFFEE2E2);
  static const Color errorLight = Color(0xFFFEE2E2);
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
