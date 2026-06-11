part of '../home_screen.dart';

/// Dashboard member: saldo & transaksi, statistik & riwayat order,
/// serta voucher/promo yang dimiliki. Data dari [CustomerController].
class _MemberDashboardPage extends StatelessWidget {
  const _MemberDashboardPage();

  Future<void> _refresh(BuildContext context) async {
    final auth = context.read<AuthController>();
    final user = auth.user;
    final token = auth.accessToken;
    if (user != null && token != null) {
      await context
          .read<CustomerController>()
          .loadDashboard(user: user, accessToken: token);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.watch<CustomerController>();
    final balance = context.watch<WalletController>().balance;
    final stats = c.stats;
    final txns = c.wallet?.transactions ?? const [];
    final orders = c.orders;
    final promos = c.promos;

    return Scaffold(
      backgroundColor: _bg,
      body: Column(
        children: [
          const _BlueHeader(title: 'Dashboard Member', showBack: true),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => _refresh(context),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  // ── Saldo ──
                  _balanceCard(context, balance),
                  const SizedBox(height: 20),

                  // ── Statistik order ──
                  _sectionTitle('Statistik'),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _statTile('Total Order', '${stats.totalOrders}',
                          Icons.receipt_long_outlined),
                      const SizedBox(width: 12),
                      _statTile('Selesai', '${stats.completedOrders}',
                          Icons.check_circle_outline),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      _statTile(
                        'Total Belanja',
                        _formatRupiah(stats.totalSpending.round()),
                        Icons.payments_outlined,
                      ),
                      const SizedBox(width: 12),
                      _statTile(
                        'Favorit',
                        stats.favoriteService ?? '-',
                        Icons.local_laundry_service_outlined,
                      ),
                    ],
                  ),
                  const SizedBox(height: 22),

                  // ── Transaksi saldo ──
                  _sectionTitle('Riwayat Transaksi Saldo'),
                  const SizedBox(height: 10),
                  if (txns.isEmpty)
                    _emptyHint('Belum ada transaksi saldo.')
                  else
                    ...txns.take(8).map(_txnRow),
                  const SizedBox(height: 22),

                  // ── Riwayat order ──
                  _sectionTitle('Riwayat Order'),
                  const SizedBox(height: 10),
                  if (orders.isEmpty)
                    _emptyHint('Belum ada order.')
                  else
                    ...orders.take(6).map(_orderRow),
                  const SizedBox(height: 22),

                  // ── Voucher / promo ──
                  _sectionTitle('Voucher & Promo Kamu'),
                  const SizedBox(height: 10),
                  if (promos.isEmpty)
                    _emptyHint('Belum ada voucher aktif.')
                  else
                    ...promos.map(_promoRow),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String t) => Text(
        t,
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: _textDark,
        ),
      );

  Widget _balanceCard(BuildContext context, int balance) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: _blue,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Saldo Wallet',
            style: TextStyle(color: Colors.white70, fontSize: 13),
          ),
          const SizedBox(height: 6),
          Text(
            _formatRupiah(balance),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 26,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const _TopUpPage()),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white70),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Top up'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _statTile(String label, String value, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: _primary, size: 20),
            const SizedBox(height: 10),
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: _textDark,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(fontSize: 12, color: _textMuted),
            ),
          ],
        ),
      ),
    );
  }

  Widget _txnRow(WalletTransaction t) {
    final isOut = t.amount < 0;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _line),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: isOut ? AppColors.errorBg : AppColors.successBg,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              isOut ? Icons.arrow_upward : Icons.arrow_downward,
              size: 18,
              color: isOut ? AppColors.error : AppColors.success,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t.description ?? (isOut ? 'Pembayaran' : 'Top up'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: _textDark,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _formatDateId(t.createdAt),
                  style: const TextStyle(fontSize: 12, color: _textMuted),
                ),
              ],
            ),
          ),
          Text(
            '${isOut ? '-' : '+'}${_formatRupiah(t.amount.abs().round())}',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: isOut ? AppColors.error : AppColors.success,
            ),
          ),
        ],
      ),
    );
  }

  Widget _orderRow(OrderSummary o) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _line),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  o.orderNumber,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: _textDark,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${o.outletName} · ${_formatDateId(o.orderDate)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: _textMuted),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _formatRupiah(o.totalAmount.round()),
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: _textDark,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                o.status,
                style: const TextStyle(fontSize: 11, color: _primary),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _promoRow(PromoSummary p) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.tintBlueAlt,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _primary.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.confirmation_number_outlined,
              color: _primary, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: _textDark,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Kode: ${p.code}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: _primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptyHint(String msg) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _line),
        ),
        child: Text(
          msg,
          style: const TextStyle(fontSize: 13, color: _textMuted),
        ),
      );
}
