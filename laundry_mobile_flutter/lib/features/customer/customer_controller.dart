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

  bool get isLoading => _isLoading;
  bool get isSubmittingOrder => _isSubmittingOrder;
  bool get isUploadingPaymentProof => _isUploadingPaymentProof;
  bool get isCancellingOrder => _isCancellingOrder;
  String? get errorMessage => _errorMessage;
  WalletData? get wallet => _wallet;
  List<OrderSummary> get orders => _orders;
  List<PromoSummary> get promos => _promos;

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

    try {
      final results = await Future.wait([
        _customerService.getWallet(customerId: customerId, accessToken: accessToken),
        _customerService.getOrders(customerId: customerId, accessToken: accessToken),
        _customerService.getPromos(accessToken: accessToken),
      ]);

      _wallet = results[0] as WalletData;
      _orders = results[1] as List<OrderSummary>;
      _promos = results[2] as List<PromoSummary>;
    } on ApiException catch (e) {
      _errorMessage = e.message;
    } catch (_) {
      _errorMessage = 'Gagal memuat data customer.';
    } finally {
      _isLoading = false;
      notifyListeners();
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
