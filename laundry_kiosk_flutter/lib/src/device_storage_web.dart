import 'dart:math';

import 'package:web/web.dart' as web;

class DeviceStorage {
  const DeviceStorage();

  static const _tokenKey = 'kiosk_device_token';
  static const _deviceIdKey = 'kiosk_device_id';

  Future<String?> readToken() async =>
      web.window.localStorage.getItem(_tokenKey);

  Future<void> saveToken(String token) async {
    web.window.localStorage.setItem(_tokenKey, token);
  }

  Future<void> clearToken() async {
    web.window.localStorage.removeItem(_tokenKey);
  }

  Future<String> deviceId() async {
    final existing = web.window.localStorage.getItem(_deviceIdKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    final id = bytes
        .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
        .join();
    web.window.localStorage.setItem(_deviceIdKey, id);
    return id;
  }
}
