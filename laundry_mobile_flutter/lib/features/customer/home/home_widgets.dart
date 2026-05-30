part of '../home_screen.dart';

class _MachineCard extends StatelessWidget {
  const _MachineCard({required this.machine, this.onUse, this.onBook});

  final _MachineData machine;
  final VoidCallback? onUse;
  final VoidCallback? onBook;

  @override
  Widget build(BuildContext context) {
    final isDisabled = machine.status == _MachineStatus.maintenance;
    final isAvailable = machine.status == _MachineStatus.available;
    final isInUse = machine.status == _MachineStatus.inUse;

    return Opacity(
      opacity: isDisabled ? 0.55 : 1,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: const BoxDecoration(
                    color: AppColors.tintBlue,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.local_laundry_service,
                    color: _primary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        machine.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: _textDark,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        isInUse
                            ? 'Saat ini sedang digunakan'
                            : isDisabled
                            ? 'Sementara tidak tersedia'
                            : 'Siap digunakan sekarang',
                        style: const TextStyle(
                          fontSize: 12,
                          color: _textMuted,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                _statusChip(machine.status),
              ],
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surfaceAlt,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.borderLight),
              ),
              child: Column(
                children: [
                  _machineMetaRow(
                    icon: Icons.scale_outlined,
                    label: 'Kapasitas',
                    value: machine.capacity,
                  ),
                  const SizedBox(height: 8),
                  _machineMetaRow(
                    icon: Icons.timelapse_outlined,
                    label: 'Estimasi',
                    value: machine.estimasi,
                  ),
                  const SizedBox(height: 8),
                  _machineMetaRow(
                    icon: Icons.sell_outlined,
                    label: 'Harga',
                    value: _formatRupiah(machine.price),
                    valueColor: isAvailable
                        ? AppColors.success
                        : isInUse
                        ? _textDark
                        : _textMuted,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            if (isAvailable)
              AppPrimaryButton(label: 'Gunakan Mesin', onTap: onUse)
            else if (isInUse)
              AppOutlineButton(label: 'Booking Antrian', onTap: onBook)
            else
              const AppDisabledButton(label: 'Sedang Maintenance'),
          ],
        ),
      ),
    );
  }

  Widget _statusChip(_MachineStatus status) {
    switch (status) {
      case _MachineStatus.available:
        return _chip(
          label: 'Tersedia',
          bgColor: AppColors.successBg,
          textColor: AppColors.success,
          dotColor: AppColors.success,
        );
      case _MachineStatus.inUse:
        return _chip(
          label: 'Digunakan',
          bgColor: AppColors.warningBg,
          textColor: AppColors.warning,
          dotColor: AppColors.warning,
        );
      case _MachineStatus.maintenance:
        return _chip(
          label: 'Maintenance',
          bgColor: AppColors.errorBg,
          textColor: AppColors.error,
          dotColor: AppColors.error,
        );
    }
  }

  Widget _chip({
    required String label,
    required Color bgColor,
    required Color textColor,
    required Color dotColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: textColor,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _machineMetaRow({
    required IconData icon,
    required String label,
    required String value,
    Color valueColor = _textDark,
  }) {
    return Row(
      children: [
        Icon(icon, size: 16, color: _textMuted),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              color: _textMuted,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            color: valueColor,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _LocationCard extends StatelessWidget {
  const _LocationCard({
    required this.name,
    required this.address,
    required this.machineCount,
    required this.closeTime,
    required this.isOpen,
    required this.enabled,
    this.onTap,
  });

  final String name;
  final String address;
  final int machineCount;
  final String closeTime;
  final bool isOpen;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    const borderRadius = BorderRadius.all(Radius.circular(14));
    final machineLabel = machineCount > 0
        ? '$machineCount Mesin Tersedia'
        : 'Mesin Penuh';

    return Opacity(
      opacity: enabled ? 1 : 0.55,
      child: Material(
        color: Colors.white,
        borderRadius: borderRadius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              border: Border.all(color: _line),
              borderRadius: borderRadius,
            ),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: _textDark,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            address,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              color: _textMuted,
                              height: 1.35,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _buildTag(
                                machineLabel,
                                machineCount > 0
                                    ? AppColors.tintBlueAlt
                                    : AppColors.border,
                                machineCount > 0 ? _primary : _textMuted,
                              ),
                              _buildTag(
                                isOpen ? 'Buka' : 'Tutup',
                                isOpen
                                    ? AppColors.successBg
                                    : AppColors.errorBg,
                                isOpen ? AppColors.success : AppColors.error,
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              const Icon(
                                Icons.access_time,
                                size: 14,
                                color: _textMuted,
                              ),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  'Tutup Pukul $closeTime WIB',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: _textDark,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 108,
                    child: Image.asset(
                      'assets/mockups/location_cover.png',
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => Container(
                        color: AppColors.tintBlue,
                        child: const Icon(
                          Icons.location_city,
                          color: AppColors.textMutedLight,
                          size: 32,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTag(String label, Color bgColor, Color textColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _BookingSheet extends StatefulWidget {
  const _BookingSheet({required this.machineName});

  final String machineName;

  @override
  State<_BookingSheet> createState() => _BookingSheetState();
}

class _BookingSheetState extends State<_BookingSheet> {
  static const _slots = <({String label, bool disabled})>[
    (label: '10:00 - 10:30', disabled: true),
    (label: '10:30 - 11:00', disabled: false),
    (label: '11:00 - 11:30', disabled: false),
    (label: '11:30 - 12:00', disabled: false),
    (label: '12:00 - 12:30', disabled: false),
    (label: '12:30 - 13:00', disabled: false),
  ];

  int? _selected;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              height: 52,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: const BoxDecoration(
                color: _blue,
                borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
              ),
              child: Row(
                children: [
                  const Text(
                    'Pilih waktu',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, color: Colors.white),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Antre untuk ${widget.machineName}',
                    style: const TextStyle(fontSize: 13, color: _textMuted),
                  ),
                  const SizedBox(height: 14),
                  for (var i = 0; i < _slots.length; i += 2) ...[
                    Row(
                      children: [
                        Expanded(child: _slotButton(i)),
                        const SizedBox(width: 12),
                        if (i + 1 < _slots.length)
                          Expanded(child: _slotButton(i + 1))
                        else
                          const Expanded(child: SizedBox()),
                      ],
                    ),
                    if (i + 2 < _slots.length) const SizedBox(height: 10),
                  ],
                  const SizedBox(height: 20),
                  if (_selected == null)
                    const AppDisabledButton(label: 'Pilih waktu dulu')
                  else
                    AppPrimaryButton(
                      label: 'Booking Sekarang',
                      onTap: () =>
                          Navigator.of(context).pop(_slots[_selected!].label),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _slotButton(int index) {
    final slot = _slots[index];
    return _TimeButton(
      label: slot.label,
      active: _selected == index,
      disabled: slot.disabled,
      onTap: () => setState(() => _selected = index),
    );
  }
}

class _CheckoutSummaryCard extends StatelessWidget {
  const _CheckoutSummaryCard({
    required this.data,
    required this.discount,
    required this.total,
  });

  final _CheckoutData data;
  final int discount;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  data.machineName,
                  style: const TextStyle(
                    fontSize: 17,
                    color: _textDark,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const _SummaryStatusChip(),
            ],
          ),
          const SizedBox(height: 12),
          _DetailRow(left: 'No. Order', right: data.orderNo),
          _DetailRow(left: 'Kategori Mesin', right: data.machineType.label),
          _DetailRow(left: 'Kapasitas', right: data.capacity),
          _DetailRow(left: 'Estimasi', right: data.estimasi),
          _DetailRow(left: 'Tanggal', right: data.date),
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 12),
          _DetailRow(left: 'Harga', right: _formatRupiah(data.price)),
          _DetailRow(
            left: 'Diskon',
            right: discount > 0
                ? '- ${_formatRupiah(discount)}'
                : _formatRupiah(0),
          ),
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 12),
          _DetailRow(
            left: 'Total Bayar',
            right: _formatRupiah(total),
            greenRight: true,
          ),
        ],
      ),
    );
  }
}

class _SummaryStatusChip extends StatelessWidget {
  const _SummaryStatusChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.tintBlueAlt,
        borderRadius: BorderRadius.circular(999),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.local_laundry_service, size: 14, color: _primary),
          SizedBox(width: 6),
          Text(
            'Siap Dibayar',
            style: TextStyle(
              fontSize: 11,
              color: _primary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _OrderActiveCard extends StatelessWidget {
  const _OrderActiveCard({required this.order, required this.onDetail});

  final _OrderItem order;
  final VoidCallback onDetail;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.warningBg,
                ),
                child: const Icon(
                  Icons.notifications_none,
                  color: AppColors.warning,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Sebentar lagi mesin selesai!',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Sisa waktu penggunaan ${order.machineName}',
                      style: const TextStyle(color: _textMuted, fontSize: 14),
                    ),
                    RichText(
                      text: TextSpan(
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                        children: [
                          TextSpan(
                            text: order.remainingLabel ?? 'Sedang berjalan',
                            style: const TextStyle(color: AppColors.warning),
                          ),
                          if (order.finishLabel != null)
                            TextSpan(
                              text: ' (${order.finishLabel})',
                              style: const TextStyle(color: _textMuted),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(height: 1),
          const SizedBox(height: 14),
          Text(
            order.machineName,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          _DetailRow(left: 'Kapasitas', right: order.capacity),
          _DetailRow(left: 'Estimasi', right: order.estimasi),
          _DetailRow(
            left: 'Status',
            rightWidget: _statusDot(order.status.label, AppColors.warning),
          ),
          const SizedBox(height: 14),
          AppOutlineButton(label: 'Detail Order', onTap: onDetail),
        ],
      ),
    );
  }
}

class _OrderHistoryCard extends StatelessWidget {
  const _OrderHistoryCard({required this.order, required this.onDetail});

  final _OrderItem order;
  final VoidCallback onDetail;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  order.machineName,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Text(
                order.date,
                style: const TextStyle(fontSize: 12, color: _textMuted),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _DetailRow(left: 'Kapasitas', right: order.capacity),
          _DetailRow(left: 'Estimasi', right: order.estimasi),
          _DetailRow(
            left: 'Status',
            rightWidget: _statusDot(order.status.label, AppColors.success),
          ),
          const SizedBox(height: 14),
          AppOutlineButton(label: 'Detail Order', onTap: onDetail),
        ],
      ),
    );
  }
}

class _BlueHeader extends StatelessWidget {
  const _BlueHeader({
    required this.title,
    this.showBack = false,
    this.alignLeft = false,
  });

  final String title;
  final bool showBack;
  final bool alignLeft;

  @override
  Widget build(BuildContext context) {
    if (alignLeft) {
      return Container(
        color: _blue,
        child: SizedBox(
          height: 104,
          child: Row(
            children: [
              if (showBack)
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.arrow_back, color: Colors.white),
                )
              else
                const SizedBox(width: 52),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 17,
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Container(
      color: _blue,
      child: SizedBox(
        height: 104,
        child: Row(
          children: [
            if (showBack)
              IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.arrow_back, color: Colors.white),
              )
            else
              const SizedBox(width: 52),
            Expanded(
              child: Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 17,
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: 52),
          ],
        ),
      ),
    );
  }
}

class _MainBottomBar extends StatelessWidget {
  const _MainBottomBar({
    required this.tab,
    required this.onTap,
    required this.onScan,
  });

  final _MainTab tab;
  final ValueChanged<_MainTab> onTap;
  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: _line)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              // Baris menu
              Row(
                children: [
                  Expanded(
                    child: _BottomItem(
                      icon: Icons.home_outlined,
                      label: 'Beranda',
                      active: tab == _MainTab.home,
                      onTap: () => onTap(_MainTab.home),
                    ),
                  ),
                  Expanded(
                    child: _BottomItem(
                      icon: Icons.local_offer_outlined,
                      label: 'Promo',
                      active: tab == _MainTab.promo,
                      onTap: () => onTap(_MainTab.promo),
                    ),
                  ),
                  // Ruang untuk tombol scan + labelnya
                  const SizedBox(
                    width: 76,
                    child: Align(
                      alignment: Alignment.bottomCenter,
                      child: Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                          'Scan QR',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.textMutedLight,
                          ),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: _BottomItem(
                      icon: Icons.location_on_outlined,
                      label: 'Lokasi',
                      active: tab == _MainTab.location,
                      onTap: () => onTap(_MainTab.location),
                    ),
                  ),
                  Expanded(
                    child: _BottomItem(
                      icon: Icons.receipt_long_outlined,
                      label: 'Order',
                      active: tab == _MainTab.order,
                      onTap: () => onTap(_MainTab.order),
                    ),
                  ),
                ],
              ),

              // Tombol scan melayang — bagian dari bar (konsisten di semua HP)
              Positioned(
                top: -40,
                left: 0,
                right: 0,
                child: Center(
                  child: GestureDetector(
                    onTap: onScan,
                    child: Container(
                      width: 76,
                      height: 76,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                        border: Border.all(color: _line),
                      ),
                      child: Center(
                        child: Container(
                          width: 58,
                          height: 58,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: _primary,
                          ),
                          child: const Icon(
                            Icons.qr_code_scanner_rounded,
                            color: Colors.white,
                            size: 28,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StaticBottomBar extends StatelessWidget {
  const _StaticBottomBar({this.showCenterScan = false});

  final bool showCenterScan;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 104,
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: _line)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: _BottomItem(
                icon: Icons.home_outlined,
                label: 'Beranda',
                active: false,
              ),
            ),
            Expanded(
              child: _BottomItem(
                icon: Icons.local_offer_outlined,
                label: 'Promo',
                active: false,
              ),
            ),
            SizedBox(
              width: 84,
              child: showCenterScan
                  ? Stack(
                      clipBehavior: Clip.none,
                      alignment: Alignment.center,
                      children: [
                        const Positioned(
                          bottom: 8,
                          child: Text(
                            'Scan QR',
                            style: TextStyle(
                              fontSize: 12,
                              color: AppColors.textMutedLight,
                            ),
                          ),
                        ),
                        Positioned(
                          top: -38,
                          child: Container(
                            width: 82,
                            height: 82,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: _bg,
                              border: Border.all(color: _line),
                            ),
                            child: Center(
                              child: Container(
                                width: 62,
                                height: 62,
                                decoration: const BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: _primary,
                                ),
                                child: const Icon(
                                  Icons.qr_code_scanner_rounded,
                                  color: Colors.white,
                                  size: 30,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    )
                  : null,
            ),
            Expanded(
              child: _BottomItem(
                icon: Icons.location_on_outlined,
                label: 'Lokasi',
                active: false,
              ),
            ),
            Expanded(
              child: _BottomItem(
                icon: Icons.receipt_long_outlined,
                label: 'Order',
                active: false,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomItem extends StatelessWidget {
  const _BottomItem({
    required this.icon,
    required this.label,
    required this.active,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: active ? AppColors.surfaceAlt : Colors.white,
          border: Border(
            top: BorderSide(
              color: active ? _primary : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 23,
              color: active ? _primary : AppColors.textMutedLight,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                color: active ? _primary : AppColors.textMutedLight,
                fontWeight: active ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ServiceTile extends StatelessWidget {
  const _ServiceTile({required this.label, this.onTap});

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        height: 84,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _line),
          color: Colors.white,
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: const BoxDecoration(
                color: AppColors.tintBlue,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.local_laundry_service, color: _primary),
            ),
            const SizedBox(width: 10),
            Text(
              label,
              style: const TextStyle(
                fontSize: 16,
                color: _textDark,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SegmentButton extends StatelessWidget {
  const _SegmentButton({
    required this.active,
    required this.label,
    required this.onTap,
  });

  final bool active;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          height: 44,
          alignment: Alignment.center,
          margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
          decoration: BoxDecoration(
            color: active ? AppColors.tintBlueAlt : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: active
                  ? AppColors.primary.withValues(alpha: 0.3)
                  : Colors.transparent,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? _primary : AppColors.textMuted,
              fontSize: 14,
              fontWeight: active ? FontWeight.w700 : FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.left,
    this.right,
    this.rightWidget,
    this.greenRight = false,
  });

  final String left;
  final String? right;
  final Widget? rightWidget;
  final bool greenRight;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(left, style: const TextStyle(fontSize: 14, color: _textMuted)),
          const Spacer(),
          if (rightWidget != null)
            rightWidget!
          else
            Text(
              right ?? '-',
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: 14,
                color: greenRight ? AppColors.success : _textDark,
                fontWeight: FontWeight.w600,
              ),
            ),
        ],
      ),
    );
  }
}

class _PaymentInstructionCard extends StatelessWidget {
  const _PaymentInstructionCard({required this.title, required this.items});

  final String title;
  final List<String> items;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          ...items.asMap().entries.map(
            (entry) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 8,
                    backgroundColor: AppColors.tintBlue,
                    child: Text(
                      '${entry.key + 1}',
                      style: const TextStyle(
                        fontSize: 10,
                        color: _textMuted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      entry.value,
                      style: const TextStyle(
                        fontSize: 12,
                        color: _textMuted,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AccountItem extends StatelessWidget {
  const _AccountItem({required this.icon, required this.title, this.onTap});

  final IconData icon;
  final String title;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          children: [
            const Divider(height: 1, color: _line),
            SizedBox(
              height: 64,
              child: Row(
                children: [
                  Icon(icon, color: _textMuted, size: 22),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15,
                        color: _textMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: _textMuted,
                    size: 28,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TimeButton extends StatelessWidget {
  const _TimeButton({
    required this.label,
    required this.active,
    this.disabled = false,
    this.onTap,
  });

  final String label;
  final bool active;
  final bool disabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final color = disabled
        ? AppColors.textMutedLight
        : active
        ? _primary
        : _textDark;

    return InkWell(
      onTap: disabled ? null : onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: disabled
              ? AppColors.surfaceAlt
              : active
              ? AppColors.tintBlueAlt
              : AppColors.surfaceAlt,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: active ? _primary : _line),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            color: color,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

Widget _statusDot(String text, Color color) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(100),
    ),
    child: Text(
      text,
      style: const TextStyle(color: Colors.white, fontSize: 12),
    ),
  );
}
