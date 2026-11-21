import 'package:flutter_test/flutter_test.dart';
import 'package:laundry_mobile_flutter/features/customer/models/customer_models.dart';

void main() {
  group('Batch 3 — model order & harga dari server', () {
    test('OrderDetail membaca mesin, jadwal, diskon voucher/happy hour & estimasi', () {
      final d = OrderDetail.fromJson({
        'id': 'o1',
        'orderNumber': 'ORD-1',
        'status': 'DRAFT',
        'orderDate': '2026-11-21T01:00:00.000Z',
        'outletId': 'out-1',
        'outlet': {'name': 'Outlet A'},
        'subtotal': '30000',
        'discountAmount': '9000',
        'deliveryFee': '0',
        'totalAmount': '21000',
        'items': [
          {'serviceName': 'Kering', 'quantity': 3, 'unit': 'CYCLE', 'pricePerUnit': '10000', 'subtotal': '30000'},
        ],
        'statusLogs': [],
        'machineBooking': {
          'status': 'HOLD',
          'scheduledAt': null,
          'device': {'name': 'Dryer 1', 'deviceCode': 'D-1', 'deviceType': 'DRYER_MACHINE'},
        },
        'pricingSnapshot': {'version': 1, 'voucherDiscount': 5000, 'happyHourDiscount': 4000, 'estimatedMinutes': 120},
      });
      expect(d.isUnpaid, isTrue);
      expect(d.machineName, 'Dryer 1');
      expect(d.machineIsDryer, isTrue);
      expect(d.voucherDiscount, 5000);
      expect(d.happyHourDiscount, 4000);
      expect(d.estimatedMinutes, 120);
      expect(d.outletName, 'Outlet A');
    });

    test('order lama tanpa booking/snapshot tetap terbaca; PAID bukan "belum dibayar"', () {
      final d = OrderDetail.fromJson({'id': 'o2', 'status': 'PAID', 'items': [], 'statusLogs': []});
      expect(d.isUnpaid, isFalse);
      expect(d.machineName, isNull);
      expect(d.estimatedMinutes, isNull);
    });

    test('PricingQuote membaca estimatedMinutes dari server', () {
      final q = PricingQuote.fromJson({'basePrice': 20000, 'finalAmount': 16000, 'estimatedMinutes': 80});
      expect(q.estimatedMinutes, 80);
      expect(PricingQuote.fromJson({'finalAmount': 1}).estimatedMinutes, isNull);
    });
  });
}
