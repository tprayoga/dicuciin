import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(String baseUrl) : _baseUrl = _normalizeBaseUrl(baseUrl);

  final String _baseUrl;
  static const _timeout = Duration(seconds: 20);

  Future<dynamic> get(String path, {String? token}) =>
      _request('GET', path, token: token);

  Future<dynamic> post(
    String path, {
    String? token,
    Map<String, dynamic>? body,
  }) => _request('POST', path, token: token, body: body);

  Future<dynamic> _request(
    String method,
    String path, {
    String? token,
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$_baseUrl${path.startsWith('/') ? path : '/$path'}');
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };

    late http.Response response;
    try {
      response = switch (method) {
        'GET' => await http.get(uri, headers: headers).timeout(_timeout),
        'POST' =>
          await http
              .post(
                uri,
                headers: headers,
                body: body == null ? null : jsonEncode(body),
              )
              .timeout(_timeout),
        _ => throw const ApiException('Metode request tidak didukung'),
      };
    } on TimeoutException {
      throw const ApiException('Server tidak merespons. Coba lagi.');
    } on SocketException {
      throw const ApiException('Tidak dapat terhubung ke server.');
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
      final message = payload is Map<String, dynamic>
          ? payload['message']
          : null;
      throw ApiException(
        message is List
            ? message.join(', ')
            : message?.toString() ?? 'Request gagal',
        statusCode: response.statusCode,
      );
    }

    if (payload is Map<String, dynamic> && payload['success'] == true) {
      if (payload.containsKey('meta')) {
        return {'data': payload['data'], 'meta': payload['meta']};
      }
      return payload['data'];
    }
    return payload;
  }

  static String _normalizeBaseUrl(String value) {
    var url = value.trim().replaceAll(RegExp(r'/+$'), '');
    if (!url.startsWith(RegExp(r'https?://'))) url = 'http://$url';
    return url;
  }
}
