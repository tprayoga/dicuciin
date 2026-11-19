part of '../home_screen.dart';

class _OrderPage extends StatefulWidget {
  const _OrderPage();

  @override
  State<_OrderPage> createState() => _OrderPageState();
}

class _OrderPageState extends State<_OrderPage> {
  int _tab = 0;

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;

  Future<void> _refresh() async {
    final auth = context.read<AuthController>();
    final user = auth.user;
    final token = auth.accessToken;
    if (user == null || token == null) return;

    await context.read<CustomerController>().refreshOrdersAndBookings(
      user: user,
      accessToken: token,
    );
  }

  /// K3: refund tidak lagi bisa dilakukan sendiri. Pelanggan menghubungi
  /// layanan pelanggan (WhatsApp) dengan nomor order; refund diproses admin
  /// sesuai kebijakan.
  Future<void> _requestHelp(OrderSummary order) async {
    final text = Uri.encodeComponent(
      'Halo Di.Cuciin, saya butuh bantuan untuk order ${order.orderNumber} '
      '(${_formatRupiah(order.totalAmount.round())}).',
    );
    final uri = Uri.parse(
      'https://wa.me/${AppConfig.supportWhatsApp}?text=$text',
    );
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Tidak bisa membuka WhatsApp. Hubungi 0811-888-2908.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<CustomerController>();
    final now = DateTime.now();
    final todayOrders = controller.orders
        .where((order) => _isSameDay(order.orderDate.toLocal(), now))
        .toList();
    final historyOrders = controller.orders
        .where((order) => !_isSameDay(order.orderDate.toLocal(), now))
        .toList();

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
        Expanded(
          child: _tab == 0
              ? _buildToday(controller.activeBookings, todayOrders)
              : _buildHistory(historyOrders),
        ),
      ],
    );
  }

  Widget _buildToday(List<MachineBooking> bookings, List<OrderSummary> orders) {
    if (bookings.isEmpty && orders.isEmpty) {
      return RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 40, 20, 24),
          children: const [
            MascotMessageCard(
              mascotAsset: AppMascotAssets.emptyPageSweeping,
              variant: MascotMessageVariant.empty,
              title: 'Belum ada booking atau order hari ini',
              message: 'Belum ada aktivitas hari ini. Mulai cucianmu sekarang.',
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (bookings.isNotEmpty) ...[
            const _OrderSectionTitle(title: 'Booking Aktif'),
            const SizedBox(height: 10),
            ...bookings.map(
              (booking) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _BookingOrderCard(booking: booking),
              ),
            ),
          ],
          if (orders.isNotEmpty) ...[
            const _OrderSectionTitle(title: 'Order Hari Ini'),
            const SizedBox(height: 10),
            ...orders.map(
              (order) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _BackendOrderCard(
                  order: order,
                  onHelp: () => _requestHelp(order),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildHistory(List<OrderSummary> orders) {
    if (orders.isEmpty) {
      return RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 40, 20, 24),
          children: const [
            MascotMessageCard(
              mascotAsset: AppMascotAssets.emptyHistorySitting,
              variant: MascotMessageVariant.empty,
              title: 'Belum ada riwayat order',
              message: 'Belum ada transaksi. Mulai cucian pertamamu hari ini.',
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: orders.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (_, index) {
          final order = orders[index];
          return _BackendOrderCard(
            order: order,
            onHelp: () => _requestHelp(order),
          );
        },
      ),
    );
  }

}

class _OrderSectionTitle extends StatelessWidget {
  const _OrderSectionTitle({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        color: _textDark,
      ),
    );
  }
}

class _BackendOrderCard extends StatelessWidget {
  const _BackendOrderCard({required this.order, required this.onHelp});

  final OrderSummary order;
  final VoidCallback onHelp;

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
                  order.orderNumber,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: _textDark,
                  ),
                ),
              ),
              StatusBadge(
                _statusLabel(order.status),
                type: _statusType(order.status),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            order.serviceName,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: _textDark,
            ),
          ),
          const SizedBox(height: 8),
          _DetailRow(left: 'Outlet', right: order.outletName),
          _DetailRow(
            left: 'Tanggal',
            right: _formatDateId(order.orderDate.toLocal()),
          ),
          _DetailRow(
            left: 'Total',
            right: _formatRupiah(order.totalAmount.round()),
            greenRight: true,
          ),
          if (order.status == 'PAID') ...[
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onHelp,
                icon: const Icon(Icons.support_agent),
                label: const Text('Butuh bantuan?'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _statusLabel(String status) => switch (status) {
    'DRAFT' => 'Menunggu Pembayaran',
    'PAID' => 'Dibayar',
    'RECEIVED' => 'Diterima',
    'WASHING' => 'Dicuci',
    'DRYING' => 'Dikeringkan',
    'IRONING' => 'Disetrika',
    'PACKING' => 'Dikemas',
    'READY_PICKUP' => 'Siap Diambil',
    'OUT_FOR_DELIVERY' => 'Diantar',
    'COMPLETED' => 'Selesai',
    'CANCELLED' => 'Dibatalkan',
    'REFUNDED' => 'Direfund',
    _ => status,
  };

  static StatusBadgeType _statusType(String status) => switch (status) {
    'COMPLETED' => StatusBadgeType.success,
    'CANCELLED' => StatusBadgeType.error,
    'REFUNDED' => StatusBadgeType.success,
    'DRAFT' => StatusBadgeType.warning,
    _ => StatusBadgeType.brand,
  };
}

class _BookingOrderCard extends StatelessWidget {
  const _BookingOrderCard({required this.booking});

  final MachineBooking booking;

  @override
  Widget build(BuildContext context) {
    final scheduled = booking.scheduledAt?.toLocal();
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.tintBlueAlt,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _primary.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  booking.bookingCode,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: _textDark,
                  ),
                ),
              ),
              StatusBadge(
                booking.status == 'IN_USE' ? 'Sedang Dipakai' : 'Dibooking',
                type: booking.status == 'IN_USE'
                    ? StatusBadgeType.success
                    : StatusBadgeType.warning,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            booking.deviceName ?? booking.deviceCode ?? 'Mesin Laundry',
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: _textDark,
            ),
          ),
          if (scheduled != null) ...[
            const SizedBox(height: 8),
            _DetailRow(
              left: 'Jadwal',
              right:
                  '${_formatDateId(scheduled)}, ${scheduled.hour.toString().padLeft(2, '0')}:${scheduled.minute.toString().padLeft(2, '0')}',
            ),
          ],
        ],
      ),
    );
  }
}
