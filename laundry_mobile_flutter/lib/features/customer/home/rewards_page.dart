part of '../home_screen.dart';

/// Batch 6 (R3): tukar poin dengan voucher. Katalog & syarat dari server
/// (`GET /mobile/me/rewards`); penukaran `POST /points/redeem-voucher` —
/// server menegakkan ulang periode, kuota, tier, dan batas per pengguna.
class _RewardsPage extends StatefulWidget {
  const _RewardsPage();

  @override
  State<_RewardsPage> createState() => _RewardsPageState();
}

class _RewardsPageState extends State<_RewardsPage> {
  RewardCatalog? _catalog;
  bool _loading = true;
  String? _error;
  String? _redeeming;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = context.read<AuthController>().accessToken;
    if (token == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final c = await context.read<CustomerController>().getRewards(accessToken: token);
      if (!mounted) return;
      setState(() {
        _catalog = c;
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
        _error = 'Gagal memuat katalog voucher.';
      });
    }
  }

  Future<void> _redeem(RewardItem item) async {
    final catalog = _catalog;
    final auth = context.read<AuthController>();
    final token = auth.accessToken;
    final user = auth.user;
    if (catalog?.walletId == null || token == null || user == null || _redeeming != null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Tukar poin?'),
        content: Text('Tukar ${item.pointCost} poin dengan "${item.name}"?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: const Text('Batal')),
          TextButton(onPressed: () => Navigator.of(dialog).pop(true), child: const Text('Tukar')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _redeeming = item.templateId);
    final controller = context.read<CustomerController>();
    final voucher = await controller.redeemPointVoucher(
      user: user,
      accessToken: token,
      templateId: item.templateId,
    );
    if (!mounted) return;
    setState(() => _redeeming = null);
    if (voucher != null) {
      AppToast.success(context, 'Voucher ${item.name} masuk ke Voucher Saya.');
    } else {
      AppToast.error(context, controller.errorMessage ?? 'Penukaran gagal.');
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final c = _catalog;
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Column(
          children: [
            const _BlueHeader(title: 'Tukar Poin', showBack: true),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                  children: [
                    if (c != null)
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppColors.tintBlueAlt,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.stars_rounded, color: _primary),
                            const SizedBox(width: 10),
                            Text(
                              '${c.pointBalance} poin tersedia',
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textDark),
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 16),
                    if (_loading)
                      const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator()))
                    else if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 40),
                        child: Column(
                          children: [
                            Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: _textMuted)),
                            TextButton(onPressed: _load, child: const Text('Coba lagi')),
                          ],
                        ),
                      )
                    else if (c == null || c.items.isEmpty)
                      const MascotMessageCard(
                        mascotAsset: AppMascotAssets.promoEmptyWaiting,
                        variant: MascotMessageVariant.voucher,
                        compact: true,
                        title: 'Belum ada voucher untuk ditukar',
                        message: 'Kumpulkan poin dari setiap transaksi. Voucher baru akan muncul di sini.',
                      )
                    else
                      ...c.items.map(_tile),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile(RewardItem item) {
    final busy = _redeeming == item.templateId;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _line),
      ),
      child: Row(
        children: [
          const Icon(Icons.confirmation_number_outlined, color: _primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name, style: const TextStyle(fontWeight: FontWeight.w700, color: _textDark)),
                if ((item.description ?? '').isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(item.description!, style: const TextStyle(fontSize: 12, color: _textMuted)),
                ],
                const SizedBox(height: 4),
                Text(
                  item.canRedeem ? '${item.pointCost} poin' : '${item.pointCost} poin • ${item.reason ?? 'Belum bisa ditukar'}',
                  style: TextStyle(fontSize: 12, color: item.canRedeem ? _primary : _textMuted, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: item.canRedeem && _redeeming == null ? () => _redeem(item) : null,
            style: FilledButton.styleFrom(backgroundColor: _primary),
            child: busy
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Tukar'),
          ),
        ],
      ),
    );
  }
}
