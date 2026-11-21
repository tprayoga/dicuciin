class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api/v1',
  );

  static const bool paymentSimulationEnabled = bool.fromEnvironment(
    'ENABLE_PAYMENT_SIMULATION',
    defaultValue: false,
  );

  /// Top up saldo oleh pelanggan. Dimatikan sampai top-up lewat Midtrans
  /// (Fase 2) selesai — endpoint top-up langsung kini khusus admin (K1).
  static const bool walletTopUpEnabled = bool.fromEnvironment(
    'ENABLE_WALLET_TOPUP',
    defaultValue: false,
  );

  /// Nomor WhatsApp layanan pelanggan (format internasional tanpa '+').
  static const String supportWhatsApp = '628118882908';

  /// Batch 6 (R2): kontak & halaman kebijakan (sama dengan situs dicuciin.com).
  static const String supportPhoneDisplay = '0811-888-2908';
  static const String supportEmail = 'di.cuciin.hq@gmail.com';
  static const String websiteBaseUrl = String.fromEnvironment(
    'WEBSITE_BASE_URL',
    defaultValue: 'https://dicuciin.com',
  );
  static String get termsUrl => '$websiteBaseUrl/syarat-ketentuan.html';
  static String get privacyUrl => '$websiteBaseUrl/kebijakan-privasi.html';
  static String get refundPolicyUrl => '$websiteBaseUrl/kebijakan-refund.html';

  /// Jalur web hapus akun (tanpa aplikasi) — kewajiban toko aplikasi.
  static String get accountDeletionUrl => '$websiteBaseUrl/hapus-akun.html';

  /// Nama merchant pada QRIS/VA (harus sama dengan nama di dashboard Midtrans).
  static const String merchantName = String.fromEnvironment(
    'MERCHANT_NAME',
    defaultValue: 'Di.Cuciin',
  );

  /// Origin server (tanpa path `/api/v1`) untuk memuat file statis seperti
  /// foto profil/banner yang disajikan di `/uploads/...`.
  static String get assetOrigin =>
      apiBaseUrl.replaceFirst(RegExp(r'/api/v\d+/?$'), '');

  /// Bentuk URL penuh dari path aset relatif (mis. `/uploads/profiles/x.jpg`).
  /// Mengembalikan null bila kosong; meneruskan apa adanya bila sudah absolut.
  static String? assetUrl(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    final sep = path.startsWith('/') ? '' : '/';
    return '$assetOrigin$sep$path';
  }
}
