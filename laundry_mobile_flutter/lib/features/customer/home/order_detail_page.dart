part of '../home_screen.dart';

/// Detail order (Batch 3 — S1). Order belum dibayar bisa DILANJUTKAN
/// pembayarannya (QRIS / VA / Saldo — order yang SAMA, harga final dari server)
/// atau DIBATALKAN (server melepas mesin, voucher, dan tagihan aktif).
class _OrderDetailPage extends StatefulWidget {
  const _OrderDetailPage({required this.orderId});

  final String orderId;

  @override
  State<_OrderDetailPage> createState() => _OrderDetailPageState();
}

class _OrderDetailPageState extends State<_OrderDetailPage> {
  OrderDetail? _detail;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final token = context.read<AuthController>().accessToken;
    if (token == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final detail = await context.read<CustomerController>().getOrderDetail(
      accessToken: token,
      orderId: widget.orderId,
    );
    if (!mounted) return;
    setState(() {
      _detail = detail;
      _loading = false;
      _error = detail == null ? 'Detail order tidak bisa dimuat.' : null;
    });
  }

  /// Data tampilan untuk halaman bayar/sukses yang sudah ada.
  _CheckoutData _checkoutData(OrderDetail d) => _CheckoutData(
    machineName:
        d.machineName ??
        (d.items.isNotEmpty ? d.items.first.serviceName : 'Layanan'),
    machineType: d.machineIsDryer ? _MachineType.dryer : _MachineType.washer,
    capacity: '—',
    estimasi: d.estimatedMinutes != null ? '${d.estimatedMinutes} Menit' : '—',
    price: d.totalAmount.round(),
    locationName: d.outletName,
    orderNo: d.orderNumber,
    date: _formatDateId(d.orderDate.toLocal()),
    serviceId: '',
    outletId: d.outletId,
  );

