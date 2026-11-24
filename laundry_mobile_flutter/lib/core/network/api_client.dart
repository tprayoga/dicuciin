import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'api_exception.dart';

/// Dipanggil saat request ber-token mendapat 401. Mengembalikan access token
/// baru (request diulang SEKALI) atau null (sesi berakhir).
typedef UnauthorizedHandler = Future<String?> Function(String failedAccessToken);

class ApiClient {
  ApiClient({required String baseUrl}) : _baseUrl = _normalizeBaseUrl(baseUrl);

  final String _baseUrl;
  static const Duration _requestTimeout = Duration(seconds: 15);

  /// Batch 5 (T1): dipasang oleh AuthController — refresh token sekali untuk
  /// semua request paralel, lalu request yang gagal diulang dengan token baru.
  UnauthorizedHandler? onUnauthorized;

  /// Endpoint yang 401-nya bukan "access token kedaluwarsa".
  static const _noRefreshPaths = <String>{
    '/auth/login',
    '/auth/register',
    '/auth/refresh',
    '/auth/logout',
    '/auth/otp/request',
    '/auth/otp/verify',
    '/auth/password/reset',
  };

  Future<dynamic> get(
    String path, {
    Map<String, String>? headers,
    Map<String, String>? queryParameters,
  }) {
    return _request(
      method: 'GET',
      path: path,
      headers: headers,
      queryParameters: queryParameters,
    );
  }

  Future<dynamic> post(
    String path, {
    Map<String, String>? headers,
    Object? body,
  }) {
    return _request(
      method: 'POST',
      path: path,
      headers: headers,
      body: body,
    );
  }

  Future<dynamic> patch(
    String path, {
    Map<String, String>? headers,
    Object? body,
  }) {
    return _request(
      method: 'PATCH',
      path: path,
      headers: headers,
      body: body,
    );
  }

  Future<dynamic> postMultipart(
    String path, {
    Map<String, String>? headers,
    required String fileField,
    required String filePath,
  }) async {
    final uri = Uri.parse('$_baseUrl${_normalizePath(path)}');
    final request = http.MultipartRequest('POST', uri);
    request.headers.addAll({
      'Accept': 'application/json',
      ...?headers,
    });
    request.files.add(await http.MultipartFile.fromPath(fileField, filePath));

    http.Response response;
    try {
      final streamed = await request.send().timeout(_requestTimeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw ApiException('Upload timeout. Coba lagi.');
    } on SocketException {
      throw ApiException('Tidak bisa terhubung ke server saat upload.');
    }

    dynamic payload;
    if (response.body.isNotEmpty) {
      try {
        payload = jsonDecode(response.body);
      } catch (_) {
        payload = null;
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_extractMessage(payload), statusCode: response.statusCode);
    }

    return _unwrap(payload);
  }

  /// Upload multipart dari bytes (aman untuk Web & mobile).
  Future<dynamic> postMultipartBytes(
    String path, {
    Map<String, String>? headers,
    required String fileField,
    required List<int> bytes,
    required String filename,
  }) async {
    final uri = Uri.parse('$_baseUrl${_normalizePath(path)}');
    final request = http.MultipartRequest('POST', uri);
    request.headers.addAll({
      'Accept': 'application/json',
      ...?headers,
    });
    request.files.add(
      http.MultipartFile.fromBytes(fileField, bytes, filename: filename),
    );

    http.Response response;
    try {
      final streamed = await request.send().timeout(_requestTimeout);
      response = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw ApiException('Upload timeout. Coba lagi.');
    } on SocketException {
      throw ApiException('Tidak bisa terhubung ke server saat upload.');
    }

    dynamic payload;
    if (response.body.isNotEmpty) {
      try {
        payload = jsonDecode(response.body);
      } catch (_) {
        payload = null;
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_extractMessage(payload), statusCode: response.statusCode);
    }

    return _unwrap(payload);
  }

  Future<dynamic> _request({
    required String method,
    required String path,
    Map<String, String>? headers,
    Map<String, String>? queryParameters,
    Object? body,
    bool isRetry = false,
  }) async {
    final normalizedPath = _normalizePath(path);
    final uri = Uri.parse('$_baseUrl$normalizedPath').replace(
      queryParameters: queryParameters,
    );

    final requestHeaders = <String, String>{
      'Accept': 'application/json',
      ...?headers,
    };

    if (body != null && !requestHeaders.containsKey('Content-Type')) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    late http.Response response;
    try {
      switch (method) {
        case 'GET':
          response = await http
              .get(uri, headers: requestHeaders)
              .timeout(_requestTimeout);
        case 'POST':
          response = await http
              .post(uri, headers: requestHeaders, body: body)
              .timeout(_requestTimeout);
        case 'PATCH':
          response = await http
              .patch(uri, headers: requestHeaders, body: body)
              .timeout(_requestTimeout);
        default:
          throw ApiException('Unsupported method: $method');
      }
    } on TimeoutException {
      throw ApiException('Koneksi lambat atau terputus. Periksa internet kamu lalu coba lagi.');
    } on SocketException {
      throw ApiException('Tidak bisa terhubung ke server. Periksa internet kamu lalu coba lagi.');
    }

    // 401 = guard menolak SEBELUM handler berjalan, sehingga aman mengulang
    // request (termasuk POST) satu kali dengan access token baru.
    final failedToken = _bearerOf(requestHeaders);
    final handler = onUnauthorized;
    if (response.statusCode == 401 &&
        !isRetry &&
        handler != null &&
        failedToken != null &&
        !_noRefreshPaths.contains(normalizedPath)) {
      final newToken = await handler(failedToken);
      if (newToken != null && newToken != failedToken) {
        return _request(
          method: method,
          path: path,
          headers: {...?headers, 'Authorization': 'Bearer $newToken'},
          queryParameters: queryParameters,
          body: body,
          isRetry: true,
        );
      }
    }

    dynamic payload;
    if (response.body.isNotEmpty) {
      try {
        payload = jsonDecode(response.body);
      } catch (_) {
        payload = null;
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_extractMessage(payload), statusCode: response.statusCode);
    }

    return _unwrap(payload);
  }

  static String? _bearerOf(Map<String, String> headers) {
    final value = headers['Authorization'] ?? headers['authorization'];
    if (value == null || !value.startsWith('Bearer ')) return null;
    final token = value.substring(7).trim();
    return token.isEmpty ? null : token;
  }

  dynamic _unwrap(dynamic payload) {
    if (payload is Map<String, dynamic> && payload.containsKey('data')) {
      return payload['data'];
    }
    return payload;
  }

  String _extractMessage(dynamic payload) {
    if (payload is Map<String, dynamic>) {
      final message = payload['message'];
      if (message is String && message.trim().isNotEmpty) {
        return message;
      }
      if (message is List && message.isNotEmpty) {
        return message.join(', ');
      }
    }
    return 'Terjadi kesalahan jaringan';
  }

  static String _normalizeBaseUrl(String url) {
    var normalized = url.trim().replaceAll(RegExp(r'/+$'), '');
    // Pastikan ada skema; tanpa ini di Flutter Web URL dianggap path relatif
    // (mis. jadi http://localhost:59370/localhost:3000/...).
    if (!normalized.startsWith(RegExp(r'https?://'))) {
      normalized = 'http://$normalized';
    }
    return normalized;
  }

  static String _normalizePath(String path) {
    if (path.startsWith('/')) return path;
    return '/$path';
  }
}
