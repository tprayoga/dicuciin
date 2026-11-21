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

  group('Top-up saldo (Batch 4): status dari server', () {
    Map<String, dynamic> topup(String status, {int secs = 0, bool retry = false}) => {
      'topupNumber': 'TOP-20261122-000001',
      'paymentNumber': 'TOP-20261122-000001',
      'method': 'QRIS',
      'amount': 51500,
      'creditAmount': 50000,
      'status': status,
      'secondsRemaining': secs,
      'canRetry': retry,
      'createdAt': '2026-11-22T01:00:00.000Z',
    };

    test('PENDING: hitung mundur dari server, nominal tagihan vs nominal dikreditkan', () {
      final t = GatewayPayment.fromJson(topup('PENDING', secs: 899));
      expect(t.isPending, isTrue);
      expect(t.secondsRemaining, 899);
      expect(t.amount, 51500);
      expect(t.creditAmount, 50000);
      expect(t.createdAt, isNotNull);
    });

    test('PAID hanya bila server bilang PAID; EXPIRED/FAILED/CANCELLED → bisa tagihan baru', () {
      expect(GatewayPayment.fromJson(topup('PAID')).isPaid, isTrue);
      for (final s in ['EXPIRED', 'FAILED', 'CANCELLED']) {
        final t = GatewayPayment.fromJson(topup(s, retry: true));
        expect(t.isPaid, isFalse);
        expect(t.isPending, isFalse);
        expect(t.canRetry, isTrue);
      }
      // Hitung mundur 0 tetapi status PENDING ≠ kedaluwarsa (server yang memutuskan).
      expect(GatewayPayment.fromJson(topup('PENDING', secs: 0)).isExpired, isFalse);
    });
  });
}
