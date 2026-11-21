part of '../home_screen.dart';

/// Batch 6 (R1): kotak notifikasi dari server (`GET /notifications/me`).
/// Sebelumnya berisi data contoh statis.
class _NotificationPage extends StatefulWidget {
  const _NotificationPage();

  @override
  State<_NotificationPage> createState() => _NotificationPageState();
}

class _NotificationPageState extends State<_NotificationPage> {
  List<AppNotification> _items = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  String? get _token => context.read<AuthController>().accessToken;

  Future<void> _load() async {
    final token = _token;
    if (token == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final inbox = await context.read<CustomerController>().loadNotifications(accessToken: token);
      if (!mounted) return;
      setState(() {
        _items = inbox.items;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Gagal memuat notifikasi.';
      });
    }
  }

  Future<void> _open(AppNotification n) async {
    final token = _token;
    if (token == null) return;
    final controller = context.read<CustomerController>();
    if (!n.isRead) {
      try {
        await controller.markNotificationRead(accessToken: token, id: n.id);
      } catch (_) {}
      if (mounted) {
        setState(() {
          _items = [
            for (final i in _items)
              i.id == n.id
                  ? AppNotification(
                      id: i.id,
                      type: i.type,
                      title: i.title,
                      body: i.body,
                      createdAt: i.createdAt,
                      readAt: DateTime.now(),
                      data: i.data,
                    )
                  : i,
          ];
        });
      }
    }
    final orderId = n.orderId;
    if (orderId != null && mounted) {
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => _OrderDetailPage(orderId: orderId)),
      );
    }
  }

  Future<void> _readAll() async {
    final token = _token;
    if (token == null) return;
    try {
      await context.read<CustomerController>().markAllNotificationsRead(accessToken: token);
      await _load();
    } on ApiException catch (e) {
      if (mounted) AppToast.error(context, e.message);
    }
  }

  ({IconData icon, Color color, Color bg}) _style(String type) {
    switch (type) {
      case 'TOPUP_PAID':
        return (icon: Icons.account_balance_wallet, color: AppColors.success, bg: AppColors.successBg);
      case 'ORDER_COMPLETED':
        return (icon: Icons.star_rate_rounded, color: AppColors.warning, bg: AppColors.warningBg);
      default:
        return (icon: Icons.local_laundry_service, color: _primary, bg: AppColors.tintBlue);
    }
  }

  String _timeAgo(DateTime t) {
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'Baru saja';
    if (d.inHours < 1) return '${d.inMinutes} menit lalu';
    if (d.inDays < 1) return '${d.inHours} jam lalu';
    if (d.inDays == 1) return 'Kemarin';
    if (d.inDays < 7) return '${d.inDays} hari lalu';
    return _formatDateId(t);
  }

  @override
  Widget build(BuildContext context) {
    final hasUnread = _items.any((n) => !n.isRead);
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const _BlueHeader(title: 'Notifikasi', showBack: true),
            if (hasUnread)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: _readAll,
                  child: const Text('Tandai semua dibaca'),
                ),
              ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                    ? _message(_error!, icon: Icons.cloud_off_outlined, retry: true)
                    : _items.isEmpty
                    ? _message('Belum ada notifikasi', icon: Icons.notifications_off_outlined)
                    : ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                        itemCount: _items.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 12),
                        itemBuilder: (_, i) => _tile(_items[i]),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile(AppNotification item) {
    final s = _style(item.type);
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => _open(item),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: item.isRead ? Colors.white : AppColors.tintBlueAlt,
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
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: _textDark),
                        ),
                      ),
                      if (!item.isRead)
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(color: _primary, shape: BoxShape.circle),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(item.body, style: const TextStyle(fontSize: 13, color: _textMuted, height: 1.4)),
                  if (item.asksReview) ...[
                    const SizedBox(height: 6),
                    const Text(
                      'Ketuk untuk memberi ulasan',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _primary),
                    ),
                  ],
                  const SizedBox(height: 6),
                  Text(
                    _timeAgo(item.createdAt),
                    style: const TextStyle(fontSize: 12, color: AppColors.textMutedLight),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _message(String text, {required IconData icon, bool retry = false}) {
    // ListView agar pull-to-refresh tetap bekerja di keadaan kosong/galat.
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 120),
        Icon(icon, size: 64, color: AppColors.textMutedLight),
        const SizedBox(height: 12),
        Text(text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, color: _textMuted)),
        if (retry)
          Center(
            child: TextButton(onPressed: _load, child: const Text('Coba lagi')),
          ),
      ],
    );
  }
}
