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

  Future<void> _requestRefund(OrderSummary order) async {
    final reasonController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Ajukan Refund'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${order.orderNumber} senilai '
              '${_formatRupiah(order.totalAmount.round())} akan dikembalikan '
              'ke saldo wallet.',
              style: const TextStyle(color: _textMuted, height: 1.4),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: reasonController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Alasan refund',
                hintText: 'Contoh: salah memilih layanan',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Refund'),
          ),
        ],
      ),
    );
    final reason = reasonController.text.trim();
    reasonController.dispose();
    if (confirmed != true || !mounted) return;
    if (reason.length < 3) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Alasan refund minimal 3 karakter.')),
      );
      return;
    }

    final auth = context.read<AuthController>();
    final user = auth.user;
    final token = auth.accessToken;
    if (user == null || token == null) return;

    final controller = context.read<CustomerController>();
    final balance = await controller.refundOrder(
      user: user,
      accessToken: token,
      orderId: order.id,
      reason: reason,
    );
    if (!mounted) return;
    if (balance == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(controller.errorMessage ?? 'Refund gagal diproses.'),
        ),
      );
      return;
    }

    await context.read<WalletController>().loadBalance();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Refund berhasil. Saldo sekarang ${_formatRupiah(balance)}.',
        ),
        backgroundColor: AppColors.success,
      ),
    );
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
                  onRefund: () => _requestRefund(order),
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
            onRefund: () => _requestRefund(order),
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
  const _BackendOrderCard({required this.order, required this.onRefund});

  final OrderSummary order;
  final VoidCallback onRefund;

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
              _statusDot(
                _statusLabel(order.status),
                _statusColor(order.status),
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
                onPressed: context.watch<CustomerController>().isRefundingOrder
                    ? null
                    : onRefund,
                icon: const Icon(Icons.currency_exchange),
                label: const Text('Refund ke Saldo'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.error,
                  side: const BorderSide(color: AppColors.error),
                ),
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

  static Color _statusColor(String status) => switch (status) {
    'COMPLETED' => AppColors.success,
    'CANCELLED' => AppColors.error,
    'REFUNDED' => AppColors.success,
    'DRAFT' => AppColors.warning,
    _ => _primary,
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
              _statusDot(
                booking.status == 'IN_USE' ? 'Sedang Dipakai' : 'Dibooking',
                booking.status == 'IN_USE'
                    ? AppColors.success
                    : AppColors.warning,
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
