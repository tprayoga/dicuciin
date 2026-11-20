// Batch 6: slot booking dari jam operasional (T8), data mesin (S3), merek
// bank (R4), notifikasi & katalog tukar poin (R1, R3).
import 'package:flutter_test/flutter_test.dart';
import 'package:laundry_mobile_flutter/features/customer/models/customer_models.dart';
import 'package:laundry_mobile_flutter/shared/widgets/bank_brand.dart';

/// Waktu WIB → instant.
DateTime wib(String isoLocal) => DateTime.parse('$isoLocal+07:00');

void main() {
  group('OperatingHours.hourlySlots (T8)', () {
    const hours = OperatingHours(openTime: '07:00', closeTime: '22:00');

    test('hari ini pukul 20:30 WIB → hanya 21:00 (22:00 = tutup); tidak ada slot lewat jam tutup', () {
      final slots = hours.hourlySlots(now: wib('2026-11-24T20:30:00'), dayOffset: 0);
      expect(slots.map(hours.wallLabel), ['21:00']);
    });

    test('hari ini setelah tutup (22:15) → kosong', () {
      expect(hours.hourlySlots(now: wib('2026-11-24T22:15:00'), dayOffset: 0), isEmpty);
    });

    test('besok → 07:00 s/d 21:00', () {
      final slots = hours.hourlySlots(now: wib('2026-11-24T22:15:00'), dayOffset: 1);
      expect(hours.wallLabel(slots.first), '07:00');
      expect(hours.wallLabel(slots.last), '21:00');
      expect(slots, hasLength(15));
      // Instant yang dikirim ke server = WIB yang benar.
      expect(slots.first.toUtc(), DateTime.utc(2026, 11, 25, 0));
    });

    test('lewat tengah malam 20:00–02:00', () {
      const night = OperatingHours(openTime: '20:00', closeTime: '02:00');
      final labels = night.hourlySlots(now: wib('2026-11-24T05:00:00'), dayOffset: 0).map(night.wallLabel).toList();
      expect(labels, ['20:00', '21:00', '22:00', '23:00']);
    });

    test('24 jam & tanpa data', () {
      const allDay = OperatingHours(openTime: '00:00', closeTime: '00:00');
      expect(allDay.label, 'Buka 24 jam');
      expect(allDay.hourlySlots(now: wib('2026-11-24T00:30:00'), dayOffset: 1), hasLength(24));
      const none = OperatingHours();
      // Tanpa data: perilaku lama 08–21.
      final labels = none.hourlySlots(now: wib('2026-11-24T05:00:00'), dayOffset: 1).map(none.wallLabel);
      expect(labels.first, '08:00');
      expect(labels.last, '21:00');
    });

    test('dari JSON server', () {
      final m = OutletMachines.fromJson({
        'operatingHours': {'openTime': '08:00', 'closeTime': '21:00', 'utcOffsetMinutes': 420},
        'occupancy': <String, dynamic>{},
        'machines': [
          {
            'deviceId': 'd1',
            'name': 'W1',
            'type': 'WASHING_MACHINE',
            'status': 'AVAILABLE',
            'bookable': true,
            'capacityKg': 12,
            'service': {'serviceId': 's1', 'name': 'Cuci 12kg', 'price': 15000, 'estimateMinutes': 35},
          },
          {'deviceId': 'd2', 'name': 'D1', 'type': 'DRYER_MACHINE', 'status': 'OFFLINE', 'bookable': false},
        ],
      });
      expect(m.operatingHours.label, '08:00 – 21:00');
      expect(m.machines.first.capacityKg, 12);
      expect(m.machines.first.service!.price, 15000);
      expect(m.machines.first.service!.estimateMinutes, 35);
      expect(m.machines.last.service, isNull);
      expect(m.machines.last.capacityKg, isNull);
    });
  });

  group('BankBrand (R4)', () {
    test('Permata tidak lagi tampil sebagai CIMB NIAGA', () {
      expect(BankBrand.of('Bank Permata')!.code, 'PERMATA');
      expect(BankBrand.of('Bank Permata')!.label, isNot(contains('CIMB')));
      expect(BankBrand.of('Bank BCA')!.code, 'BCA');
      expect(BankBrand.of('bri')!.code, 'BRI');
      expect(BankBrand.of('Bank BNI')!.code, 'BNI');
      expect(BankBrand.of('Bank Antah'), isNull);
    });
  });

  group('Notifikasi & tukar poin (R1, R3)', () {
    test('NotificationInbox dari JSON', () {
      final inbox = NotificationInbox.fromJson({
        'unreadCount': 1,
        'items': [
          {
            'id': 'n1',
            'type': 'ORDER_COMPLETED',
            'title': 'Cucian selesai',
            'body': 'Beri ulasan',
            'createdAt': '2026-11-24T10:00:00Z',
            'readAt': null,
            'data': {'orderId': 'o1', 'reviewRequested': true},
          },
        ],
      });
      expect(inbox.unreadCount, 1);
      expect(inbox.items.single.isRead, isFalse);
      expect(inbox.items.single.orderId, 'o1');
      expect(inbox.items.single.asksReview, isTrue);
    });

    test('RewardCatalog dari JSON', () {
      final c = RewardCatalog.fromJson({
        'walletId': 'w1',
        'pointBalance': 150,
        'items': [
          {'templateId': 't1', 'name': 'Diskon', 'pointCost': 100, 'canRedeem': true, 'reason': null},
          {'templateId': 't2', 'name': 'Gold', 'pointCost': 100, 'canRedeem': false, 'reason': 'Voucher khusus tier lain'},
        ],
      });
      expect(c.items.first.canRedeem, isTrue);
      expect(c.items.last.reason, 'Voucher khusus tier lain');
    });
  });
}
