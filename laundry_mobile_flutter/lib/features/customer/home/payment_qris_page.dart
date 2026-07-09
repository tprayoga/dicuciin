part of '../home_screen.dart';

class _PaymentQrisPage extends StatefulWidget {
  const _PaymentQrisPage({
    required this.data,
    required this.total,
    required this.orderId,
  });

  final _CheckoutData data;
  final int total;
  final String orderId;

  @override
  State<_PaymentQrisPage> createState() => _PaymentQrisPageState();
}

class _PaymentQrisPageState extends State<_PaymentQrisPage> {
  GatewayPayment? _payment;
  bool _loading = true;
  bool _simulating = false;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _createPayment();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  String? get _token => context.read<AuthController>().accessToken;

  Future<void> _createPayment() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final token = _token;
    if (token == null) {
      setState(() {
        _loading = false;
        _error = 'Sesi berakhir. Silakan masuk lagi.';
      });
      return;
    }
    try {
      final payment = await context.read<CustomerController>().createGatewayPayment(
            accessToken: token,
            orderId: widget.orderId,
            method: 'QRIS',
          );
      if (!mounted) return;
      setState(() {
        _payment = payment;
        _loading = false;
      });
      _startPolling();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Gagal membuat tagihan.';
        });
      }
    }
  }

  void _startPolling() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 3), (_) => _checkStatus());
  }

  Future<void> _checkStatus() async {
    final token = _token;
    final pn = _payment?.paymentNumber;
    if (token == null || pn == null) return;
    try {
      final status = await context.read<CustomerController>().getPaymentStatus(
            accessToken: token,
            paymentNumber: pn,
          );
      if (!mounted) return;
      if (status.isPaid) {
        _poll?.cancel();
        _goSuccess();
      } else {
        setState(() => _payment = status);
      }
    } catch (_) {
      // diamkan; poll berikutnya coba lagi
    }
  }

  Future<void> _simulate() async {
    final token = _token;
    final pn = _payment?.paymentNumber;
    if (token == null || pn == null) return;
    setState(() => _simulating = true);
    try {
      await context.read<CustomerController>().simulatePayment(
            accessToken: token,
            paymentNumber: pn,
          );
      await _checkStatus();
    } on ApiException catch (e) {
      if (mounted) AppToast.error(context, e.message);
    } finally {
      if (mounted) setState(() => _simulating = false);
    }
  }

  void _goSuccess() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => _OrderSuccessPage(
          data: widget.data,
          methodLabel: 'QRIS',
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
                      : ListView(
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
                                'Status akan diperbarui otomatis setelah pembayaran berhasil.',
                              ],
                            ),
                          ],
                        ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _loading || _error != null ? null : _bottomBar(),
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
            child: const Icon(Icons.qr_code_2_rounded, size: 192),
          ),
          const SizedBox(height: 8),
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
                'Menunggu pembayaran…',
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
                        // Tombol dev: mensimulasikan callback gateway (mock).
                        label: 'Simulasikan Bayar',
                        onTap: _simulate,
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
