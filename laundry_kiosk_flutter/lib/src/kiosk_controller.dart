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
  memberLogin,
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
  String? completedPaymentMethod;
  Timer? _heartbeatTimer;
  Timer? _paymentTimer;
  bool _paymentChecking = false;
  String _lastMethod = 'QRIS';
  String? _lastBank;

  // ── Status aktivasi mesin setelah bayar (Batch 1.5) ─────────────────
  /// null = belum dicek; selain itu status perintah START dari server:
  /// PENDING/PUBLISHED/ACKED (sedang dinyalakan), RUNNING, MANUAL (mesin tanpa IoT —
  /// dinyalakan pelanggan), COMPLETED, FAILED.
  String? machineCommandStatus;
  bool machineStatusTimedOut = false;
  bool machineRetrying = false;
  Timer? _machineTimer;
  int _machinePolls = 0;

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

  /// Buka layar "Login sebagai Member" (UI-only). Tidak mengubah state order.
  void goToMemberLogin() {
    error = null;
    stage = KioskStage.memberLogin;
    notifyListeners();
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
    completedPaymentMethod = null;
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
    _cancelUnpaidOrder();
    error = null;
    stage = KioskStage.machines;
    notifyListeners();
  }

  void backToCheckout() {
    _paymentTimer?.cancel();
    _cancelUnpaidOrder();
    error = null;
    stage = KioskStage.checkout;
    notifyListeners();
  }

  /// Buat order tamu untuk mesin terpilih lalu buka tagihan QRIS/VA.
  Future<void> submitCheckout({
    String? promoCode,
    String? customerLookup,
    String method = 'QRIS',
    String? bank,
  }) async {
    if (selectedService == null ||
        selectedMachine == null ||
        terminal == null) {
      return;
    }
    await _run(() async {
      // Order lama yang belum dibayar (mis. pelanggan kembali dari layar bayar)
      // dibatalkan dulu agar mesin tidak tertahan oleh order sendiri.
      await _cancelUnpaidOrder();
      final orderPayload =
          await _api.post(
                '/kiosks/device/orders',
                token: deviceToken,
                body: {
                  'outletId': terminal!.outlet.id,
                  'kioskId': terminal!.id,
                  'sourcePlatform': 'KIOSK',
                  // Batch 1.5: order kiosk wajib terikat mesin (server menolak
                  // order tanpa mesin) → mesin menyala otomatis setelah bayar.
                  'deviceId': selectedMachine!.deviceId,
                  'items': [
                    {'serviceId': selectedService!.serviceId, 'quantity': 1},
                  ],
                  if (promoCode != null && promoCode.trim().isNotEmpty)
                    'promoCode': promoCode.trim(),
                  if (customerLookup != null &&
                      customerLookup.trim().isNotEmpty)
                    'customerLookup': customerLookup.trim(),
                  'notes':
                      'Mesin ${selectedMachine!.name} (${selectedMachine!.deviceCode})',
                },
              )
              as Map<String, dynamic>;
      createdOrder = CreatedOrder.fromJson(orderPayload);
      appliedPromo = promoCode?.trim().isNotEmpty == true
          ? promoCode!.trim()
          : null;

      _lastMethod = method;
      _lastBank = bank;
      await _requestPayment();
      stage = KioskStage.payment;
    });
  }

  Future<void> _requestPayment() async {
    final paymentPayload =
        await _api.post(
              '/kiosks/device/payments',
              token: deviceToken,
              body: {
                'orderId': createdOrder!.id,
                'method': _lastMethod,
                'bank': ?_lastBank,
              },
            )
            as Map<String, dynamic>;
    payment = KioskPayment.fromJson(paymentPayload);
    _startPaymentPolling();
  }

  /// Tagihan lama tidak berlaku lagi (menurut server) → tagihan baru untuk
  /// order yang SAMA (server membuat percobaan baru; mesin tetap ditahan).
  Future<void> renewPayment() async {
    if (createdOrder == null || loading) return;
    await _run(_requestPayment);
  }

  Future<void> submitWalletCheckout({
    required String customerLookup,
    required String pin,
    String? voucherCode,
  }) async {
    if (selectedService == null ||
        selectedMachine == null ||
        terminal == null) {
      return;
    }
    if (customerLookup.trim().isEmpty) {
      error = 'No HP atau kode member wajib diisi untuk pembayaran wallet.';
      notifyListeners();
      return;
    }
    if (!RegExp(r'^\d{6}$').hasMatch(pin.trim())) {
      error = 'Masukkan PIN wallet 6 digit.';
      notifyListeners();
      return;
    }
    await _run(() async {
      await _cancelUnpaidOrder();
      final payload =
          await _api.post(
                '/kiosks/device/checkout',
                token: deviceToken,
                body: {
                  'customerLookup': customerLookup.trim(),
                  'pin': pin.trim(),
                  'deviceId': selectedMachine!.deviceId,
                  'items': [
                    {
                      'serviceId': selectedService!.serviceId,
                      'quantity': 1,
                      'machineType': selectedMachine!.isWasher
                          ? 'WASHER'
                          : 'DRYER',
                      'notes':
                          'Mesin ${selectedMachine!.name} (${selectedMachine!.deviceCode})',
                    },
                  ],
                  if (voucherCode != null && voucherCode.trim().isNotEmpty)
                    'voucherCode': voucherCode.trim(),
                },
              )
              as Map<String, dynamic>;
      createdOrder = CreatedOrder.fromCheckout(payload);
      payment = null;
      completedPaymentMethod = 'Wallet';
      appliedPromo = voucherCode?.trim().isNotEmpty == true
          ? voucherCode!.trim()
          : null;
      stage = KioskStage.success;
      _startMachinePolling();
    });
  }

  /// Batalkan order kiosk yang belum dibayar (melepas mesin). Best-effort.
  Future<void> _cancelUnpaidOrder() async {
    final order = createdOrder;
    if (order == null || order.id.isEmpty) return;
    if (completedPaymentMethod != null || (payment?.isPaid ?? false)) return;
    _paymentTimer?.cancel();
    createdOrder = null;
    payment = null;
    try {
      await _api.post(
        '/kiosks/device/orders/${order.id}/cancel',
        token: deviceToken,
      );
    } catch (_) {
      // Abaikan: booking HOLD tetap kedaluwarsa sendiri di server.
    }
  }

  void _startMachinePolling() {
    _machineTimer?.cancel();
    machineCommandStatus = null;
    machineStatusTimedOut = false;
    _machinePolls = 0;
    _checkMachineStatus();
    _machineTimer = Timer.periodic(
      const Duration(seconds: 3),
      (_) => _checkMachineStatus(),
    );
  }

  Future<void> _checkMachineStatus() async {
    final order = createdOrder;
    if (order == null || order.id.isEmpty) return;
    _machinePolls++;
    try {
      final payload =
          await _api.get(
                '/kiosks/device/orders/${order.id}/machine-status',
                token: deviceToken,
              )
              as Map<String, dynamic>;
      machineCommandStatus = payload['commandStatus'] as String?;
    } catch (_) {
      // Coba lagi pada polling berikutnya.
    }
    // MANUAL: mesin belum terhubung IoT — pelanggan menyalakan sendiri.
    final done = const {
      'RUNNING',
      'MANUAL',
      'COMPLETED',
      'FAILED',
    }.contains(machineCommandStatus);
    if (done || _machinePolls >= 40) {
      machineStatusTimedOut = !done;
      _machineTimer?.cancel();
    }
    notifyListeners();
  }

  /// Minta server menyalakan ulang mesin (order sudah dibayar; dibatasi server).
  Future<void> retryMachineStart() async {
    final order = createdOrder;
    if (order == null || order.id.isEmpty || machineRetrying) return;
    machineRetrying = true;
    error = null;
    notifyListeners();
    try {
      await _api.post(
        '/kiosks/device/orders/${order.id}/machine-start',
        token: deviceToken,
      );
      _startMachinePolling();
    } on ApiException catch (exception) {
      error = exception.message;
    } catch (_) {
      error = 'Gagal menghubungi server. Coba lagi.';
    } finally {
      machineRetrying = false;
      notifyListeners();
    }
  }

  void _startPaymentPolling() {
    _paymentTimer?.cancel();
    _paymentTimer = Timer.periodic(
      const Duration(seconds: 3),
      (_) => _checkPayment(),
    );
  }

  Future<void> _checkPayment() async {
    if (payment == null || _paymentChecking) return;
    _paymentChecking = true;
    try {
      final payload = await _api.get(
        '/kiosks/device/payments/${payment!.paymentNumber}/status',
        token: deviceToken,
      );
      payment = KioskPayment.fromJson(payload as Map<String, dynamic>);
      if (payment!.isPaid) {
        _paymentTimer?.cancel();
        if (stage != KioskStage.success) {
          stage = KioskStage.success;
          _startMachinePolling();
        }
      } else if (payment!.isEnded) {
        // Server menyatakan tagihan berakhir → hentikan polling.
        _paymentTimer?.cancel();
      }
      notifyListeners();
    } catch (_) {
      // Abaikan error polling sesaat; percobaan berikutnya akan mengulang.
    } finally {
      _paymentChecking = false;
    }
  }

  Future<void> checkPaymentNow() => _checkPayment();

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
    _cancelUnpaidOrder();
    _resetOrderState();
    stage = KioskStage.welcome;
    notifyListeners();
  }

  void _resetOrderState() {
    _paymentTimer?.cancel();
    _machineTimer?.cancel();
    machineCommandStatus = null;
    machineStatusTimedOut = false;
    machines = const [];
    occupancy = null;
    selectedMachine = null;
    selectedService = null;
    appliedPromo = null;
    createdOrder = null;
    quote = null;
    payment = null;
    completedPaymentMethod = null;
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
    _machineTimer?.cancel();
    super.dispose();
  }
}
