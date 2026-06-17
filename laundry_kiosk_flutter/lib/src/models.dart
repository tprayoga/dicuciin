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
    this.machineType,
    this.capacityKg,
    this.estimateMinutes,
  });

  final String serviceId;
  final String name;
  final double price;
  final String unit;
  final String category;
  final String? machineType;
  final double? capacityKg;
  final int? estimateMinutes;

  /// True bila layanan ini untuk mesin pengering (berdasarkan machineType).
  bool get isDryer => (machineType ?? '').toUpperCase().contains('DRY');

  factory ServicePrice.fromJson(Map<String, dynamic> json) {
    final service =
        json['service'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    return ServicePrice(
      serviceId: (json['serviceId'] as String?) ?? '',
      name: (service['name'] as String?) ?? 'Layanan',
      price: _money(json['price']),
      unit: (json['unit'] as String?) ?? 'item',
      category: (service['serviceType'] as String?) ?? 'LAUNDRY',
      machineType: service['machineType'] as String?,
      capacityKg: (service['capacityKg'] as num?)?.toDouble(),
      estimateMinutes: (service['estimateMinutes'] as num?)?.toInt(),
    );
  }
}

/// Sebuah mesin (cuci/pengering) di outlet kiosk + status ketersediaannya.
class Machine {
  const Machine({
    required this.deviceId,
    required this.deviceCode,
    required this.name,
    required this.type,
    required this.status,
    required this.bookable,
  });

  final String deviceId;
  final String deviceCode;
  final String name;
  final String type; // WASHING_MACHINE / DRYER_MACHINE
  final String status; // AVAILABLE / RESERVED / IN_USE / OFFLINE
  final bool bookable;

  bool get isWasher => type.toUpperCase().contains('WASH');

  factory Machine.fromJson(Map<String, dynamic> json) => Machine(
    deviceId: (json['deviceId'] as String?) ?? '',
    deviceCode: (json['deviceCode'] as String?) ?? '',
    name: (json['name'] as String?) ?? 'Mesin',
    type: (json['type'] as String?) ?? 'WASHING_MACHINE',
    status: (json['status'] as String?) ?? 'OFFLINE',
    bookable: json['bookable'] == true,
  );
}

/// Ringkasan keramaian mesin sebuah outlet.
class Occupancy {
  const Occupancy({
    required this.total,
    required this.available,
    required this.level,
    required this.remark,
  });

  final int total;
  final int available;
  final String level; // none/low/medium/high/full
  final String remark;

  factory Occupancy.fromJson(Map<String, dynamic> json) => Occupancy(
    total: (json['total'] as num?)?.toInt() ?? 0,
    available: (json['available'] as num?)?.toInt() ?? 0,
    level: (json['level'] as String?) ?? 'none',
    remark: (json['remark'] as String?) ?? '-',
  );
}

/// Daftar mesin outlet + ringkasan keramaian.
class OutletMachines {
  const OutletMachines({required this.machines, this.occupancy});

  final List<Machine> machines;
  final Occupancy? occupancy;

  factory OutletMachines.fromJson(Map<String, dynamic> json) {
    final list = json['machines'] as List<dynamic>? ?? const [];
    final occ = json['occupancy'] as Map<String, dynamic>?;
    return OutletMachines(
      machines: list
          .whereType<Map<String, dynamic>>()
          .map(Machine.fromJson)
          .toList(),
      occupancy: occ == null ? null : Occupancy.fromJson(occ),
    );
  }
}

/// Tagihan pembayaran (QRIS/VA) untuk order kiosk.
class KioskPayment {
  const KioskPayment({
    required this.paymentNumber,
    required this.method,
    required this.amount,
    required this.status,
    this.qrString,
    this.vaNumber,
    this.bank,
    this.expiresAt,
  });

  final String paymentNumber;
  final String method; // QRIS / TRANSFER
  final double amount;
  final String status; // PENDING / PAID / FAILED / EXPIRED
  final String? qrString;
  final String? vaNumber;
  final String? bank;
  final String? expiresAt;

  bool get isPaid => status == 'PAID';

  factory KioskPayment.fromJson(Map<String, dynamic> json) => KioskPayment(
    paymentNumber: (json['paymentNumber'] as String?) ?? '-',
    method: (json['method'] as String?) ?? 'QRIS',
    amount: _money(json['amount']),
    status: (json['status'] as String?) ?? 'PENDING',
    qrString: json['qrString'] as String?,
    vaNumber: json['vaNumber'] as String?,
    bank: json['bank'] as String?,
    expiresAt: json['expiresAt'] as String?,
  );
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

class PricingQuote {
  const PricingQuote({
    required this.basePrice,
    required this.happyHourDiscount,
    required this.voucherDiscount,
    required this.finalAmount,
    required this.pointsToEarn,
  });

  final double basePrice;
  final double happyHourDiscount;
  final double voucherDiscount;
  final double finalAmount;
  final int pointsToEarn;

  factory PricingQuote.fromJson(Map<String, dynamic> json) => PricingQuote(
    basePrice: _money(json['basePrice']),
    happyHourDiscount: _money(json['happyHourDiscount']),
    voucherDiscount: _money(json['voucherDiscount']),
    finalAmount: _money(json['finalAmount']),
    pointsToEarn: (json['pointsToEarn'] as num?)?.toInt() ?? 0,
  );
}
