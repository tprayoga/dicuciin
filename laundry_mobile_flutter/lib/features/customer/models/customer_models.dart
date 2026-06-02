class CustomerProfile {
  CustomerProfile({
    required this.id,
    required this.memberCode,
    this.hasWalletPin = false,
    this.occupation,
    this.wallet,
  });

  final String id;
  final String memberCode;
  final bool hasWalletPin;

  /// Kategori occupancy (Pekerja / Anak Kos / Ibu Rumah Tangga / Laundry Kiloan).
  final String? occupation;
  final WalletData? wallet;

  factory CustomerProfile.fromJson(Map<String, dynamic> json) {
    return CustomerProfile(
      id: json['id'] as String,
      memberCode: (json['memberCode'] as String?) ?? '-',
      hasWalletPin: (json['hasWalletPin'] as bool?) ?? false,
      occupation: json['occupation'] as String?,
      wallet: json['wallet'] is Map<String, dynamic>
          ? WalletData.fromJson(json['wallet'] as Map<String, dynamic>)
          : null,
    );
  }
}

class WalletData {
  WalletData({
    required this.id,
    required this.balance,
    required this.transactions,
  });

  final String id;
  final double balance;
  final List<WalletTransaction> transactions;

  factory WalletData.fromJson(Map<String, dynamic> json) {
    final rawTransactions = json['transactions'];
    return WalletData(
      id: (json['id'] as String?) ?? '',
      balance: _toDouble(json['balance']),
      transactions: rawTransactions is List
          ? rawTransactions
              .whereType<Map<String, dynamic>>()
              .map(WalletTransaction.fromJson)
              .toList()
          : const [],
    );
  }
}

class WalletTransaction {
  WalletTransaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.createdAt,
    this.description,
  });

  final String id;
  final String type;
  final double amount;
  final DateTime createdAt;
  final String? description;

  factory WalletTransaction.fromJson(Map<String, dynamic> json) {
    return WalletTransaction(
      id: (json['id'] as String?) ?? '',
      type: (json['type'] as String?) ?? '-',
      amount: _toDouble(json['amount']),
      createdAt: DateTime.tryParse((json['createdAt'] as String?) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      description: json['description'] as String?,
    );
  }
}

class OrderSummary {
  OrderSummary({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.totalAmount,
    required this.orderDate,
    required this.outletName,
  });

  final String id;
  final String orderNumber;
  final String status;
  final double totalAmount;
  final DateTime orderDate;
  final String outletName;

  factory OrderSummary.fromJson(Map<String, dynamic> json) {
    return OrderSummary(
      id: json['id'] as String,
      orderNumber: (json['orderNumber'] as String?) ?? '-',
      status: (json['status'] as String?) ?? '-',
      totalAmount: _toDouble(json['totalAmount']),
      orderDate: DateTime.tryParse((json['orderDate'] as String?) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      outletName: (json['outlet'] as Map<String, dynamic>?)?['name'] as String? ??
          '-',
    );
  }
}

class PromoSummary {
  PromoSummary({
    required this.id,
    required this.code,
    required this.name,
    required this.type,
    required this.value,
    required this.endDate,
    required this.isActive,
    this.description,
  });

  final String id;
  final String code;
  final String name;
  final String type;
  final double value;
  final DateTime endDate;
  final bool isActive;
  final String? description;

  factory PromoSummary.fromJson(Map<String, dynamic> json) {
    return PromoSummary(
      id: json['id'] as String,
      code: (json['code'] as String?) ?? '-',
      name: (json['name'] as String?) ?? '-',
      type: (json['promoType'] as String?) ?? '-',
      value: _toDouble(json['value']),
      endDate: DateTime.tryParse((json['endDate'] as String?) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      isActive: (json['isActive'] as bool?) ?? false,
      description: json['description'] as String?,
    );
  }
}

class OutletOption {
  OutletOption({
    required this.id,
    required this.name,
    required this.address,
  });

  final String id;
  final String name;
  final String address;

  factory OutletOption.fromJson(Map<String, dynamic> json) {
    return OutletOption(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? '-',
      address: (json['address'] as String?) ?? '-',
    );
  }
}

class ServicePriceOption {
  ServicePriceOption({
    required this.id,
    required this.outletId,
    required this.serviceId,
    required this.serviceName,
    required this.price,
    required this.unit,
    this.machineType,
    this.capacityKg,
    this.estimateMinutes,
  });

  final String id;
  final String outletId;
  final String serviceId;
  final String serviceName;
  final double price;
  final String unit;

