part of '../home_screen.dart';

enum _NotifType { order, promo, wallet }

class _NotifItem {
  const _NotifItem({
    required this.type,
    required this.title,
    required this.body,
    required this.time,
    this.unread = false,
  });

  final _NotifType type;
  final String title;
  final String body;
  final String time;
  final bool unread;
}

class _NotificationPage extends StatefulWidget {
  const _NotificationPage();

  @override
  State<_NotificationPage> createState() => _NotificationPageState();
}

class _NotificationPageState extends State<_NotificationPage> {
  // Data mock — nanti diganti dari backend
  final List<_NotifItem> _items = [
    const _NotifItem(
      type: _NotifType.order,
      title: 'Mesin sebentar lagi selesai',
      body: 'Mesin Cuci #01 akan selesai dalam 5 menit. Siapkan keranjangmu.',
      time: 'Baru saja',
      unread: true,
    ),
    const _NotifItem(
      type: _NotifType.wallet,
      title: 'Top up berhasil',
      body: 'Saldo kamu bertambah Rp100.000. Saldo sekarang Rp100.000.',
      time: '2 jam lalu',
      unread: true,
    ),
    const _NotifItem(
      type: _NotifType.promo,
      title: 'Promo Diskon 20%',
      body: 'Nikmati diskon 20% untuk semua layanan hingga 30 Mei 2026.',
      time: 'Kemarin',
    ),
    const _NotifItem(
      type: _NotifType.order,
      title: 'Pembayaran berhasil',
      body: 'Pembayaran order #ORD0001 sebesar Rp20.000 telah dikonfirmasi.',
      time: '2 hari lalu',
    ),
  ];

  ({IconData icon, Color color, Color bg}) _style(_NotifType type) {
    switch (type) {
      case _NotifType.order:
        return (icon: Icons.local_laundry_service, color: _primary, bg: AppColors.tintBlue);
      case _NotifType.promo:
        return (icon: Icons.local_offer, color: AppColors.warning, bg: AppColors.warningBg);
      case _NotifType.wallet:
        return (icon: Icons.account_balance_wallet, color: AppColors.success, bg: AppColors.successBg);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const _BlueHeader(title: 'Notifikasi', showBack: true),
            Expanded(
              child: _items.isEmpty
                  ? _emptyState()
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                      itemCount: _items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 12),
                      itemBuilder: (_, i) => _tile(_items[i]),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile(_NotifItem item) {
    final s = _style(item.type);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: item.unread ? AppColors.tintBlueAlt : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _line),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: s.bg, shape: BoxShape.circle),
            child: Icon(s.icon, color: s.color, size: 21),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.title,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: _textDark,
                        ),
                      ),
                    ),
                    if (item.unread)
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: _primary,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  item.body,
                  style: const TextStyle(
                    fontSize: 13,
                    color: _textMuted,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  item.time,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textMutedLight,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptyState() {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.notifications_off_outlined,
              size: 64, color: AppColors.textMutedLight),
          SizedBox(height: 12),
          Text(
            'Belum ada notifikasi',
            style: TextStyle(fontSize: 15, color: _textMuted),
          ),
        ],
      ),
    );
  }
}
