import 'dart:async';

import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'device_storage.dart';
import 'models.dart';

enum KioskStage {
  initializing,
  enrollment,
  closed,
  welcome,
  ordering,
  review,
  success,
}

class KioskController extends ChangeNotifier {
  KioskController(this._api, this._storage);

  final ApiClient _api;
  final DeviceStorage _storage;

  KioskStage stage = KioskStage.initializing;
  bool loading = false;
  String? error;
  String? deviceToken;
  KioskTerminal? terminal;
  String? sessionId;
  List<ServicePrice> services = const [];
  final Map<String, CartLine> cart = {};
  CreatedOrder? createdOrder;
  Timer? _heartbeatTimer;

  int get itemCount => cart.values.fold(0, (sum, line) => sum + line.quantity);
  double get total => cart.values.fold(0, (sum, line) => sum + line.subtotal);

  Future<void> initialize() async {
    deviceToken = await _storage.readToken();
    if (deviceToken == null) {
      stage = KioskStage.enrollment;
      notifyListeners();
      return;
    }
    await _restoreEnrollment();
  }

  Future<void> enroll(String code) async {
    if (code.trim().length != 6) {
      error = 'Masukkan kode enrollment 6 digit.';
      notifyListeners();
      return;
    }
    await _run(() async {
      final payload =
          await _api.post(
                '/kiosks/device/enroll',
                body: {
                  'code': code.trim(),
                  'deviceId': await _storage.deviceId(),
                },
              )
              as Map<String, dynamic>;
      deviceToken = payload['deviceToken'] as String;
      await _storage.saveToken(deviceToken!);
      await _applyBootstrap(payload);
    }, clearEnrollmentOnUnauthorized: false);
  }

  Future<void> _restoreEnrollment() async {
    await _run(() async {
      final payload =
          await _api.get('/kiosks/device/bootstrap', token: deviceToken)
              as Map<String, dynamic>;
      await _applyBootstrap(payload);
    });
  }

  Future<void> _applyBootstrap(Map<String, dynamic> payload) async {
    terminal = KioskTerminal.fromJson(payload['kiosk'] as Map<String, dynamic>);
    final schedule = payload['schedule'] as Map<String, dynamic>? ?? const {};
    if (schedule['isOpen'] != true) {
      stage = KioskStage.closed;
      _startHeartbeat();
      return;
    }
    await _startRuntimeSession();
    await loadServices();
    stage = KioskStage.welcome;
    _startHeartbeat();
  }

  Future<void> _startRuntimeSession() async {
    final session =
        await _api.post('/kiosks/device/session/start', token: deviceToken)
            as Map<String, dynamic>;
    sessionId = session['id'] as String;
  }

  Future<void> loadServices() async {
    final payload = await _api.get(
      '/kiosks/device/services',
      token: deviceToken,
    );
    final list = payload as List<dynamic>? ?? const [];
    services = list
        .whereType<Map<String, dynamic>>()
        .map(ServicePrice.fromJson)
        .where((item) => item.serviceId.isNotEmpty)
        .toList();
  }

  void add(ServicePrice service) {
    final existing = cart[service.serviceId];
    cart[service.serviceId] = CartLine(
      service: service,
      quantity: (existing?.quantity ?? 0) + 1,
    );
    notifyListeners();
  }

  void decrease(ServicePrice service) {
    final existing = cart[service.serviceId];
    if (existing == null) return;
    if (existing.quantity <= 1) {
      cart.remove(service.serviceId);
    } else {
      cart[service.serviceId] = existing.copyWith(
        quantity: existing.quantity - 1,
      );
    }
    notifyListeners();
  }

  void startOrder() {
    cart.clear();
    createdOrder = null;
    error = null;
    stage = KioskStage.ordering;
    notifyListeners();
  }

  void reviewOrder() {
    if (cart.isEmpty) return;
    stage = KioskStage.review;
    notifyListeners();
  }

  void backToMenu() {
    error = null;
    stage = KioskStage.ordering;
    notifyListeners();
  }

  Future<void> submitOrder() async {
    if (cart.isEmpty || terminal == null) return;
    await _run(() async {
      final payload =
          await _api.post(
                '/kiosks/device/orders',
                token: deviceToken,
                body: {
                  'outletId': terminal!.outlet.id,
                  'kioskId': terminal!.id,
                  'sourcePlatform': 'KIOSK',
                  'items': cart.values
                      .map(
                        (line) => {
                          'serviceId': line.service.serviceId,
                          'quantity': line.quantity,
                        },
                      )
                      .toList(),
                },
              )
              as Map<String, dynamic>;
      createdOrder = CreatedOrder.fromJson(payload);
      stage = KioskStage.success;
    });
  }

  void newOrder() {
    cart.clear();
    createdOrder = null;
    error = null;
    stage = KioskStage.welcome;
    notifyListeners();
  }

  Future<void> clearEnrollment() async {
    _heartbeatTimer?.cancel();
    await _endRuntimeSession();
    await _storage.clearToken();
    deviceToken = null;
    terminal = null;
    services = const [];
    cart.clear();
    stage = KioskStage.enrollment;
    notifyListeners();
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _heartbeat(),
    );
  }

  Future<void> _heartbeat() async {
    try {
      final payload =
          await _api.post('/kiosks/device/heartbeat', token: deviceToken)
              as Map<String, dynamic>;
      final schedule = payload['schedule'] as Map<String, dynamic>? ?? const {};
      final isOpen = schedule['isOpen'] == true;
      if (!isOpen && stage != KioskStage.closed) {
        await _endRuntimeSession();
        cart.clear();
        stage = KioskStage.closed;
        notifyListeners();
      } else if (isOpen && stage == KioskStage.closed) {
        await _startRuntimeSession();
        await loadServices();
        stage = KioskStage.welcome;
        notifyListeners();
      }
    } on ApiException catch (exception) {
      if (exception.statusCode == 401) {
        await _storage.clearToken();
        deviceToken = null;
        stage = KioskStage.enrollment;
        error = 'Enrollment perangkat telah dicabut oleh admin.';
        _heartbeatTimer?.cancel();
        notifyListeners();
      }
    }
  }

  Future<void> _endRuntimeSession() async {
    if (sessionId == null || deviceToken == null) return;
    try {
      await _api.post(
        '/kiosks/device/session/$sessionId/end',
        token: deviceToken,
      );
    } catch (_) {
      // Session akan ditutup backend saat sesi baru dimulai.
    }
    sessionId = null;
  }

  Future<void> _run(
    Future<void> Function() task, {
    bool clearEnrollmentOnUnauthorized = true,
  }) async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      await task();
    } on ApiException catch (exception) {
      if (clearEnrollmentOnUnauthorized && exception.statusCode == 401) {
        await _storage.clearToken();
        deviceToken = null;
        stage = KioskStage.enrollment;
        error = 'Perangkat perlu di-enroll ulang.';
      } else {
        error = exception.message;
        if (stage == KioskStage.initializing) {
          stage = KioskStage.enrollment;
        }
      }
    } catch (_) {
      error = 'Terjadi kesalahan. Coba lagi.';
      if (stage == KioskStage.initializing) {
        stage = KioskStage.enrollment;
      }
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _heartbeatTimer?.cancel();
    super.dispose();
  }
}
