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
      await context.read<CustomerController>().loadDashboard(
        user: user,
        accessToken: token,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.watch<CustomerController>();
    final balance = context.watch<WalletController>().balance;
    final wallet = c.wallet;
    final stats = c.stats;
    final txns = c.wallet?.transactions ?? const [];
    final orders = c.orders;
    final promos = c.promos;
    final vouchers = c.vouchers;
    final membership = c.membershipStatus;
    final summary = c.memberSummary;
    final points = c.memberPoints;
    final partner = context.watch<AuthController>().user?.b2bPartner;

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
                  const SizedBox(height: 12),
                  _tierProgressCard(summary, membership, wallet),
                  const SizedBox(height: 12),
                  _pointCard(summary, points),
                  if (partner != null) ...[
                    const SizedBox(height: 12),
                    _b2bPartnerCard(partner),
                  ],
                  const SizedBox(height: 20),

                  // ── Statistik order ──
                  _sectionTitle('Statistik'),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _statTile(
                        'Total Order',
                        '${stats.totalOrders}',
                        Icons.receipt_long_outlined,
                      ),
                      const SizedBox(width: 12),
                      _statTile(
                        'Selesai',
                        '${stats.completedOrders}',
                        Icons.check_circle_outline,
                      ),
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

                  // ── Voucher saya (UserVoucher milik customer) ──
                  _sectionTitle('Voucher Saya'),
                  const SizedBox(height: 10),
                  if (vouchers.isEmpty)
                    const MascotMessageCard(
                      mascotAsset: AppMascotAssets.promoEmptyWaiting,
                      variant: MascotMessageVariant.voucher,
                      compact: true,
                      title: 'Belum punya voucher aktif',
                      message:
                          'Kamu belum punya voucher aktif. Tukar poin atau ikuti promo untuk dapatkan voucher.',
                    )
                  else
                    ...vouchers.map(_myVoucherRow),
                  const SizedBox(height: 22),

                  // ── Promo publik (kode yang bisa dipakai siapa saja) ──
                  _sectionTitle('Promo Tersedia'),
                  const SizedBox(height: 10),
                  if (promos.isEmpty)
                    _emptyHint('Belum ada promo aktif.')
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
    final wallet = context.watch<CustomerController>().wallet;
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
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _miniBalance(
                  'Bonus',
                  _formatRupiah((wallet?.bonusBalance ?? 0).round()),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _miniBalance('Poin', '${wallet?.pointBalance ?? 0}'),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.of(
                    context,
                  ).push(MaterialPageRoute(builder: (_) => const _TopUpPage())),
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

  Widget _miniBalance(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white24),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Colors.white70, fontSize: 11),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _tierProgressCard(
    MemberSummary? summary,
    MembershipStatus? status,
    WalletData? wallet,
  ) {
    final tier = summary?.membership.tier ??
        status?.currentTier ??
        status?.currentB2BTier ??
        'Silver';
    final spending = summary?.membership.lifetimeSpending ??
        status?.earnedSpending ??
        0;
    final txn = summary?.membership.lifetimeTransactions ??
        status?.successfulTxnCount ??
        0;
    final point = summary?.membership.currentPoints ?? wallet?.pointBalance ?? 0;
    final progress = (summary == null
            ? ((spending % 500000) / 500000).clamp(0.0, 1.0)
            : (summary.membership.tierProgressPercent / 100).clamp(0.0, 1.0))
        .toDouble();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.workspace_premium_outlined, color: _primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '$tier Member',
                  style: const TextStyle(
                    fontSize: 16,
                    color: _textDark,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Text(
                '$point poin',
                style: const TextStyle(
                  color: _primary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              minHeight: 8,
              value: progress,
              color: _primary,
              backgroundColor: AppColors.tintBlueAlt,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${_formatRupiah(spending.round())} spending • $txn transaksi sukses',
            style: const TextStyle(fontSize: 12, color: _textMuted),
          ),
          if (summary != null && summary.membership.nextTier.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'Progress ${summary.membership.tierProgressPercent}% menuju ${summary.membership.nextTier}',
              style: const TextStyle(fontSize: 12, color: _textMuted),
            ),
          ],
        ],
      ),
    );
  }

  Widget _pointCard(MemberSummary? summary, MemberPoints? points) {
    final currentPoints =
        summary?.membership.currentPoints ?? points?.currentPoints ?? 0;
    final lastLedger = points?.ledger.isNotEmpty == true
        ? points!.ledger.first
        : null;
    final message = currentPoints == 0
        ? 'Kamu belum punya poin. Poin akan bertambah setelah transaksi berhasil.'
        : 'Poin kamu bisa ditukar untuk benefit berikutnya.';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _line),
      ),
      child: Row(
        children: [
          const Icon(Icons.stars_outlined, color: _primary),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$currentPoints Poin',
                  style: const TextStyle(
                    fontSize: 16,
                    color: _textDark,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  lastLedger == null
                      ? message
                      : '${lastLedger.direction == 'CREDIT' ? '+' : '-'}${lastLedger.points} poin terakhir',
                  style: const TextStyle(fontSize: 12, color: _textMuted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _b2bPartnerCard(B2BPartnerProfile partner) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.tintBlueAlt,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _primary.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          const Icon(Icons.business_center_outlined, color: _primary),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  partner.companyName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: _textDark,
                  ),
                ),
                Text(
                  '${partner.partnerCode} • ${partner.tier}',
                  style: const TextStyle(fontSize: 12, color: _textMuted),
                ),
              ],
            ),
          ),
          Text(
            _formatRupiah((partner.wallet?.balance ?? 0).round()),
            style: const TextStyle(
              color: AppColors.success,
              fontWeight: FontWeight.w700,
            ),
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
          const Icon(
            Icons.confirmation_number_outlined,
            color: _primary,
            size: 22,
          ),
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

  String _voucherTypeLabel(String t) {
    switch (t) {
      case 'PERCENTAGE_DISCOUNT':
        return 'Diskon persen';
      case 'NOMINAL_DISCOUNT':
        return 'Potongan nominal';
      case 'FREE_WASH':
        return 'Gratis cuci';
      case 'FREE_DRY':
        return 'Gratis pengering';
      case 'FREE_WASH_DRY':
        return 'Gratis cuci & kering';
      case 'B2B_EXCLUSIVE':
        return 'Khusus B2B';
      case 'TIER_EXCLUSIVE':
        return 'Khusus tier';
      case 'LOTTERY_TICKET':
        return 'Tiket undian';
      default:
        return t;
    }
  }

  /// Baris voucher milik customer (UserVoucher) dengan badge status.
  Widget _myVoucherRow(UserVoucher v) {
    StatusBadgeType badgeType;
    String badgeLabel;
    switch (v.status) {
      case 'ACTIVE':
        badgeType = StatusBadgeType.success;
        badgeLabel = 'Aktif';
        break;
      case 'USED':
        badgeType = StatusBadgeType.info;
        badgeLabel = 'Terpakai';
        break;
      case 'EXPIRED':
        badgeType = StatusBadgeType.error;
        badgeLabel = 'Kedaluwarsa';
        break;
      case 'CANCELLED':
        badgeType = StatusBadgeType.error;
        badgeLabel = 'Dibatalkan';
        break;
      default:
        badgeType = StatusBadgeType.info;
        badgeLabel = v.status;
    }
    final inactive = v.status != 'ACTIVE';
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
          Icon(
            Icons.local_activity_outlined,
            size: 22,
            color: inactive ? _textMuted : _primary,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  v.templateName,
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
                  '${_voucherTypeLabel(v.voucherType)} • ${v.code}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: _textMuted),
                ),
                if (v.expiresAt != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    'Berlaku s/d ${_formatDateId(v.expiresAt!)}',
                    style: const TextStyle(fontSize: 11, color: _textMuted),
                  ),
                ],
              ],
            ),
          ),
          StatusBadge(badgeLabel, type: badgeType),
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
    child: Text(msg, style: const TextStyle(fontSize: 13, color: _textMuted)),
  );
}
