part of '../home_screen.dart';

class _PaymentVaPage extends StatefulWidget {
  const _PaymentVaPage({
    required this.bank,
    required this.data,
    required this.total,
    required this.orderId,
    this.topupAmount,
  });

  final String bank;
  final _CheckoutData data;
  final int total;
  final String orderId;

  /// Batch 4: diisi → halaman ini menagih TOP-UP saldo (bukan order).
  final int? topupAmount;

  @override
  State<_PaymentVaPage> createState() => _PaymentVaPageState();
}

class _PaymentVaPageState extends State<_PaymentVaPage>
    with _PaymentAttemptFlow<_PaymentVaPage> {
  bool _simulating = false;

  @override
  String get _attemptMethod => 'VA';

  @override
  String? get _attemptBank => _bankShortName;

  @override
  String get _attemptOrderId => widget.orderId;

  @override
  int? get _topupAmount => widget.topupAmount;

  @override
  void initState() {
    super.initState();
    _createPayment();
  }

  @override
  void dispose() {
    _disposeAttempt();
    super.dispose();
  }

  String get _bankShortName {
    if (widget.bank.contains('BCA')) return 'BCA';
    if (widget.bank.contains('BRI')) return 'BRI';
    if (widget.bank.contains('BNI')) return 'BNI';
    return 'PERMATA';
  }

  Color get _bankColor {
    if (widget.bank.contains('BCA')) return PaymentBrandColors.bca;
    if (widget.bank.contains('BRI')) return PaymentBrandColors.bri;
    if (widget.bank.contains('BNI')) return PaymentBrandColors.bni;
    return PaymentBrandColors.permata;
  }

  String get _vaNumber => _payment?.vaNumber ?? '-';

  Future<void> _simulate() async {
    final token = _token;
    final pn = _payment?.paymentNumber;
    if (token == null || pn == null) return;
    setState(() => _simulating = true);
    try {
      await _attemptSimulate(token, pn);
      await _checkStatus();
    } on ApiException catch (e) {
      if (mounted) AppToast.error(context, e.message);
    } finally {
      if (mounted) setState(() => _simulating = false);
    }
  }

  @override
  void _onAttemptPaid() {
    if (widget.topupAmount != null) {
      // Top-up: kembali ke halaman top-up dengan hasil lunas dari server.
      Navigator.of(context).pop(true);
      return;
    }
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => _OrderSuccessPage(
          data: widget.data,
          methodLabel: 'Virtual Account ${widget.bank}',
          total: widget.total,
          orderId: widget.orderId,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Column(
          children: [
            const _BlueHeader(title: 'Pembayaran', showBack: true),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                  ? _errorView()
                  : _attemptEndedView() ??
                        ListView(
                          padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
                          children: [
                            _summaryCard(),
                            const SizedBox(height: 16),
                            _vaCard(),
                            const SizedBox(height: 16),
                            const _PaymentInstructionCard(
                              title: 'Petunjuk Pembayaran Virtual Account',
                              items: [
                                'Salin nomor Virtual Account terlebih dahulu.',
                                'Buka aplikasi m-banking/ATM sesuai bank yang dipilih.',
                                'Pilih menu Transfer atau Virtual Account.',
                                'Masukkan nomor VA dan pastikan nominal sesuai.',
                                'Status order akan diperbarui otomatis setelah berhasil.',
                              ],
                            ),
                          ],
                        ),
            ),
          ],
        ),
      ),
      bottomNavigationBar:
          _loading || _error != null || _attemptEndedView() != null
          ? null
          : _bottomBar(),
    );
  }

  Widget _errorView() => Padding(
    padding: const EdgeInsets.all(24),
    child: Center(
      child: MascotMessageCard(
        mascotAsset: AppMascotAssets.paymentFailedReceipt,
        variant: MascotMessageVariant.error,
        fullWidth: false,
        title: 'Pembayaran belum berhasil',
        message: _error!,
        primaryButtonText: 'Coba Lagi',
        onPrimaryPressed: _createPayment,
      ),
    ),
  );

  Widget _summaryCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              'Total Pembayaran',
              style: TextStyle(
                fontSize: 13,
                color: _textMuted,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Text(
            _formatRupiah(widget.total),
            style: const TextStyle(
              fontSize: 16,
              color: _textDark,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _vaCard() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Column(
        children: [
          Text(
            _bankShortName,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 34,
              color: _bankColor,
              fontWeight: FontWeight.w700,
              height: 1.05,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Virtual Account ${widget.bank}',
            style: const TextStyle(
              fontSize: 14,
              color: _textDark,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              color: AppColors.surfaceAlt,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.borderLight),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Nomor Virtual Account',
                  style: TextStyle(
                    fontSize: 12,
                    color: _textMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _vaNumber,
                  style: const TextStyle(
                    fontSize: 22,
                    color: _primary,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: AppOutlineButton(label: 'Salin Nomor', onTap: _onCopyVa),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 8),
              Text(
                _attemptStatusLabel,
                style: TextStyle(fontSize: 12, color: _textMuted),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _bottomBar() {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: _line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
          child: Row(
            children: [
              Expanded(
                child: AppOutlineButton(
                  label: 'Ganti Metode',
                  onTap: () => Navigator.of(context).pop(),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _simulating
                    ? const AppDisabledButton(label: 'Memproses…')
                    : AppPrimaryButton(
                        label: AppConfig.paymentSimulationEnabled
                            ? 'Simulasikan Bayar'
                            : 'Cek Status',
                        onTap: AppConfig.paymentSimulationEnabled
                            ? _simulate
                            : _checkStatus,
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _onCopyVa() async {
    await Clipboard.setData(ClipboardData(text: _vaNumber));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Nomor Virtual Account disalin.')),
    );
  }
}
