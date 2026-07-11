import 'package:flutter/widgets.dart';

/// Skala radius tunggal Di.Cuciin (Kiosk).
///
/// Panduan: Kartu pakai [lg], tombol pakai [md], chip/badge pakai [pill].
class AppRadius {
  AppRadius._();

  /// 8
  static const double sm = 8;

  /// 12 — tombol.
  static const double md = 12;

  /// 16 — kartu.
  static const double lg = 16;

  /// 28 — HANYA untuk panel hero besar. Jangan pakai di kartu/tombol.
  static const double xl = 28;

  /// 999 — chip/badge (kapsul penuh).
  static const double pill = 999;

  // Helper BorderRadius siap pakai.
  static const BorderRadius radiusSm = BorderRadius.all(Radius.circular(sm));
  static const BorderRadius radiusMd = BorderRadius.all(Radius.circular(md));
  static const BorderRadius radiusLg = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius radiusPill = BorderRadius.all(Radius.circular(pill));
}
