part of '../home_screen.dart';

class _PaymentQrisPage extends StatefulWidget {
  const _PaymentQrisPage({
    required this.data,
    required this.total,
    required this.orderId,
    this.topupAmount,
  });

  final _CheckoutData data;
  final int total;
  final String orderId;

  /// Batch 4: diisi → halaman ini menagih TOP-UP saldo (bukan order).
  final int? topupAmount;

  @override
  State<_PaymentQrisPage> createState() => _PaymentQrisPageState();
}

class _PaymentQrisPageState extends State<_PaymentQrisPage>
    with _PaymentAttemptFlow<_PaymentQrisPage> {
  bool _simulating = false;

  @override
  String get _attemptMethod => 'QRIS';

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
    _showOrderSuccess(
      Navigator.of(context),
      _OrderSuccessPage(
        data: widget.data,
        methodLabel: 'QRIS',
        total: widget.total,
        orderId: widget.orderId,
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
                            _qrisCard(),
                            const SizedBox(height: 16),
                            const _PaymentInstructionCard(
                              title: 'Petunjuk Pembayaran QRIS',
                              items: [
                                'Scan QR dari m-banking, e-wallet, atau aplikasi pembayaran lain.',
                                'Pastikan nama merchant dan nominal sudah sesuai.',
                                'Bayar dari HP yang sama? Simpan QR ke galeri, lalu pilih gambar QR di aplikasi pembayaran.',
                                'Status akan diperbarui otomatis setelah pembayaran berhasil.',
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

  bool _savingQr = false;

  Future<void> _saveQr() async {
    final url = _payment?.qrString;
    if (url == null || _savingQr) return;
    setState(() => _savingQr = true);
    final result = await saveQrImage(url, name: 'QRIS-${_payment?.paymentNumber ?? 'dicuciin'}');
    if (!mounted) return;
    setState(() => _savingQr = false);
    switch (result) {
      case QrSaveResult.saved:
        AppToast.success(context, 'QR tersimpan di galeri.');
      case QrSaveResult.openedInBrowser:
        AppToast.info(context, 'QR dibuka di browser — simpan gambarnya dari sana.');
      case QrSaveResult.permissionDenied:
        AppToast.error(context, 'Izin galeri ditolak. Aktifkan di pengaturan HP.');
      case QrSaveResult.failed:
        AppToast.error(context, 'Gagal menyimpan QR. Coba lagi atau screenshot layar.');
    }
  }

  Widget _qrisCard() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Column(
        children: [
          const Text(
            'QRIS',
            style: TextStyle(
              fontSize: 17,
              color: _textDark,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          const Text(
            'QR Code Standar Pembayaran Nasional',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, color: _textMuted, height: 1.3),
          ),
          const SizedBox(height: 14),
          Container(
            width: 238,
            height: 238,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: Colors.white,
              border: Border.all(color: AppColors.borderLight),
            ),
            child: _payment?.qrString != null
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(11),
                    child: Image.network(
                      _payment!.qrString!,
                      fit: BoxFit.contain,
                      loadingBuilder: (_, child, progress) => progress == null
                          ? child
                          : const Center(child: CircularProgressIndicator()),
                      errorBuilder: (_, _, _) => const Center(
                        child: Text(
                          'QR tidak dapat dimuat',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  )
                : const Icon(Icons.qr_code_2_rounded, size: 192),
          ),
          const SizedBox(height: 8),
          // Batch 6 (R4/R5): nama merchant yang harus tampil di aplikasi
          // pembayar + simpan QR ke galeri (bayar dari m-banking di HP sama).
          Text(
            'Merchant: ${AppConfig.merchantName}',
            style: const TextStyle(fontSize: 13, color: _textDark, fontWeight: FontWeight.w600),
          ),
          if (_payment?.qrString != null)
            TextButton.icon(
              onPressed: _savingQr ? null : _saveQr,
              icon: _savingQr
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.download_rounded, size: 18),
              label: const Text('Simpan QR ke Galeri'),
            ),
          const SizedBox(height: 4),
          // Menunggu pembayaran (status real dari gateway).
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
}