  Future<void> _continuePayment() async {
    final d = _detail;
    if (d == null || _busy) return;
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text(
                'Pilih metode pembayaran',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            for (final option in const [
              ('QRIS', Icons.qr_code_2),
              ('Bank BCA', Icons.account_balance),
              ('Bank BRI', Icons.account_balance),
              ('Bank BNI', Icons.account_balance),
              ('Bank Permata', Icons.account_balance),
              ('Saldo', Icons.account_balance_wallet_outlined),
            ])
              ListTile(
                // Batch 6 (R4): merek bank yang sama dengan checkout.
                leading: option.$1.startsWith('Bank ')
                    ? SizedBox(width: 72, child: BankBrandMark(bank: option.$1, scale: 0.75))
                    : Icon(option.$2),
                title: Text(
                  option.$1 == 'QRIS' || option.$1 == 'Saldo'
                      ? option.$1
                      : 'Virtual Account ${option.$1}',
                ),
                onTap: () => Navigator.of(sheet).pop(option.$1),
              ),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    final data = _checkoutData(d);
    final total = d.totalAmount.round();
    if (choice == 'Saldo') {
      await _payWithWallet(d, data);
    } else if (choice == 'QRIS') {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) =>
              _PaymentQrisPage(data: data, total: total, orderId: d.id),
        ),
      );
    } else {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => _PaymentVaPage(
            bank: choice,
            data: data,
            total: total,
            orderId: d.id,
          ),
        ),
      );
    }
    if (mounted) await _load();
  }

  Future<void> _payWithWallet(OrderDetail d, _CheckoutData data) async {
    final wallet = context.read<WalletController>();
    final messenger = ScaffoldMessenger.of(context);
    if (!wallet.hasPin) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text(
            'Buat PIN wallet dulu di menu Akun untuk bayar pakai saldo.',
          ),
        ),
      );
      return;
    }
    final total = d.totalAmount.round();
    if (!wallet.canPay(total)) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Saldo tidak cukup.')),
      );
      return;
    }
    final verified = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _WalletPinSheet(amount: total),
    );
    if (verified != true || !mounted) return;
    final auth = context.read<AuthController>();
    final controller = context.read<CustomerController>();
    final navigator = Navigator.of(context);
    setState(() => _busy = true);
    final ok = await controller.payOrderWithWallet(
      user: auth.user!,
      accessToken: auth.accessToken!,
      orderId: d.id,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (!ok) {
      messenger.showSnackBar(
        SnackBar(content: Text(controller.errorMessage ?? 'Pembayaran gagal.')),
      );
      return;
    }
    await wallet.loadBalance();
    if (!mounted) return;
    _showOrderSuccess(
      navigator,
      _OrderSuccessPage(
        data: data,
        methodLabel: 'Saldo',
        total: total,
        orderId: d.id,
      ),
    );
  }

  Future<void> _cancel() async {
    final d = _detail;
    if (d == null || _busy) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Batalkan order?'),
        content: const Text(
          'Mesin dan voucher yang dipesan akan dilepas. Jika kamu sudah membayar, '
          'jangan batalkan — tunggu status diperbarui.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: const Text('Tidak'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: const Text('Batalkan'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    final token = context.read<AuthController>().accessToken;
    if (token == null) return;
    setState(() => _busy = true);
    final controller = context.read<CustomerController>();
    final result = await controller.cancelOrder(
      accessToken: token,
      orderId: d.id,
      cancelReason: 'Dibatalkan pelanggan dari detail order',
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (result != null) {
      AppToast.success(context, 'Order dibatalkan.');
    } else {
      AppToast.error(
        context,
        controller.errorMessage ?? 'Order tidak bisa dibatalkan. Muat ulang status.',
      );
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final d = _detail;
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Column(
          children: [
            const _BlueHeader(title: 'Detail Order', showBack: true),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : d == null
                  ? Center(child: Text(_error ?? 'Order tidak ditemukan.'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
                        children: [
                          _card([
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    d.orderNumber,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: _textDark,
                                    ),
                                  ),
                                ),
                                StatusBadge(
                                  _BackendOrderCard._statusLabel(d.status),
                                  type: _BackendOrderCard._statusType(d.status),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            _DetailRow(left: 'Outlet', right: d.outletName),
                            if (d.machineName != null)
                              _DetailRow(left: 'Mesin', right: d.machineName!),
                            if (d.scheduledAt != null)
                              _DetailRow(
                                left: 'Jadwal',
                                right: _formatDateId(d.scheduledAt!.toLocal()),
                              ),
                            if (d.estimatedMinutes != null)
                              _DetailRow(
                                left: 'Estimasi',
                                right: '${d.estimatedMinutes} Menit',
                              ),
                            _DetailRow(
                              left: 'Tanggal',
                              right: _formatDateId(d.orderDate.toLocal()),
                            ),
                          ]),
                          const SizedBox(height: 12),
                          _card([
                            for (final item in d.items)
                              _DetailRow(
                                left:
                                    '${item.serviceName} × ${_qty(item.quantity)}',
                                right: _formatRupiah(item.subtotal.round()),
                              ),
                            if (d.happyHourDiscount > 0)
                              _DetailRow(
                                left: 'Happy hour',
                                right:
                                    '- ${_formatRupiah(d.happyHourDiscount.round())}',
                              ),
                            if (d.voucherDiscount > 0)
                              _DetailRow(
                                left: 'Voucher',
                                right:
                                    '- ${_formatRupiah(d.voucherDiscount.round())}',
                              ),
                            if (d.happyHourDiscount <= 0 &&
                                d.voucherDiscount <= 0 &&
                                d.discountAmount > 0)
                              _DetailRow(
                                left: 'Diskon',
                                right:
                                    '- ${_formatRupiah(d.discountAmount.round())}',
                              ),
                            const Divider(height: 18),
                            _DetailRow(
                              left: 'Total',
                              right: _formatRupiah(d.totalAmount.round()),
                              greenRight: true,
                            ),
                          ]),
                          const SizedBox(height: 12),
                          _card([
                            const Text(
                              'Riwayat status',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: _textDark,
                              ),
                            ),
                            const SizedBox(height: 8),
                            for (final log in d.statusLogs)
                              _DetailRow(
                                left: _BackendOrderCard._statusLabel(
                                  log.status,
                                ),
                                right: _formatDateId(log.createdAt.toLocal()),
                              ),
                          ]),
                          // Batch 6 (S8): ulasan diminta setelah cucian selesai.
                          if (d.status == 'COMPLETED') ...[
                            const SizedBox(height: 12),
                            _ReviewCard(orderId: d.id),
                          ],
                        ],
                      ),
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: d != null && d.isUnpaid
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: AppOutlineButton(
                        label: 'Batalkan',
                        onTap: _busy ? null : _cancel,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _busy
                          ? const AppDisabledButton(label: 'Memproses…')
                          : AppPrimaryButton(
                              label: 'Lanjutkan Pembayaran',
                              onTap: _continuePayment,
                            ),
                    ),
                  ],
                ),
              ),
            )
          : null,
    );
  }

  String _qty(double q) =>
      q == q.roundToDouble() ? q.toInt().toString() : q.toString();

  Widget _card(List<Widget> children) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: _line),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: children,
    ),
  );
}
