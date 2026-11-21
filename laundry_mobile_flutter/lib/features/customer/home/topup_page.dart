part of '../home_screen.dart';

/// Top up saldo (Batch 4): Saldo → pilih nominal → QRIS/VA → instruksi bayar →
/// menunggu pelunasan (status SERVER) → saldo diperbarui dari server.
///
/// Aplikasi tidak pernah menambah saldo sendiri: saldo hanya bertambah setelah
/// Midtrans melunasi tagihan dan server mengkreditkannya. Batas nominal di sini
/// hanya validasi awal — keputusan akhir tetap di server.
class _TopUpPage extends StatefulWidget {
  const _TopUpPage();

  @override
  State<_TopUpPage> createState() => _TopUpPageState();
}

class _TopUpPageState extends State<_TopUpPage> {
  static const _nominals = [10000, 25000, 50000, 100000, 200000, 500000];
  static const _banks = ['Bank BCA', 'Bank BRI', 'Bank BNI', 'Bank Permata'];
  static const _minAmount = 10000;
  static const _maxAmount = 1000000;

  final _customController = TextEditingController();
  int? _selectedNominal;
  String _method = 'QRIS';
  String _bank = _banks.first;
  bool _submitting = false;
  List<GatewayPayment> _history = const [];
  bool _historyLoading = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<WalletController>().loadBalance();
      _loadHistory();
    });
  }

  @override
  void dispose() {
    _customController.dispose();
    super.dispose();
  }

  int? get _amount =>
      _selectedNominal ??
      int.tryParse(_customController.text.replaceAll('.', ''));

  String? get _amountError {
    final a = _amount;
    if (a == null) return null;
    if (a < _minAmount) return 'Minimal ${_rupiahText(_minAmount)}';
    if (a > _maxAmount) return 'Maksimal ${_rupiahText(_maxAmount)}';
    return null;
  }

  String _rupiahText(int value) => _formatRupiah(value);

  Future<void> _loadHistory() async {
    final token = context.read<AuthController>().accessToken;
    if (token == null) return;
    try {
      final rows = await context.read<CustomerController>().listWalletTopups(
        accessToken: token,
      );
      if (!mounted) return;
      setState(() {
        _history = rows;
        _historyLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _historyLoading = false);
    }
  }

  Future<void> _submit() async {
    final amount = _amount;
    if (_submitting || amount == null || _amountError != null) return;
    setState(() => _submitting = true);
    final wallet = context.read<WalletController>();
    final navigator = Navigator.of(context);
    final before = wallet.balance;
    final data = _CheckoutData(
      machineName: 'Top Up Saldo',
      machineType: _MachineType.washer,
      capacity: '—',
      estimasi: '—',
      price: amount,
      locationName: '-',
      orderNo: '-',
      date: _formatDateId(DateTime.now()),
      serviceId: '',
      outletId: '',
    );
    try {
      final paid = await navigator.push<bool>(
        MaterialPageRoute(
          builder: (_) => _method == 'QRIS'
              ? _PaymentQrisPage(
                  data: data,
                  total: amount,
                  orderId: '',
                  topupAmount: amount,
                )
              : _PaymentVaPage(
                  bank: _bank,
                  data: data,
                  total: amount,
                  orderId: '',
                  topupAmount: amount,
                ),
        ),
      );
      if (!mounted) return;
      // Saldo SELALU dibaca ulang dari server (bukan dihitung di aplikasi).
      await wallet.loadBalance();
      await _loadHistory();
      if (!mounted) return;
      if (paid == true) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Top up berhasil'),
            content: Text(
              'Saldo bertambah ${_rupiahText(wallet.balance - before)}.\n'
              'Saldo sekarang ${_rupiahText(wallet.balance)}.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final wallet = context.watch<WalletController>();
    final amountError = _amountError;
    final canSubmit = !_submitting && _amount != null && amountError == null;

    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const _BlueHeader(title: 'Top Up Saldo', showBack: true),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  await wallet.loadBalance();
                  await _loadHistory();
                },
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                  children: [
                    _balanceCard(wallet.balance),
                    const SizedBox(height: 20),
                    const Text(
                      'Pilih nominal',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: _textDark,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        for (final n in _nominals)
                          ChoiceChip(
                            label: Text(_rupiahText(n)),
                            selected: _selectedNominal == n,
                            onSelected: _submitting
                                ? null
                                : (_) => setState(() {
                                    _selectedNominal = n;
                                    _customController.clear();
                                  }),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _customController,
                      enabled: !_submitting,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(
                        labelText: 'Nominal lain',
                        hintText: 'Rp10.000 – Rp1.000.000',
                        errorText: amountError,
                        border: const OutlineInputBorder(),
                      ),
                      onChanged: (_) => setState(() => _selectedNominal = null),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      'Metode pembayaran',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: _textDark,
                      ),
                    ),
                    RadioGroup<String>(
                      groupValue: _method,
                      onChanged: (v) {
                        if (!_submitting && v != null) {
                          setState(() => _method = v);
                        }
                      },
                      child: const Column(
                        children: [
                          RadioListTile<String>(
                            value: 'QRIS',
                            title: Text('QRIS'),
                          ),
                          RadioListTile<String>(
                            value: 'VA',
                            title: Text('Virtual Account'),
                          ),
                        ],
                      ),
                    ),
                    if (_method == 'VA')
                      DropdownButtonFormField<String>(
                        initialValue: _bank,
                        items: [
                          for (final b in _banks)
                            DropdownMenuItem(
                              value: b,
                              child: Row(
                                children: [
                                  SizedBox(width: 92, child: BankBrandMark(bank: b, scale: 0.7)),
                                  Text(b),
                                ],
                              ),
                            ),
                        ],
                        onChanged: _submitting
                            ? null
                            : (v) => setState(() => _bank = v ?? _bank),
                        decoration: const InputDecoration(
                          labelText: 'Bank',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    const SizedBox(height: 24),
                    _historySection(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
          child: _submitting
              ? const AppDisabledButton(label: 'Memproses…')
              : canSubmit
              ? AppPrimaryButton(
                  label: 'Top Up ${_rupiahText(_amount!)}',
                  onTap: _submit,
                )
              : const AppDisabledButton(label: 'Pilih nominal'),
        ),
      ),
    );
  }

  Widget _balanceCard(int balance) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: _blue,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      children: [
        const Icon(Icons.account_balance_wallet, color: Colors.white),
        const SizedBox(width: 12),
        const Expanded(
          child: Text(
            'Saldo saat ini',
            style: TextStyle(color: Colors.white70),
          ),
        ),
        Text(
          _rupiahText(balance),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );

  static String _statusLabel(String status) => switch (status) {
    'PAID' => 'Berhasil',
    'PENDING' => 'Menunggu pembayaran',
    'EXPIRED' => 'Kedaluwarsa',
    'CANCELLED' => 'Dibatalkan',
    'FAILED' => 'Gagal',
    'REFUNDED' => 'Dikembalikan',
    _ => status,
  };

  Widget _historySection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Riwayat top up',
          style: TextStyle(fontWeight: FontWeight.w700, color: _textDark),
        ),
        const SizedBox(height: 8),
        if (_historyLoading)
          const LinearProgressIndicator(minHeight: 3)
        else if (_history.isEmpty)
          const Text('Belum ada top up.', style: TextStyle(color: _textMuted))
        else
          for (final t in _history)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                t.isPaid
                    ? Icons.check_circle
                    : t.isPending
                    ? Icons.hourglass_bottom
                    : Icons.cancel_outlined,
                color: t.isPaid ? Colors.green : _textMuted,
              ),
              title: Text(_rupiahText((t.creditAmount ?? t.amount).round())),
              subtitle: Text(
                '${t.method == 'QRIS' ? 'QRIS' : 'VA ${t.bank ?? ''}'} • '
                '${t.createdAt != null ? _formatDateId(t.createdAt!.toLocal()) : ''}',
              ),
              trailing: Text(_statusLabel(t.status)),
            ),
      ],
    );
  }
}
