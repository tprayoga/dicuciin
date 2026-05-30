import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'api_exception.dart';

class ApiClient {
  ApiClient({required String baseUrl}) : _baseUrl = _normalizeBaseUrl(baseUrl);

  final String _baseUrl;
  static const Duration _requestTimeout = Duration(seconds: 15);

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

  Future<dynamic> _request({
    required String method,
    required String path,
    Map<String, String>? headers,
    Map<String, String>? queryParameters,
    Object? body,
  }) async {
    final uri = Uri.parse('$_baseUrl${_normalizePath(path)}').replace(
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
      throw ApiException('Request timeout. Periksa koneksi internet atau API base URL.');
    } on SocketException {
      throw ApiException('Tidak bisa terhubung ke server. Cek API base URL dan jaringan.');
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
    return url.trim().replaceAll(RegExp(r'/+$'), '');
  }

  static String _normalizePath(String path) {
    if (path.startsWith('/')) return path;
    return '/$path';
  }
}
