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
    this.serviceId = '',
    this.outletId = '',
  });

  final String name;
  final _MachineStatus status;
  final _MachineType type;
  final String capacity;
  final String estimasi;
  final int price;

  /// ID layanan & outlet untuk membuat order nyata (kosong = data mock lama).
  final String serviceId;
  final String outletId;
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
    required this.serviceId,
    required this.outletId,
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
      orderNo: '-',
      date: _formatDateId(DateTime.now()),
      serviceId: machine.serviceId,
      outletId: machine.outletId,
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

  /// ID layanan & outlet untuk membuat order nyata di checkout.
  final String serviceId;
  final String outletId;
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
