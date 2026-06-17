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
  machines,
  checkout,
  payment,
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

  // ── State alur pesan mesin → checkout → bayar ──────────────────────
  List<Machine> machines = const [];
  Occupancy? occupancy;
  bool machinesLoading = false;
  Machine? selectedMachine;
  ServicePrice? selectedService;
  String? appliedPromo;
  PricingQuote? quote;
  CreatedOrder? createdOrder;
  KioskPayment? payment;
  Timer? _heartbeatTimer;
  Timer? _paymentTimer;

  /// Total tagihan setelah order dibuat (kalau ada), kalau belum pakai harga layanan.
  double get total =>
      createdOrder?.total ?? quote?.finalAmount ?? selectedService?.price ?? 0;

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

  /// Mulai alur pesan: buka daftar mesin outlet ini.
  Future<void> startOrder() async {
    _resetOrderState();
    stage = KioskStage.machines;
    notifyListeners();
    await loadMachines();
  }

  Future<void> loadMachines() async {
    machinesLoading = true;
    error = null;
    notifyListeners();
    try {
      final payload = await _api.get(
        '/kiosks/device/machines',
        token: deviceToken,
      );
      final data = OutletMachines.fromJson(payload as Map<String, dynamic>);
      machines = data.machines;
      occupancy = data.occupancy;
    } on ApiException catch (exception) {
      error = exception.message;
    } catch (_) {
      error = 'Gagal memuat mesin. Coba lagi.';
    } finally {
      machinesLoading = false;
      notifyListeners();
    }
  }

  /// Pilih mesin lalu lanjut ke checkout. Layanan & harga diturunkan dari tipe
  /// mesin (cuci/pengering) berdasarkan daftar harga layanan outlet.
  void selectMachine(Machine machine) {
    if (!machine.bookable) return;
    final service = serviceFor(machine);
    if (service == null) {
      error = 'Belum ada tarif layanan untuk mesin ini.';
      notifyListeners();
      return;
    }
    selectedMachine = machine;
    selectedService = service;
    appliedPromo = null;
    quote = null;
    createdOrder = null;
    payment = null;
    error = null;
    stage = KioskStage.checkout;
    notifyListeners();
    loadQuote();
  }

  Future<void> loadQuote({String? voucherCode}) async {
    if (selectedService == null || terminal == null) return;
    try {
      final payload =
          await _api.post(
                '/pricing/calculate',
                token: deviceToken,
                body: {
                  'outletId': terminal!.outlet.id,
                  'sourcePlatform': 'KIOSK',
                  'items': [
                    {
                      'serviceId': selectedService!.serviceId,
                      'quantity': 1,
                      if (selectedMachine != null)
                        'machineType': selectedMachine!.isWasher
                            ? 'WASHER'
                            : 'DRYER',
                    },
                  ],
                  if (voucherCode != null && voucherCode.trim().isNotEmpty)
                    'voucherCode': voucherCode.trim(),
                },
              )
              as Map<String, dynamic>;
      quote = PricingQuote.fromJson(payload);
      appliedPromo = voucherCode?.trim().isNotEmpty == true
          ? voucherCode!.trim()
          : null;
      notifyListeners();
    } on ApiException catch (exception) {
      error = exception.message;
      notifyListeners();
    }
  }

  /// Layanan (+ tarif) yang dipakai untuk sebuah mesin, berdasarkan tipenya.
  ServicePrice? serviceFor(Machine machine) {
    if (services.isEmpty) return null;
    final wantDryer = !machine.isWasher;
    final match = services
        .where((service) => service.isDryer == wantDryer)
        .toList();
    return (match.isNotEmpty ? match : services).first;
  }

  void backToMachines() {
    error = null;
    stage = KioskStage.machines;
    notifyListeners();
  }

  void backToCheckout() {
    _paymentTimer?.cancel();
    error = null;
    stage = KioskStage.checkout;
    notifyListeners();
  }

  /// Buat order tamu untuk mesin terpilih lalu buka tagihan QRIS/VA.
  Future<void> submitCheckout({
    String? promoCode,
    String method = 'QRIS',
    String? bank,
  }) async {
    if (selectedService == null ||
        selectedMachine == null ||
        terminal == null) {
      return;
    }
    await _run(() async {
      final orderPayload =
          await _api.post(
                '/kiosks/device/orders',
                token: deviceToken,
                body: {
                  'outletId': terminal!.outlet.id,
                  'kioskId': terminal!.id,
                  'sourcePlatform': 'KIOSK',
                  'items': [
                    {'serviceId': selectedService!.serviceId, 'quantity': 1},
                  ],
                  if (promoCode != null && promoCode.trim().isNotEmpty)
                    'promoCode': promoCode.trim(),
                  'notes':
                      'Mesin ${selectedMachine!.name} (${selectedMachine!.deviceCode})',
                },
              )
              as Map<String, dynamic>;
      createdOrder = CreatedOrder.fromJson(orderPayload);
      appliedPromo = promoCode?.trim().isNotEmpty == true
          ? promoCode!.trim()
          : null;

      final paymentPayload =
          await _api.post(
                '/kiosks/device/payments',
                token: deviceToken,
                body: {
                  'orderId': createdOrder!.id,
                  'method': method,
                  'bank': ?bank,
                },
              )
              as Map<String, dynamic>;
      payment = KioskPayment.fromJson(paymentPayload);
      stage = KioskStage.payment;
      _startPaymentPolling();
    });
  }

  void _startPaymentPolling() {
    _paymentTimer?.cancel();
    _paymentTimer = Timer.periodic(
      const Duration(seconds: 3),
      (_) => _checkPayment(),
    );
  }

  Future<void> _checkPayment() async {
    if (payment == null) return;
    try {
      final payload = await _api.get(
        '/kiosks/device/payments/${payment!.paymentNumber}/status',
        token: deviceToken,
      );
      payment = KioskPayment.fromJson(payload as Map<String, dynamic>);
      if (payment!.isPaid) {
        _paymentTimer?.cancel();
        stage = KioskStage.success;
      }
      notifyListeners();
    } catch (_) {
      // Abaikan error polling sesaat; percobaan berikutnya akan mengulang.
    }
  }

  /// Dev-only: paksa pembayaran sukses (untuk pengujian tanpa gateway nyata).
  Future<void> simulatePayment() async {
    if (payment == null) return;
    try {
      await _api.post(
        '/kiosks/device/payments/${payment!.paymentNumber}/simulate',
        token: deviceToken,
      );
      await _checkPayment();
    } on ApiException catch (exception) {
      error = exception.message;
      notifyListeners();
    }
  }

  void newOrder() {
    _resetOrderState();
    stage = KioskStage.welcome;
    notifyListeners();
  }

  void _resetOrderState() {
    _paymentTimer?.cancel();
    machines = const [];
    occupancy = null;
    selectedMachine = null;
    selectedService = null;
    appliedPromo = null;
    createdOrder = null;
    quote = null;
    payment = null;
    error = null;
  }

  Future<void> clearEnrollment() async {
    _heartbeatTimer?.cancel();
    await _endRuntimeSession();
    await _storage.clearToken();
    deviceToken = null;
    terminal = null;
    services = const [];
    _resetOrderState();
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
        _resetOrderState();
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
    _paymentTimer?.cancel();
    super.dispose();
  }
}
