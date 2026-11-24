/// Semua outlet beroperasi di WIB (UTC+7). Jam booking/order ditampilkan
/// sebagai jam dinding WIB agar tidak bergeser di HP/emulator yang zona
/// waktunya bukan WIB (QA 2026-11-24 MOB-002: 23:00 tampil 16:00).
extension WibTime on DateTime {
  static const offset = Duration(hours: 7);

  /// Instant ini sebagai jam dinding WIB. Hasilnya bertanda UTC: pakai hanya
  /// untuk tampilan (year/month/day/hour/minute), jangan dikirim ke server.
  DateTime toWib() => toUtc().add(offset);
}
