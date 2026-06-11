double _money(dynamic value) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

class StaffUser {
  const StaffUser({required this.id, required this.name, required this.role});

  final String id;
  final String name;
  final String role;

  factory StaffUser.fromJson(Map<String, dynamic> json) => StaffUser(
    id: json['id'] as String,
    name: (json['name'] as String?) ?? 'Staff',
    role: (json['role'] as String?) ?? '-',
  );
}

class Outlet {
  const Outlet({required this.id, required this.name, required this.code});

  final String id;
  final String name;
  final String code;

  factory Outlet.fromJson(Map<String, dynamic> json) => Outlet(
    id: json['id'] as String,
    name: (json['name'] as String?) ?? '-',
    code: (json['code'] as String?) ?? '-',
  );
}

class KioskTerminal {
  const KioskTerminal({
    required this.id,
    required this.code,
    required this.name,
    required this.status,
    required this.outlet,
    this.location,
  });

  final String id;
  final String code;
  final String name;
  final String status;
  final Outlet outlet;
  final String? location;

  factory KioskTerminal.fromJson(Map<String, dynamic> json) => KioskTerminal(
    id: json['id'] as String,
    code: (json['kioskCode'] as String?) ?? '-',
    name: (json['name'] as String?) ?? 'Kiosk',
    status: (json['status'] as String?) ?? 'ACTIVE',
    location: json['location'] as String?,
    outlet: Outlet.fromJson(
      json['outlet'] as Map<String, dynamic>? ?? const {},
    ),
  );
}

class ServicePrice {
  const ServicePrice({
    required this.serviceId,
    required this.name,
    required this.price,
    required this.unit,
    required this.category,
    this.estimateMinutes,
  });

  final String serviceId;
  final String name;
  final double price;
  final String unit;
  final String category;
  final int? estimateMinutes;

  factory ServicePrice.fromJson(Map<String, dynamic> json) {
    final service =
        json['service'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    return ServicePrice(
      serviceId: (json['serviceId'] as String?) ?? '',
      name: (service['name'] as String?) ?? 'Layanan',
      price: _money(json['price']),
      unit: (json['unit'] as String?) ?? 'item',
      category: (service['serviceType'] as String?) ?? 'LAUNDRY',
      estimateMinutes: (service['estimateMinutes'] as num?)?.toInt(),
    );
  }
}

class CartLine {
  const CartLine({required this.service, required this.quantity});

  final ServicePrice service;
  final int quantity;

  double get subtotal => service.price * quantity;

  CartLine copyWith({int? quantity}) =>
      CartLine(service: service, quantity: quantity ?? this.quantity);
}

class CreatedOrder {
  const CreatedOrder({
    required this.id,
    required this.orderNumber,
    required this.total,
    required this.status,
  });

  final String id;
  final String orderNumber;
  final double total;
  final String status;

  factory CreatedOrder.fromJson(Map<String, dynamic> json) => CreatedOrder(
    id: json['id'] as String,
    orderNumber: (json['orderNumber'] as String?) ?? '-',
    total: _money(json['totalAmount']),
    status: (json['status'] as String?) ?? '-',
  );
}