  /// Tipe mesin dari katalog Service (mis. WASHER, DRYER, WASHER_DRYER, IRON).
  final String? machineType;
  final double? capacityKg;
  final int? estimateMinutes;

  factory ServicePriceOption.fromJson(Map<String, dynamic> json) {
    final service = json['service'] as Map<String, dynamic>? ?? const {};
    return ServicePriceOption(
      id: json['id'] as String,
      outletId: (json['outletId'] as String?) ?? '',
      serviceId: (json['serviceId'] as String?) ?? '',
      serviceName: (service['name'] as String?) ?? '-',
      price: _toDouble(json['price']),
      unit: (json['unit'] as String?) ?? 'unit',
      machineType: service['machineType'] as String?,
      capacityKg: service['capacityKg'] == null
          ? null
          : _toDouble(service['capacityKg']),
      estimateMinutes: (service['estimateMinutes'] as num?)?.toInt(),
    );
  }
}

class CreatedOrder {
  CreatedOrder({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.totalAmount,
  });

  final String id;
  final String orderNumber;
  final String status;
  final double totalAmount;

  factory CreatedOrder.fromJson(Map<String, dynamic> json) {
    return CreatedOrder(
      id: (json['id'] as String?) ?? '',
      orderNumber: (json['orderNumber'] as String?) ?? '-',
      status: (json['status'] as String?) ?? '-',
      totalAmount: _toDouble(json['totalAmount']),
    );
  }
}

class OrderDetail {
  OrderDetail({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.orderDate,
    required this.subtotal,
    required this.discountAmount,
    required this.deliveryFee,
    required this.totalAmount,
    required this.items,
    required this.statusLogs,
  });

  final String id;
  final String orderNumber;
  final String status;
  final DateTime orderDate;
  final double subtotal;
  final double discountAmount;
  final double deliveryFee;
  final double totalAmount;
  final List<OrderItemDetail> items;
  final List<OrderStatusLogEntry> statusLogs;

  factory OrderDetail.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'] as List<dynamic>? ?? const [];
    final rawLogs = json['statusLogs'] as List<dynamic>? ?? const [];

    return OrderDetail(
      id: (json['id'] as String?) ?? '',
      orderNumber: (json['orderNumber'] as String?) ?? '-',
      status: (json['status'] as String?) ?? '-',
      orderDate: DateTime.tryParse((json['orderDate'] as String?) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      subtotal: _toDouble(json['subtotal']),
      discountAmount: _toDouble(json['discountAmount']),
      deliveryFee: _toDouble(json['deliveryFee']),
      totalAmount: _toDouble(json['totalAmount']),
      items: rawItems
          .whereType<Map<String, dynamic>>()
          .map(OrderItemDetail.fromJson)
          .toList(),
      statusLogs: rawLogs
          .whereType<Map<String, dynamic>>()
          .map(OrderStatusLogEntry.fromJson)
          .toList(),
    );
  }
}

class OrderItemDetail {
  OrderItemDetail({
    required this.serviceName,
    required this.quantity,
    required this.unit,
    required this.pricePerUnit,
    required this.subtotal,
  });

  final String serviceName;
  final double quantity;
  final String unit;
  final double pricePerUnit;
  final double subtotal;

  factory OrderItemDetail.fromJson(Map<String, dynamic> json) {
    return OrderItemDetail(
      serviceName: (json['serviceName'] as String?) ?? '-',
      quantity: _toDouble(json['quantity']),
      unit: (json['unit'] as String?) ?? 'unit',
      pricePerUnit: _toDouble(json['pricePerUnit']),
      subtotal: _toDouble(json['subtotal']),
    );
  }
}

class OrderStatusLogEntry {
  OrderStatusLogEntry({
    required this.status,
    required this.createdAt,
    this.notes,
  });

  final String status;
  final DateTime createdAt;
  final String? notes;

  factory OrderStatusLogEntry.fromJson(Map<String, dynamic> json) {
    return OrderStatusLogEntry(
      status: (json['status'] as String?) ?? '-',
      createdAt: DateTime.tryParse((json['createdAt'] as String?) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      notes: json['notes'] as String?,
    );
  }
}

class PaymentProofUploadResult {
  PaymentProofUploadResult({
    required this.orderId,
    required this.filename,
    required this.url,
  });

  final String orderId;
  final String filename;
  final String url;

