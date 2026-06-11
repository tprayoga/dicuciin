import 'package:flutter/foundation.dart';

import '../../core/network/api_exception.dart';
import '../auth/auth_controller.dart';
import '../auth/models/auth_models.dart';
import 'customer_service.dart';
import 'models/customer_models.dart';

class CustomerController extends ChangeNotifier {
  CustomerController({required CustomerService customerService})
    : _customerService = customerService;

  final CustomerService _customerService;

  // Kunci untuk mendeteksi perubahan auth → muat ulang dashboard sekali.
  String? _loadedForCustomerId;
  String? _loadedToken;

  /// Dipanggil ProxyProvider tiap auth berubah. Memuat dashboard begitu profil
  /// customer tersedia (login maupun sesi dipulihkan), tanpa bergantung pada
  /// timing initState halaman.
  void syncFromAuth(AuthController auth) {
    final user = auth.user;
    final token = auth.accessToken;
    final customerId = user?.customer?.id;

    if (user == null || token == null || customerId == null) {
      if (_loadedForCustomerId != null) {
        _loadedForCustomerId = null;
        _loadedToken = null;
        clear();
      }
      return;
    }

    if (customerId != _loadedForCustomerId || token != _loadedToken) {
      _loadedForCustomerId = customerId;
      _loadedToken = token;
      Future.microtask(() => loadDashboard(user: user, accessToken: token));
    }
  }

  bool _isLoading = false;
  bool _isSubmittingOrder = false;
  bool _isUploadingPaymentProof = false;
  bool _isCancellingOrder = false;
  bool _isRefundingOrder = false;
  String? _errorMessage;
  WalletData? _wallet;
  List<OrderSummary> _orders = const [];
  List<MachineBooking> _activeBookings = const [];
  List<PromoSummary> _promos = const [];
  List<AppBanner> _carouselBanners = const [];
  List<AppBanner> _popupBanners = const [];
  bool _popupConsumed = false;
  MemberStats? _stats;

  bool get isLoading => _isLoading;
  bool get isSubmittingOrder => _isSubmittingOrder;
  bool get isUploadingPaymentProof => _isUploadingPaymentProof;
  bool get isCancellingOrder => _isCancellingOrder;
  bool get isRefundingOrder => _isRefundingOrder;
  String? get errorMessage => _errorMessage;
  WalletData? get wallet => _wallet;
  List<OrderSummary> get orders => _orders;
  List<MachineBooking> get activeBookings => _activeBookings;
  List<PromoSummary> get promos => _promos;
  List<AppBanner> get carouselBanners => _carouselBanners;

  /// Banner pop-up yang belum ditampilkan di sesi ini. Setelah diambil sekali,
  /// kosong agar pop-up tidak muncul berulang.
  List<AppBanner> get popupBanners => _popupConsumed ? const [] : _popupBanners;

  /// Tandai pop-up sudah ditampilkan (tidak muncul lagi sesi ini).
  void markPopupShown() => _popupConsumed = true;

  MemberStats get stats => _stats ?? MemberStats.empty();

  Future<void> loadDashboard({
    required AppUser user,
    required String accessToken,
  }) async {
    final customerId = user.customer?.id;
    if (customerId == null) {
      _errorMessage = 'Akun ini belum terhubung ke profil customer.';
      notifyListeners();
      return;
    }

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    // Tiap bagian dimuat mandiri: kegagalan satu endpoint (mis. server belum
    // ter-restart untuk fitur baru) tidak mengosongkan bagian lain.
    final walletF = _guard(
      () => _customerService.getWallet(
        customerId: customerId,
        accessToken: accessToken,
      ),
    );
    final ordersF = _guard(
      () => _customerService.getOrders(
        customerId: customerId,
        accessToken: accessToken,
      ),
    );
    final bookingsF = _guard(
      () => _customerService.getActiveBookings(accessToken: accessToken),
    );
    final promosF = _guard(
      () => _customerService.getPromos(accessToken: accessToken),
    );
    final carouselF = _guard(
      () => _customerService.getBanners(
        accessToken: accessToken,
        placement: 'HOME_CAROUSEL',
      ),
    );
    final popupF = _guard(
      () => _customerService.getBanners(
        accessToken: accessToken,
        placement: 'HOME_POPUP',
      ),
    );
    final statsF = _guard(
      () => _customerService.getMemberStats(
        customerId: customerId,
        accessToken: accessToken,
      ),
    );

    _wallet = await walletF ?? _wallet;
    _orders = await ordersF ?? _orders;
    _activeBookings = await bookingsF ?? _activeBookings;
    _promos = await promosF ?? _promos;
    _carouselBanners = await carouselF ?? _carouselBanners;
    _popupBanners = await popupF ?? _popupBanners;
    _stats = await statsF ?? _stats;

    _isLoading = false;
    notifyListeners();
  }

