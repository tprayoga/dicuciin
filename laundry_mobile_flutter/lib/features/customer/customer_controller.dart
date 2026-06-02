import 'package:flutter/foundation.dart';

import '../../core/network/api_exception.dart';
import '../auth/models/auth_models.dart';
import 'customer_service.dart';
import 'models/customer_models.dart';

class CustomerController extends ChangeNotifier {
  CustomerController({required CustomerService customerService})
      : _customerService = customerService;

  final CustomerService _customerService;

  bool _isLoading = false;
  bool _isSubmittingOrder = false;
  bool _isUploadingPaymentProof = false;
  bool _isCancellingOrder = false;
  String? _errorMessage;
  WalletData? _wallet;
  List<OrderSummary> _orders = const [];
  List<PromoSummary> _promos = const [];
  List<AppBanner> _carouselBanners = const [];
  List<AppBanner> _popupBanners = const [];
  bool _popupConsumed = false;
  MemberStats? _stats;

  bool get isLoading => _isLoading;
  bool get isSubmittingOrder => _isSubmittingOrder;
  bool get isUploadingPaymentProof => _isUploadingPaymentProof;
  bool get isCancellingOrder => _isCancellingOrder;
  String? get errorMessage => _errorMessage;
  WalletData? get wallet => _wallet;
  List<OrderSummary> get orders => _orders;
  List<PromoSummary> get promos => _promos;
  List<AppBanner> get carouselBanners => _carouselBanners;

  /// Banner pop-up yang belum ditampilkan di sesi ini. Setelah diambil sekali,
  /// kosong agar pop-up tidak muncul berulang.
  List<AppBanner> get popupBanners => _popupConsumed ? const [] : _popupBanners;

  /// Tandai pop-up sudah ditampilkan (tidak muncul lagi sesi ini).
  void markPopupShown() => _popupConsumed = true;

  MemberStats get stats => _stats ?? MemberStats.empty();

  Future<void> loadDashboard({required AppUser user, required String accessToken}) async {
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
    final walletF = _guard(() => _customerService.getWallet(
        customerId: customerId, accessToken: accessToken));
    final ordersF = _guard(() => _customerService.getOrders(
        customerId: customerId, accessToken: accessToken));
    final promosF =
        _guard(() => _customerService.getPromos(accessToken: accessToken));
    final carouselF = _guard(() => _customerService.getBanners(
        accessToken: accessToken, placement: 'HOME_CAROUSEL'));
    final popupF = _guard(() => _customerService.getBanners(
        accessToken: accessToken, placement: 'HOME_POPUP'));
    final statsF = _guard(() => _customerService.getMemberStats(
        customerId: customerId, accessToken: accessToken));

    _wallet = await walletF ?? _wallet;
    _orders = await ordersF ?? _orders;
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

  /// Reservasi mesin berdasarkan kode perangkat hasil scan.
  Future<MachineBooking> reserveMachine({
    required String accessToken,
    required String deviceCode,
  }) {
    return _customerService.reserveBooking(
      accessToken: accessToken,
      deviceCode: deviceCode,
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
}
