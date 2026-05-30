part of '../home_screen.dart';

enum _MainTab { home, promo, location, order }

enum _PaymentMethod { saldo, qris, va }

enum _MachineStatus { available, inUse, maintenance }

enum _MachineType { washer, dryer }

extension _MachineTypeX on _MachineType {
  String get label => this == _MachineType.washer ? 'Washer' : 'Dryer';
}

class _MachineData {
  const _MachineData({
    required this.name,
    required this.status,
    required this.type,
    this.capacity = '8 KG',
    this.estimasi = '30 Menit',
    this.price = 20000,
  });

  final String name;
  final _MachineStatus status;
  final _MachineType type;
  final String capacity;
  final String estimasi;
  final int price;
}

/// Ringkasan order yang dibawa dari pilih mesin → checkout → pembayaran → sukses.
class _CheckoutData {
  const _CheckoutData({
    required this.machineName,
    required this.machineType,
    required this.capacity,
    required this.estimasi,
    required this.price,
    required this.locationName,
    required this.orderNo,
    required this.date,
  });

  factory _CheckoutData.fromMachine(
    _MachineData machine, {
    required String locationName,
  }) {
    return _CheckoutData(
      machineName: machine.name,
      machineType: machine.type,
      capacity: machine.capacity,
      estimasi: machine.estimasi,
      price: machine.price,
      locationName: locationName,
      orderNo: '#ORD0001',
      date: _formatDateId(DateTime.now()),
    );
  }

  final String machineName;
  final _MachineType machineType;
  final String capacity;
  final String estimasi;
  final int price;
  final String locationName;
  final String orderNo;
  final String date;
}

class _PromoData {
  const _PromoData({
    required this.title,
    required this.description,
    required this.period,
    required this.code,
  });

  final String title;
  final String description;
  final String period;
  final String code; // sama dgn kode voucher yg berlaku di checkout
}

// Kode di sini sengaja sama dengan `_vouchers`/`_voucherDiscount` agar promo
// yang ditampilkan benar-benar bisa dipakai di halaman checkout.
const _promos = <_PromoData>[
  _PromoData(
    title: 'Diskon 25% Semua Layanan',
    description: 'Berlaku untuk semua jenis mesin.',
    period: 'Periode 1 s.d. 30 Mei 2026',
    code: 'DISKON25',
  ),
  _PromoData(
    title: 'Potongan Rp5.000',
    description: 'Untuk setiap transaksi cuci atau pengering.',
    period: 'Periode 1 s.d. 30 Mei 2026',
    code: 'HEMAT5K',
  ),
  _PromoData(
    title: 'Potongan Rp3.000',
    description: 'Hemat tiap pemakaian mesin.',
    period: 'Periode 1 s.d. 30 Mei 2026',
    code: 'CUCIHEMAT',
  ),
];

enum _OrderStatus { running, done }

extension _OrderStatusX on _OrderStatus {
  String get label => this == _OrderStatus.running ? 'Berjalan' : 'Selesai';
}

/// Satu order pada tab Order (hari ini / riwayat) + halaman detail order.
class _OrderItem {
  const _OrderItem({
    required this.orderNo,
    required this.machineName,
    required this.machineType,
    required this.capacity,
    required this.estimasi,
    required this.locationName,
    required this.price,
    required this.methodLabel,
    required this.date,
    required this.status,
    this.schedule = '',
    this.remainingLabel,
    this.finishLabel,
  });

  final String orderNo;
  final String machineName;
  final _MachineType machineType;
  final String capacity;
  final String estimasi;
  final String locationName;
  final int price;
  final String methodLabel;
  final String date;
  final _OrderStatus status;
  final String schedule; // mis. '11:00 s/d 11:30'
  final String? remainingLabel; // mis. '5 Menit lagi' (status berjalan)
  final String? finishLabel; // mis. 'Selesai 11:30' (status berjalan)
}

const _idMonths = [
  '',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

String _formatDateId(DateTime d) => '${d.day} ${_idMonths[d.month]} ${d.year}';

String _formatRupiah(int value) {
  final s = value.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
    buf.write(s[i]);
  }
  return 'Rp $buf';
}

const _vouchers = <String, int>{'HEMAT5K': 5000, 'CUCIHEMAT': 3000};

/// Diskon (rupiah) untuk [code] terhadap [price]. 0 = kode tidak dikenal.
int _voucherDiscount(String code, int price) {
  if (code == 'DISKON25') return (price * 0.25).round();
  return _vouchers[code] ?? 0;
}