  /// Jalankan [fn], kembalikan null bila gagal (tanpa mematikan fetch lain).
  Future<T?> _guard<T>(Future<T> Function() fn) async {
    try {
      return await fn();
    } catch (_) {
      return null;
    }
  }

  Future<List<OutletOption>> getOutlets({required String accessToken}) async {
    try {
      return await _customerService.getOutlets(accessToken: accessToken);
    } on ApiException catch (e) {
      _errorMessage = e.message;
      notifyListeners();
      return const [];
    } catch (_) {
      _errorMessage = 'Gagal memuat outlet.';
      notifyListeners();
      return const [];
    }
  }

  Future<List<ServicePriceOption>> getServicePrices({
    required String accessToken,
    required String outletId,
  }) async {
    try {
      return await _customerService.getServicePrices(
        accessToken: accessToken,
        outletId: outletId,
      );
    } on ApiException catch (e) {
      _errorMessage = e.message;
      notifyListeners();
      return const [];
    } catch (_) {
      _errorMessage = 'Gagal memuat layanan.';
      notifyListeners();
      return const [];
    }
  }

  /// Verifikasi pemesan via scan QR mesin. Melempar [ApiException] (mis. mesin
  /// dibooking pelanggan lain / belum booking) agar bisa ditampilkan.
  Future<BookingVerifyResult> verifyMachine({
    required String accessToken,
    required String deviceCode,
  }) {
    return _customerService.verifyBooking(
      accessToken: accessToken,
      deviceCode: deviceCode,
    );
  }

  /// Reservasi mesin berdasarkan kode perangkat. [scheduledAt] (ISO) opsional.
  Future<MachineBooking> reserveMachine({
    required String accessToken,
    required String deviceCode,
    String? scheduledAt,
  }) async {
    final booking = await _customerService.reserveBooking(
      accessToken: accessToken,
      deviceCode: deviceCode,
      scheduledAt: scheduledAt,
    );
    _activeBookings = [
      booking,
      ..._activeBookings.where((item) => item.id != booking.id),
    ];
    notifyListeners();
    return booking;
  }

  /// Daftar mesin nyata + keramaian sebuah outlet.
  Future<OutletMachines> getOutletMachines({
    required String accessToken,
    required String outletId,
  }) {
    return _customerService.getOutletMachines(
      accessToken: accessToken,
      outletId: outletId,
    );
  }

  /// Ringkasan keramaian semua outlet (map by outletId).
  Future<Map<String, OutletOccupancy>> getOccupancyMap({
    required String accessToken,
  }) {
    return _customerService.getOccupancyMap(accessToken: accessToken);
  }

  /// Booking aktif milik customer.
  Future<List<MachineBooking>> getActiveBookings({
    required String accessToken,
  }) {
    return _customerService.getActiveBookings(accessToken: accessToken);
  }

  /// Batalkan reservasi yang belum aktif.
  Future<void> cancelBooking({
    required String accessToken,
    required String bookingId,
  }) async {
    await _customerService.cancelBooking(
      accessToken: accessToken,
      bookingId: bookingId,
    );
    _activeBookings = _activeBookings
        .where((booking) => booking.id != bookingId)
        .toList();
    notifyListeners();
  }

  Future<void> refreshOrdersAndBookings({
    required AppUser user,
    required String accessToken,
  }) async {
    final customerId = user.customer?.id;
    if (customerId == null) return;

    final results = await Future.wait([
      _guard(
        () => _customerService.getOrders(
          customerId: customerId,
          accessToken: accessToken,
        ),
      ),
      _guard(
        () => _customerService.getActiveBookings(accessToken: accessToken),
      ),
    ]);

    _orders = (results[0] as List<OrderSummary>?) ?? _orders;
    _activeBookings = (results[1] as List<MachineBooking>?) ?? _activeBookings;
    notifyListeners();
  }

  /// Buat tagihan QRIS/VA via gateway untuk order.
  Future<GatewayPayment> createGatewayPayment({
    required String accessToken,
    required String orderId,
    required String method,
    String? bank,
  }) {
    return _customerService.createGatewayPayment(
      accessToken: accessToken,
      orderId: orderId,
      method: method,
      bank: bank,
    );
  }

  /// Cek status pembayaran gateway (polling).
  Future<GatewayPayment> getPaymentStatus({
    required String accessToken,
    required String paymentNumber,
  }) {
    return _customerService.getPaymentStatus(
      accessToken: accessToken,
      paymentNumber: paymentNumber,
    );
  }

  /// [DEV] Simulasikan pembayaran gateway berhasil.
  Future<void> simulatePayment({
    required String accessToken,
    required String paymentNumber,
  }) {
    return _customerService.simulatePayment(
      accessToken: accessToken,
      paymentNumber: paymentNumber,
    );
  }

