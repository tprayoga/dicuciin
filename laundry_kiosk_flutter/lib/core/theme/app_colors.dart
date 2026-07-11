import 'package:flutter/material.dart';

/// Sumber kebenaran tunggal untuk warna Di.Cuciin (Kiosk).
///
/// Rasio pemakaian yang harus dijaga secara mental:
/// ~60% neutral hangat, ~30% oranye (struktur/brand/aksi), ~10% biru (informasi).
/// Oranye untuk brand & aksi; biru untuk informasi. Jangan pakai keduanya
/// sebagai aksen yang saling bersaing dalam satu komponen.
class AppColors {
  AppColors._();

  // ── Brand oranye (warna DOMINAN) ──
  /// Warna brand utama. Untuk area/fill besar & tombol utama.
  /// JANGAN pakai untuk teks/ikon kecil di atas latar terang (kontras kurang).
  static const Color primary = Color(0xFFFC5F00);

  /// State ditekan (pressed). Juga satu-satunya oranye yang boleh untuk
  /// teks/ikon kecil di atas latar terang.
  static const Color primaryDark = Color(0xFFC94C00);

  /// Latar chip/badge, kontainer ikon, state terpilih.
  static const Color primaryLight = Color(0xFFFFE9DB);

  /// Sorotan section yang lembut.
  static const Color primaryUltraLight = Color(0xFFFFF6F0);

  // ── Aksen biru (informasi) ──
  /// Elemen informasional, badge status netral, tautan.
  static const Color accent = Color(0xFF2563EB);
  static const Color accentDark = Color(0xFF1E40AF);
  static const Color accentLight = Color(0xFFDBEAFE);

  // ── Netral / permukaan ──
  /// Latar scaffold off-white hangat (bukan putih murni, bukan abu dingin).
  static const Color background = Color(0xFFFFFBF5);

  /// Kartu, sheet, dialog.
  static const Color surface = Color(0xFFFFFFFF);

  /// Border hangat halus (input, kartu).
  static const Color border = Color(0xFFE7D8C9);

  // ── Teks ──
  static const Color textPrimary = Color(0xFF1C1917);
  static const Color textSecondary = Color(0xFF78716C);
  static const Color textHint = Color(0xFFA8A29E);

  // ── Status semantik + varian terang (latar badge) + teks gelap (di atas terang) ──
  static const Color success = Color(0xFF10B981);
  static const Color successLight = Color(0xFFD1FAE5);
  static const Color successDark = Color(0xFF047857);

  static const Color warning = Color(0xFFEAB308);
  static const Color warningLight = Color(0xFFFEF9C3);
  static const Color warningDark = Color(0xFFA16207);

  static const Color error = Color(0xFFEF4444);
  static const Color errorLight = Color(0xFFFEE2E2);
  static const Color errorDark = Color(0xFFB91C1C);

  // ── Netral untuk teks di atas brand ──
  static const Color onPrimary = Color(0xFFFFFFFF);

  /// Putih lembut untuk teks sekunder di atas brand (mengembalikan hierarki
  /// yang dulu diberi `white70`).
  static final Color onPrimaryMuted = Colors.white.withValues(alpha: 0.80);
}
