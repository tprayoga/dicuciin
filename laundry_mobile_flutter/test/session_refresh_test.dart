// Batch 5 (T1): 401 → refresh token SEKALI (dipakai bersama request paralel)
// → request diulang dengan token baru; refresh ditolak → logout lokal dengan
// pesan "Sesi berakhir". Server tiruan (MockClient), tanpa jaringan.
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:laundry_mobile_flutter/core/network/api_client.dart';
import 'package:laundry_mobile_flutter/core/network/api_exception.dart';
import 'package:laundry_mobile_flutter/core/storage/token_storage.dart';
import 'package:laundry_mobile_flutter/features/auth/auth_controller.dart';
import 'package:laundry_mobile_flutter/features/auth/auth_service.dart';

class FakeServer {
  FakeServer({this.refreshStatus = 201});

  String validAccess = 'akses-1';
  int refreshStatus;
  int refreshCalls = 0;
  final seenTokens = <String>[];

  http.Response _json(int status, Object body) =>
      http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

  Future<http.Response> handle(http.Request req) async {
    final path = req.url.path;
    final token = req.headers['Authorization']?.replaceFirst('Bearer ', '');
    if (path == '/auth/refresh') {
      refreshCalls++;
      await Future<void>.delayed(const Duration(milliseconds: 20));
      if (refreshStatus != 201) return _json(refreshStatus, {'message': 'Refresh token has been revoked'});
      validAccess = 'akses-${refreshCalls + 1}';
      return _json(201, {
        'data': {'accessToken': validAccess, 'refreshToken': 'refresh-${refreshCalls + 1}'},
      });
    }
    if (path == '/auth/login') {
      return _json(401, {'message': 'Invalid credentials'});
    }
    seenTokens.add('$path:$token');
    if (path == '/selalu-401') return _json(401, {'message': 'Invalid or expired token'});
    if (token != validAccess) return _json(401, {'message': 'Invalid or expired token'});
    if (path == '/auth/me') {
      return _json(200, {'data': {'id': 'u1', 'name': 'Uji', 'role': 'CUSTOMER'}});
    }
    return _json(200, {'data': {'ok': true, 'path': path}});
  }
}

Future<(ApiClient, AuthController)> boot(FakeServer server) async {
  FlutterSecureStorage.setMockInitialValues({
    'auth.accessToken': 'akses-1',
    'auth.refreshToken': 'refresh-1',
  });
  final api = ApiClient(baseUrl: 'http://api.uji');
  final auth = AuthController(authService: AuthService(api), tokenStorage: TokenStorage());
  api.onUnauthorized = auth.handleUnauthorized;
  // Tunggu hidrasi awal (/auth/me dengan token tersimpan).
  for (var i = 0; i < 50 && auth.status != AuthStatus.authenticated; i++) {
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
  expect(auth.status, AuthStatus.authenticated);
  return (api, auth);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('access token kedaluwarsa: 3 request paralel → refresh SEKALI, semua diulang dengan token baru', () async {
    final server = FakeServer();
    await http.runWithClient(() async {
      final (api, auth) = await boot(server);
      server.validAccess = 'akses-baru-belum-ada'; // token akses-1 kini ditolak
      final results = await Future.wait([
        for (final p in ['/a', '/b', '/c'])
          api.get(p, headers: {'Authorization': 'Bearer ${auth.accessToken}'}),
      ]);
      expect(server.refreshCalls, 1);
      expect(results.map((r) => r['path']), ['/a', '/b', '/c']);
      expect(auth.accessToken, 'akses-2');
      expect(auth.status, AuthStatus.authenticated);
    }, () => MockClient(server.handle));
  });

  test('endpoint yang tetap 401 setelah refresh → diulang SEKALI saja (tanpa loop refresh)', () async {
    final server = FakeServer();
    await http.runWithClient(() async {
      final (api, auth) = await boot(server);
      await expectLater(
        api.get('/selalu-401', headers: {'Authorization': 'Bearer ${auth.accessToken}'}),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 401)),
      );
      expect(server.refreshCalls, 1);
      expect(server.seenTokens.where((t) => t.startsWith('/selalu-401')).length, 2);
    }, () => MockClient(server.handle));
  }, timeout: const Timeout(Duration(seconds: 10)));

  test('POST yang kena 401 diulang sekali dengan token baru (body sama)', () async {
    final server = FakeServer();
    await http.runWithClient(() async {
      final (api, auth) = await boot(server);
      server.validAccess = 'x';
      final r = await api.post('/payments/wallet',
          headers: {'Authorization': 'Bearer ${auth.accessToken}'}, body: jsonEncode({'orderId': 'o1'}));
      expect(r['ok'], true);
      expect(server.seenTokens.where((t) => t.startsWith('/payments/wallet')).length, 2);
    }, () => MockClient(server.handle));
  });

  test('refresh ditolak (sesi dicabut) → logout lokal + pesan "Sesi berakhir", request gagal 401', () async {
    final server = FakeServer(refreshStatus: 401);
    await http.runWithClient(() async {
      final (api, auth) = await boot(server);
      server.validAccess = 'x';
      await expectLater(
        api.get('/a', headers: {'Authorization': 'Bearer ${auth.accessToken}'}),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 401)),
      );
      expect(auth.status, AuthStatus.unauthenticated);
      expect(auth.accessToken, isNull);
      expect(auth.errorMessage, AuthController.sessionExpiredMessage);
      expect(server.refreshCalls, 1);
    }, () => MockClient(server.handle));
  });

  test('refresh gagal karena server error (bukan 401) → sesi dipertahankan', () async {
    final server = FakeServer(refreshStatus: 503);
    await http.runWithClient(() async {
      final (api, auth) = await boot(server);
      server.validAccess = 'x';
      await expectLater(
        api.get('/a', headers: {'Authorization': 'Bearer ${auth.accessToken}'}),
        throwsA(isA<ApiException>()),
      );
      expect(auth.status, AuthStatus.authenticated);
    }, () => MockClient(server.handle));
  });

  test('401 dari /auth/login tidak memicu refresh', () async {
    final server = FakeServer();
    await http.runWithClient(() async {
      final (api, _) = await boot(server);
      await expectLater(
        api.post('/auth/login',
            headers: {'Authorization': 'Bearer akses-1'},
            body: jsonEncode({'identifier': 'x', 'password': 'y'})),
        throwsA(isA<ApiException>()),
      );
      expect(server.refreshCalls, 0);
    }, () => MockClient(server.handle));
  });

  test('request lain sudah me-refresh → token terbaru dipakai tanpa refresh ulang', () async {
    final server = FakeServer();
    await http.runWithClient(() async {
      final (api, auth) = await boot(server);
      server.validAccess = 'x';
      await api.get('/a', headers: {'Authorization': 'Bearer akses-1'});
      expect(server.refreshCalls, 1);
      // Request dengan token LAMA (mis. disimpan controller lain) → langsung pakai token baru.
      final r = await api.get('/b', headers: {'Authorization': 'Bearer akses-1'});
      expect(r['path'], '/b');
      expect(server.refreshCalls, 1);
      expect(auth.accessToken, 'akses-2');
    }, () => MockClient(server.handle));
  });
}