  factory PaymentProofUploadResult.fromJson(Map<String, dynamic> json) {
    return PaymentProofUploadResult(
      orderId: (json['orderId'] as String?) ?? '',
      filename: (json['filename'] as String?) ?? '',
      url: (json['url'] as String?) ?? '',
    );
  }
}

/// Reservasi mesin dari endpoint `/bookings`.
class MachineBooking {
  MachineBooking({
    required this.id,
    required this.bookingCode,
    required this.status,
    this.deviceName,
    this.deviceCode,
  });

  final String id;
  final String bookingCode;
  final String status;
  final String? deviceName;
  final String? deviceCode;

  factory MachineBooking.fromJson(Map<String, dynamic> json) {
    final device = json['device'] as Map<String, dynamic>?;
    return MachineBooking(
      id: (json['id'] as String?) ?? '',
      bookingCode: (json['bookingCode'] as String?) ?? '-',
      status: (json['status'] as String?) ?? '-',
      deviceName: device?['name'] as String?,
      deviceCode: device?['deviceCode'] as String?,
    );
  }
}

/// Hasil verifikasi scan QR mesin (`POST /bookings/verify`).
class BookingVerifyResult {
  BookingVerifyResult({
    required this.verified,
    required this.status,
    required this.message,
    this.booking,
  });

  final bool verified;
  final String status;
  final String message;
  final MachineBooking? booking;

  factory BookingVerifyResult.fromJson(Map<String, dynamic> json) {
    return BookingVerifyResult(
      verified: json['verified'] == true,
      status: (json['status'] as String?) ?? '-',
      message: (json['message'] as String?) ?? '',
      booking: json['booking'] is Map<String, dynamic>
          ? MachineBooking.fromJson(json['booking'] as Map<String, dynamic>)
          : null,
    );
  }
}

/// Statistik member dari `GET /customers/:id/stats`.
class MemberStats {
  MemberStats({
    required this.totalOrders,
    required this.completedOrders,
    required this.totalSpending,
    this.favoriteService,
  });

  final int totalOrders;
  final int completedOrders;
  final double totalSpending;
  final String? favoriteService;

  factory MemberStats.fromJson(Map<String, dynamic> json) {
    return MemberStats(
      totalOrders: (json['totalOrders'] as num?)?.toInt() ?? 0,
      completedOrders: (json['completedOrders'] as num?)?.toInt() ?? 0,
      totalSpending: _toDouble(json['totalSpending']),
      favoriteService: json['favoriteService'] as String?,
    );
  }

  static MemberStats empty() => MemberStats(
        totalOrders: 0,
        completedOrders: 0,
        totalSpending: 0,
      );
}

/// Banner/pop-up terkelola admin dari `GET /banners/active`.
class AppBanner {
  AppBanner({
    required this.id,
    required this.title,
    required this.imageUrl,
    required this.placement,
    this.linkUrl,
    this.ctaLabel,
    this.promoCode,
    this.promoName,
  });

  final String id;
  final String title;
  final String imageUrl;

  /// 'HOME_POPUP' atau 'HOME_CAROUSEL'.
  final String placement;
  final String? linkUrl;
  final String? ctaLabel;

  /// Bila banner ditautkan ke sebuah promo, kode & nama promonya.
  final String? promoCode;
  final String? promoName;

  bool get hasPromo => (promoCode ?? '').isNotEmpty;

  factory AppBanner.fromJson(Map<String, dynamic> json) {
    final promo = json['promo'] as Map<String, dynamic>?;
    return AppBanner(
      id: json['id'] as String,
      title: (json['title'] as String?) ?? '',
      imageUrl: (json['imageUrl'] as String?) ?? '',
      placement: (json['placement'] as String?) ?? 'HOME_CAROUSEL',
      linkUrl: json['linkUrl'] as String?,
      ctaLabel: json['ctaLabel'] as String?,
      promoCode: promo?['code'] as String?,
      promoName: promo?['name'] as String?,
    );
  }
}

/// Hasil validasi kode promo dari `POST /promos/validate`.
class PromoValidation {
  PromoValidation({required this.discount, required this.isValid});

  final double discount;
  final bool isValid;

  factory PromoValidation.fromJson(Map<String, dynamic> json) {
    return PromoValidation(
      discount: _toDouble(json['discount']),
      isValid: json['isValid'] == true,
    );
  }
}

class CreateOrderItemInput {
  CreateOrderItemInput({
    required this.serviceId,
    required this.quantity,
    this.notes,
  });

  final String serviceId;
  final double quantity;
  final String? notes;
}

double _toDouble(dynamic value) {
  if (value is int) return value.toDouble();
  if (value is double) return value;
  if (value is String) return double.tryParse(value) ?? 0;
  return 0;
}
