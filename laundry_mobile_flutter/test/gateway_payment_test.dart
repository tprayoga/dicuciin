import 'package:flutter_test/flutter_test.dart';
import 'package:laundry_mobile_flutter/features/customer/models/customer_models.dart';

void main() {
  group('GatewayPayment (Batch 2: status & kedaluwarsa dari server)', () {
    test('membaca secondsRemaining & canRetry dari server', () {
      final p = GatewayPayment.fromJson({
        'paymentNumber': 'PG-ORD-1-2',
        'method': 'QRIS',
        'amount': 10000,
        'status': 'PENDING',
        'secondsRemaining': 873,
        'canRetry': false,
      });
      expect(p.isPending, isTrue);
      expect(p.secondsRemaining, 873);
      expect(p.canRetry, isFalse);
    });

    test('EXPIRED dari server → bisa buat tagihan baru; respons lama tanpa field baru tetap aman', () {
      final expired = GatewayPayment.fromJson({
        'paymentNumber': 'PG-1',
        'status': 'EXPIRED',
        'canRetry': true,
      });
      expect(expired.isExpired, isTrue);
      expect(expired.canRetry, isTrue);
      final legacy = GatewayPayment.fromJson({'paymentNumber': 'PG-1', 'status': 'PENDING'});
      expect(legacy.secondsRemaining, 0);
      expect(legacy.isPaid, isFalse);
    });
  });
}
