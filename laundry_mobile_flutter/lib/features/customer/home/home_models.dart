part of '../home_screen.dart';

enum _MainTab { home, promo, location, order }

enum _PaymentMethod { saldo, qris, va }

/// Batch 6 (S7): `offline` terpisah dari `maintenance` (dulu OFFLINE tampil "Maintenance").
enum _MachineStatus { available, inUse, maintenance, offline }

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
    this.deviceId = '',
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

  /// ID mesin nyata (untuk booking terikat order).
  final String deviceId;
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
    this.deviceId = '',
    this.scheduledAt,
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
      deviceId: machine.deviceId,
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

  /// Mesin yang dipesan & jadwalnya — order + booking dibuat atomik di server
  /// (mesin hanya bisa dipakai setelah order lunas). `scheduledAt` null = sekarang.
  final String deviceId;
  final DateTime? scheduledAt;

  /// Batch 6 (S8): jadwal pakai sebenarnya (dulu teks tetap "11:00 s/d 11:30").
  String get scheduleLabel {
    final start = (scheduledAt ?? DateTime.now()).toWib();
    final minutes = int.tryParse(RegExp(r'\d+').firstMatch(estimasi)?.group(0) ?? '') ?? 30;
    final end = start.add(Duration(minutes: minutes));
    String hm(DateTime t) =>
        '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
    final prefix = scheduledAt == null ? 'Mulai sekarang' : _formatDateId(start);
    return '$prefix • ${hm(start)} s/d ${hm(end)}';
  }
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