  /// Kirim ulasan untuk sebuah order. true bila berhasil; pesan error di
  /// [errorMessage] bila gagal (mis. order sudah diulas).
  Future<bool> submitReview({
    required String accessToken,
    required String orderId,
    required int rating,
    String? comment,
  }) async {
    try {
      await _customerService.submitReview(
        accessToken: accessToken,
        orderId: orderId,
        rating: rating,
        comment: comment,
      );
      return true;
    } on ApiException catch (e) {
      _errorMessage = e.message;
      return false;
    } catch (_) {
      _errorMessage = 'Gagal mengirim ulasan.';
      return false;
    }
  }

  /// Validasi kode promo ke backend. Melempar [ApiException] dengan pesan
  /// alasan (mis. minimum transaksi) agar bisa ditampilkan ke user.
  Future<PromoValidation> validatePromo({
    required AppUser user,
    required String accessToken,
    required String code,
    required int orderAmount,
  }) {
    final customerId = user.customer?.id;
    if (customerId == null) {
      throw StateError('Akun belum terhubung ke profil customer.');
    }
    return _customerService.validatePromo(
      accessToken: accessToken,
      customerId: customerId,
      code: code,
      orderAmount: orderAmount,
    );
  }

  Future<OrderDetail?> getOrderDetail({
    required String accessToken,
    required String orderId,
  }) async {
    try {
      return await _customerService.getOrderDetail(
        accessToken: accessToken,
        orderId: orderId,
      );
    } on ApiException catch (e) {
      _errorMessage = e.message;
      notifyListeners();
      return null;
    } catch (_) {
      _errorMessage = 'Gagal memuat detail order.';
      notifyListeners();
      return null;
    }
  }

  void clear() {
    _isLoading = false;
    _errorMessage = null;
    _wallet = null;
    _orders = const [];
    _activeBookings = const [];
    _promos = const [];
    _carouselBanners = const [];
    _popupBanners = const [];
    _popupConsumed = false;
    _stats = null;
    notifyListeners();
  }

  Future<CreatedOrder?> createOrder({
    required AppUser user,
    required String accessToken,
    required String outletId,
    required List<CreateOrderItemInput> items,
    String? promoCode,
    String? notes,
  }) async {
    final customerId = user.customer?.id;
    if (customerId == null) {
      _errorMessage = 'Akun ini belum terhubung ke profil customer.';
      notifyListeners();
      return null;
    }

    _isSubmittingOrder = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final createdOrder = await _customerService.createOrder(
        accessToken: accessToken,
        customerId: customerId,
        outletId: outletId,
        items: items,
        promoCode: promoCode,
        notes: notes,
      );

      await loadDashboard(user: user, accessToken: accessToken);
      return createdOrder;
    } on ApiException catch (e) {
      _errorMessage = e.message;
      return null;
    } catch (_) {
      _errorMessage = 'Gagal membuat order.';
      return null;
    } finally {
      _isSubmittingOrder = false;
      notifyListeners();
    }
  }

  Future<PaymentProofUploadResult?> uploadPaymentProof({
    required String accessToken,
    required String orderId,
    required String imagePath,
  }) async {
    _isUploadingPaymentProof = true;
    _errorMessage = null;
    notifyListeners();

    try {
      return await _customerService.uploadPaymentProof(
        accessToken: accessToken,
        orderId: orderId,
        imagePath: imagePath,
      );
    } on ApiException catch (e) {
      _errorMessage = e.message;
      return null;
    } catch (_) {
      _errorMessage = 'Gagal upload bukti pembayaran.';
      return null;
    } finally {
      _isUploadingPaymentProof = false;
      notifyListeners();
    }
  }

  Future<OrderDetail?> cancelOrder({
    required String accessToken,
    required String orderId,
    required String cancelReason,
  }) async {
    _isCancellingOrder = true;
    _errorMessage = null;
    notifyListeners();

    try {
      return await _customerService.cancelOrder(
        accessToken: accessToken,
        orderId: orderId,
        cancelReason: cancelReason,
      );
    } on ApiException catch (e) {
      _errorMessage = e.message;
      return null;
    } catch (_) {
      _errorMessage = 'Gagal membatalkan order.';
      return null;
    } finally {
      _isCancellingOrder = false;
      notifyListeners();
    }
  }

  Future<int?> refundOrder({
    required AppUser user,
    required String accessToken,
    required String orderId,
    required String reason,
  }) async {
    final customerId = user.customer?.id;
    if (customerId == null) {
      _errorMessage = 'Akun ini belum terhubung ke profil customer.';
      notifyListeners();
      return null;
    }

    _isRefundingOrder = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final balance = await _customerService.refundOrderToWallet(
        accessToken: accessToken,
        customerId: customerId,
        orderId: orderId,
        reason: reason,
      );
      await refreshOrdersAndBookings(user: user, accessToken: accessToken);
      return balance;
    } on ApiException catch (e) {
      _errorMessage = e.message;
      return null;
    } catch (_) {
      _errorMessage = 'Refund gagal diproses.';
      return null;
    } finally {
      _isRefundingOrder = false;
      notifyListeners();
    }
  }
}
