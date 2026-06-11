import 'dart:convert';

import '../../core/network/api_client.dart';
import 'models/customer_models.dart';

class CustomerService {
  CustomerService(this._apiClient);

  final ApiClient _apiClient;

  int _moneyToInt(Object? value) {
    if (value is num) return value.round();
    return double.tryParse(value?.toString() ?? '')?.round() ?? 0;
  }

  /// Ambil list dari payload, tahan dua bentuk respons paginated:
  /// (a) sudah berupa List (interceptor menaikkan `data` ke atas), atau
  /// (b) Map `{data: [...], meta}`.
  List<dynamic> _asList(dynamic payload) {
    if (payload is List) return payload;
    if (payload is Map<String, dynamic> && payload['data'] is List) {
      return payload['data'] as List<dynamic>;
    }
    return const [];
  }

  Future<WalletData> getWallet({
    required String customerId,
    required String accessToken,
  }) async {
    final payload = await _apiClient.get(
      '/customers/$customerId/wallet',
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    return WalletData.fromJson(payload as Map<String, dynamic>);
  }

  Future<List<OrderSummary>> getOrders({
    required String customerId,
    required String accessToken,
    int page = 1,
    int limit = 10,
  }) async {
    final payload = await _apiClient.get(
      '/customers/$customerId/orders',
      headers: {'Authorization': 'Bearer $accessToken'},
      queryParameters: {'page': '$page', 'limit': '$limit'},
    );

    final list = _asList(payload);
    return list
        .whereType<Map<String, dynamic>>()
        .map(OrderSummary.fromJson)
        .toList();
  }

  Future<List<PromoSummary>> getPromos({
    required String accessToken,
    int page = 1,
    int limit = 20,
  }) async {
    final payload = await _apiClient.get(
      '/promos',
      headers: {'Authorization': 'Bearer $accessToken'},
      queryParameters: {'page': '$page', 'limit': '$limit'},
    );

    final list = _asList(payload);
    return list
        .whereType<Map<String, dynamic>>()
        .map(PromoSummary.fromJson)
        .where((promo) => promo.isActive)
        .toList();
  }

  /// Verifikasi pemesan via scan QR mesin (deviceCode).
  Future<BookingVerifyResult> verifyBooking({
    required String accessToken,
    required String deviceCode,
  }) async {
    final payload = await _apiClient.post(
      '/bookings/verify',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({'deviceCode': deviceCode}),
    );
    return BookingVerifyResult.fromJson(payload as Map<String, dynamic>);
  }

  /// Reservasi mesin berdasarkan kode perangkat. [scheduledAt] (ISO) opsional —
  /// waktu terjadwal pemakaian.
  Future<MachineBooking> reserveBooking({
    required String accessToken,
    required String deviceCode,
    String? scheduledAt,
  }) async {
    final body = <String, dynamic>{'deviceCode': deviceCode};
    if (scheduledAt != null) body['scheduledAt'] = scheduledAt;
    final payload = await _apiClient.post(
      '/bookings',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode(body),
    );
    return MachineBooking.fromJson(payload as Map<String, dynamic>);
  }

  /// Buat tagihan QRIS/VA via gateway untuk sebuah order.
  Future<GatewayPayment> createGatewayPayment({
    required String accessToken,
    required String orderId,
    required String method, // 'QRIS' | 'VA'
    String? bank,
  }) async {
    final payload = await _apiClient.post(
      '/payments/gateway',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({
        'orderId': orderId,
        'method': method,
        if (bank != null && bank.isNotEmpty) 'bank': bank,
      }),
    );
    return GatewayPayment.fromJson(payload as Map<String, dynamic>);
  }

  /// Cek status pembayaran (untuk polling).
  Future<GatewayPayment> getPaymentStatus({
    required String accessToken,
    required String paymentNumber,
  }) async {
    final payload = await _apiClient.get(
      '/payments/$paymentNumber/status',
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    return GatewayPayment.fromJson(payload as Map<String, dynamic>);
  }

  /// [DEV] Simulasikan pembayaran berhasil (mock gateway).
  Future<void> simulatePayment({
    required String accessToken,
    required String paymentNumber,
  }) async {
    await _apiClient.post(
      '/payments/$paymentNumber/simulate',
      headers: {'Authorization': 'Bearer $accessToken'},
    );
  }

  /// Daftar mesin nyata sebuah outlet + ringkasan keramaian.
  Future<OutletMachines> getOutletMachines({
    required String accessToken,
    required String outletId,
  }) async {
    final payload = await _apiClient.get(
      '/bookings/outlet/$outletId/machines',
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    return OutletMachines.fromJson(payload as Map<String, dynamic>);
  }

  /// Ringkasan keramaian semua outlet → map keyed by outletId.
  Future<Map<String, OutletOccupancy>> getOccupancyMap({
    required String accessToken,
  }) async {
    final payload = await _apiClient.get(
      '/bookings/occupancy',
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    final list = (payload as List).cast<Map<String, dynamic>>();
    return {
      for (final o in list)
        (o['outletId'] as String): OutletOccupancy.fromJson(o),
    };
  }

  /// Booking aktif (RESERVED belum kadaluarsa / IN_USE) milik customer.
  Future<List<MachineBooking>> getActiveBookings({
    required String accessToken,
  }) async {
    final payload = await _apiClient.get(
      '/bookings/active',
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    return (payload as List)
        .map((e) => MachineBooking.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Batalkan reservasi yang belum aktif.
  Future<void> cancelBooking({
    required String accessToken,
    required String bookingId,
  }) async {
    await _apiClient.post(
      '/bookings/$bookingId/cancel',
      headers: {'Authorization': 'Bearer $accessToken'},
    );
  }

  Future<MemberStats> getMemberStats({
    required String customerId,
    required String accessToken,
  }) async {
    final payload = await _apiClient.get(
      '/customers/$customerId/stats',
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    return MemberStats.fromJson(payload as Map<String, dynamic>);
  }

  Future<List<AppBanner>> getBanners({
    required String accessToken,
    required String placement,
  }) async {
    final payload = await _apiClient.get(
      '/banners/active',
      headers: {'Authorization': 'Bearer $accessToken'},
      queryParameters: {'placement': placement},
    );
    final list = _asList(payload);
    return list
        .whereType<Map<String, dynamic>>()
        .map(AppBanner.fromJson)
        .toList();
  }

  Future<void> submitReview({
    required String accessToken,
    required String orderId,
    required int rating,
    String? comment,
  }) async {
    await _apiClient.post(
      '/reviews',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({
        'orderId': orderId,
        'rating': rating,
        'source': 'APP',
        if (comment != null && comment.trim().isNotEmpty)
          'comment': comment.trim(),
      }),
    );
  }

  Future<PromoValidation> validatePromo({
    required String accessToken,
    required String customerId,
    required String code,
    required int orderAmount,
  }) async {
    final payload = await _apiClient.post(
      '/promos/validate',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({
        'code': code,
        'customerId': customerId,
        'orderAmount': orderAmount,
      }),
    );
    return PromoValidation.fromJson(payload as Map<String, dynamic>);
  }

  Future<List<OutletOption>> getOutlets({required String accessToken}) async {
    final payload = await _apiClient.get(
      '/outlets',
      headers: {'Authorization': 'Bearer $accessToken'},
      queryParameters: const {'page': '1', 'limit': '100'},
    );

    final list = _asList(payload);
    return list
        .whereType<Map<String, dynamic>>()
        .map(OutletOption.fromJson)
        .toList();
  }

  Future<List<ServicePriceOption>> getServicePrices({
    required String accessToken,
    required String outletId,
  }) async {
    final payload = await _apiClient.get(
      '/services/prices',
      headers: {'Authorization': 'Bearer $accessToken'},
      queryParameters: {'outletId': outletId},
    );

    final list = _asList(payload);
    return list
        .whereType<Map<String, dynamic>>()
        .map(ServicePriceOption.fromJson)
        .toList();
  }

  Future<CreatedOrder> createOrder({
    required String accessToken,
    required String customerId,
    required String outletId,
    required List<CreateOrderItemInput> items,
    String? promoCode,
    String? notes,
  }) async {
    final payloadItems = items
        .map(
          (item) => {
            'serviceId': item.serviceId,
            'quantity': item.quantity,
            if (item.notes != null && item.notes!.isNotEmpty)
              'notes': item.notes,
          },
        )
        .toList();

    final payload = await _apiClient.post(
      '/orders',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({
        'customerId': customerId,
        'outletId': outletId,
        'sourcePlatform': 'MOBILE_APP',
        'items': payloadItems,
        if (promoCode != null && promoCode.isNotEmpty) 'promoCode': promoCode,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      }),
    );

    return CreatedOrder.fromJson(payload as Map<String, dynamic>);
  }

  Future<OrderDetail> getOrderDetail({
    required String accessToken,
    required String orderId,
  }) async {
    final payload = await _apiClient.get(
      '/orders/$orderId',
      headers: {'Authorization': 'Bearer $accessToken'},
    );
    return OrderDetail.fromJson(payload as Map<String, dynamic>);
  }

  Future<PaymentProofUploadResult> uploadPaymentProof({
    required String accessToken,
    required String orderId,
    required String imagePath,
  }) async {
    final payload = await _apiClient.postMultipart(
      '/uploads/payment/$orderId/proof',
      headers: {'Authorization': 'Bearer $accessToken'},
      fileField: 'file',
      filePath: imagePath,
    );
    return PaymentProofUploadResult.fromJson(payload as Map<String, dynamic>);
  }

  Future<OrderDetail> cancelOrder({
    required String accessToken,
    required String orderId,
    required String cancelReason,
  }) async {
    final payload = await _apiClient.post(
      '/orders/$orderId/cancel',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({'cancelReason': cancelReason}),
    );
    return OrderDetail.fromJson(payload as Map<String, dynamic>);
  }

  Future<int> refundOrderToWallet({
    required String accessToken,
    required String customerId,
    required String orderId,
    required String reason,
  }) async {
    final payload = await _apiClient.post(
      '/wallets/customer/$customerId/refund',
      headers: {'Authorization': 'Bearer $accessToken'},
      body: jsonEncode({'orderId': orderId, 'description': reason}),
    );
    final wallet =
        (payload as Map<String, dynamic>)['wallet'] as Map<String, dynamic>?;
    return _moneyToInt(wallet?['balance']);
  }
}
