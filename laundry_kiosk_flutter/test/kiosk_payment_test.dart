import 'package:flutter_test/flutter_test.dart';
import 'package:laundry_kiosk_flutter/src/models.dart';

void main() {
  test('KioskPayment: berakhir hanya bila server bilang (bukan timer lokal)', () {
    final pending = KioskPayment.fromJson({'paymentNumber': 'PG-1', 'status': 'PENDING', 'secondsRemaining': 0});
    expect(pending.isEnded, isFalse); // hitung mundur 0 ≠ kedaluwarsa
    final expired = KioskPayment.fromJson({'paymentNumber': 'PG-1', 'status': 'EXPIRED', 'canRetry': true});
    expect(expired.isEnded, isTrue);
    expect(expired.canRetry, isTrue);
    final cancelled = KioskPayment.fromJson({'paymentNumber': 'PG-1', 'status': 'CANCELLED'});
    expect(cancelled.isEnded, isTrue);
    expect(KioskPayment.fromJson({'paymentNumber': 'PG-1', 'status': 'PAID'}).isEnded, isFalse);
  });
}
