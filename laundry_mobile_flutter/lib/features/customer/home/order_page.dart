part of '../home_screen.dart';

class _OrderPage extends StatefulWidget {
  const _OrderPage();

  @override
  State<_OrderPage> createState() => _OrderPageState();
}

class _OrderPageState extends State<_OrderPage> {
  int _tab = 0;

  // Mock data — nanti dari backend. Kosongkan list untuk lihat empty state.
  final List<_OrderItem> _todayOrders = [
    _OrderItem(
      orderNo: '#ORD0001',
      machineName: 'Mesin Cuci #01',
      machineType: _MachineType.washer,
      capacity: '8 KG',
      estimasi: '30 Menit',
      locationName: 'Laundry Smart Sudirman',
      price: 20000,
      methodLabel: 'QRIS',
      date: _formatDateId(DateTime.now()),
      status: _OrderStatus.running,
      schedule: '11:00 s/d 11:30',
      remainingLabel: '5 Menit lagi',
      finishLabel: 'Selesai 11:30',
    ),
  ];

  final List<_OrderItem> _historyOrders = [
    _OrderItem(
      orderNo: '#ORD0001',
      machineName: 'Mesin Cuci #01',
      machineType: _MachineType.washer,
      capacity: '8 KG',
      estimasi: '30 Menit',
      locationName: 'Laundry Smart Sudirman',
      price: 20000,
      methodLabel: 'QRIS',
      date: '10 Apr 2026',
      status: _OrderStatus.done,
      schedule: '11:00 s/d 11:30',
    ),
    _OrderItem(
      orderNo: '#ORD0002',
      machineName: 'Mesin Pengering #02',
      machineType: _MachineType.dryer,
      capacity: '10 KG',
      estimasi: '25 Menit',
      locationName: 'Laundry Smart Kemang',
      price: 18000,
      methodLabel: 'Virtual Account Bank BCA',
      date: '08 Apr 2026',
      status: _OrderStatus.done,
      schedule: '14:00 s/d 14:25',
    ),
    _OrderItem(
      orderNo: '#ORD0003',
      machineName: 'Mesin Cuci #03',
      machineType: _MachineType.washer,
      capacity: '12 KG',
      estimasi: '40 Menit',
      locationName: 'Laundry Smart Menteng',
      price: 25000,
      methodLabel: 'Saldo',
      date: '02 Apr 2026',
      status: _OrderStatus.done,
      schedule: '09:00 s/d 09:40',
    ),
  ];

  void _openDetail(_OrderItem item) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => _OrderDetailPage(order: item)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _BlueHeader(title: 'Order'),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: _line),
            ),
            child: Row(
              children: [
                Expanded(
                  child: _SegmentButton(
                    active: _tab == 0,
                    label: 'Order Hari ini',
                    onTap: () => setState(() => _tab = 0),
                  ),
                ),
                Expanded(
                  child: _SegmentButton(
                    active: _tab == 1,
                    label: 'Riwayat Order',
                    onTap: () => setState(() => _tab = 1),
                  ),
                ),
              ],
            ),
          ),
        ),
        Expanded(child: _tab == 0 ? _buildToday() : _buildHistory()),
      ],
    );
  }

  // ── Tab: Order Hari ini ────────────────────────────────────────
  Widget _buildToday() {
    if (_todayOrders.isEmpty) {
      return _emptyState(
        icon: Icons.local_laundry_service_outlined,
        message: 'Belum ada order hari ini',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      physics: const ClampingScrollPhysics(),
      itemCount: _todayOrders.length,
      separatorBuilder: (_, _) => const SizedBox(height: 14),
      itemBuilder: (_, i) => _OrderActiveCard(
        order: _todayOrders[i],
        onDetail: () => _openDetail(_todayOrders[i]),
      ),
    );
  }

  // ── Tab: Riwayat Order ─────────────────────────────────────────
  Widget _buildHistory() {
    if (_historyOrders.isEmpty) {
      return _emptyState(
        icon: Icons.history,
        message: 'Belum ada riwayat order',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      physics: const ClampingScrollPhysics(),
      itemCount: _historyOrders.length,
      separatorBuilder: (_, _) => const SizedBox(height: 14),
      itemBuilder: (_, i) => _OrderHistoryCard(
        order: _historyOrders[i],
        onDetail: () => _openDetail(_historyOrders[i]),
      ),
    );
  }

  Widget _emptyState({required IconData icon, required String message}) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 64, color: AppColors.textMutedLight),
          const SizedBox(height: 12),
          Text(
            message,
            style: const TextStyle(fontSize: 15, color: _textMuted),
          ),
        ],
      ),
    );
  }
}
