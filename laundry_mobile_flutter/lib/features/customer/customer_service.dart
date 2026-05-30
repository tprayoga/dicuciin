import 'dart:convert';

import '../../core/network/api_client.dart';
import 'models/customer_models.dart';

class CustomerService {
  CustomerService(this._apiClient);

  final ApiClient _apiClient;

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
      queryParameters: {
        'page': '$page',
        'limit': '$limit',
      },
    );

    final list = (payload as Map<String, dynamic>)['data'] as List<dynamic>? ?? const [];
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
      queryParameters: {
        'page': '$page',
        'limit': '$limit',
      },
    );

    final list = (payload as Map<String, dynamic>)['data'] as List<dynamic>? ?? const [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(PromoSummary.fromJson)
        .where((promo) => promo.isActive)
        .toList();
  }

  Future<List<OutletOption>> getOutlets({required String accessToken}) async {
    final payload = await _apiClient.get(
      '/outlets',
      headers: {'Authorization': 'Bearer $accessToken'},
      queryParameters: const {'page': '1', 'limit': '100'},
    );

    final list = (payload as Map<String, dynamic>)['data'] as List<dynamic>? ?? const [];
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

    final list = payload as List<dynamic>? ?? const [];
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
            if (item.notes != null && item.notes!.isNotEmpty) 'notes': item.notes,
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
}
