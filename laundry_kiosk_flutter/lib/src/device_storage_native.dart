import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class DeviceStorage {
  const DeviceStorage();

  static const _tokenKey = 'kiosk_device_token';
  static const _deviceIdKey = 'kiosk_device_id';
  static const _storage = FlutterSecureStorage();

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<void> saveToken(String token) =>
      _storage.write(key: _tokenKey, value: token);

  Future<void> clearToken() => _storage.delete(key: _tokenKey);

  Future<String> deviceId() async {
    final existing = await _storage.read(key: _deviceIdKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final id = _randomId();
    await _storage.write(key: _deviceIdKey, value: id);
    return id;
  }
}

String _randomId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  return bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
}
