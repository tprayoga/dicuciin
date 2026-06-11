class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api/v1',
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
