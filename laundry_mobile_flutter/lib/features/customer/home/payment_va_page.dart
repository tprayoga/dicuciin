part of '../home_screen.dart';

class _PaymentVaPage extends StatefulWidget {
  const _PaymentVaPage({
    required this.bank,
    required this.data,
    required this.total,
  });

  final String bank;
  final _CheckoutData data;
  final int total;

  @override
  State<_PaymentVaPage> createState() => _PaymentVaPageState();
}

class _PaymentVaPageState extends State<_PaymentVaPage> {
  static const _initialSeconds = 5 * 60;
  static const _vaNumber = '1234567890123456';

  int _remaining = _initialSeconds;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  bool get _isExpired => _remaining == 0;

  String get _timerText {
    final m = (_remaining ~/ 60).toString().padLeft(2, '0');
    final s = (_remaining % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  String get _bankShortName {
    if (widget.bank.contains('BCA')) return 'BCA';
    if (widget.bank.contains('BRI')) return 'BRI';
    if (widget.bank.contains('BNI')) return 'BNI';
    if (widget.bank.contains('Mandiri')) return 'mandiri';
    if (widget.bank.contains('BSI')) return 'BSI';
    return 'CIMB\nNiaga';
  }

  Color get _bankColor {
    if (widget.bank.contains('BCA')) return PaymentBrandColors.bca;
    if (widget.bank.contains('BRI')) return PaymentBrandColors.bri;
    if (widget.bank.contains('BNI')) return PaymentBrandColors.bni;
    if (widget.bank.contains('Mandiri')) return PaymentBrandColors.mandiri;
    if (widget.bank.contains('BSI')) return PaymentBrandColors.permata;
    return PaymentBrandColors.cimb;
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
              child: ListView(
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
                      'Selesaikan pembayaran, status order akan diperbarui otomatis.',
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _bottomBar(),
    );
  }

  Widget _summaryCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Column(
        children: [
          Row(
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
          const SizedBox(height: 10),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Batas waktu pembayaran',
                  style: TextStyle(
                    fontSize: 13,
                    color: _textMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: _isExpired ? AppColors.errorBg : AppColors.warningBg,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  _isExpired ? 'Kedaluwarsa' : _timerText,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: _isExpired ? AppColors.error : AppColors.warning,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Align(
            alignment: Alignment.centerRight,
            child: Text(
              'Jatuh tempo 10 April 2026, 10:00 WIB',
              style: TextStyle(fontSize: 12, color: _textMuted),
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
                  label: _isExpired ? 'Buat VA Baru' : 'Ganti Metode',
                  onTap: _isExpired
                      ? _restartTimer
                      : () => Navigator.of(context).pop(),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _isExpired
                    ? const AppDisabledButton(label: 'Waktu Habis')
                    : AppPrimaryButton(
                        label: 'Saya Sudah Bayar',
                        onTap: () {
                          Navigator.of(context).pushReplacement(
                            MaterialPageRoute(
                              builder: (_) => _OrderSuccessPage(
                                data: widget.data,
                                methodLabel: 'Virtual Account ${widget.bank}',
                                total: widget.total,
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_remaining > 0) _remaining--;
      });
    });
  }

  void _restartTimer() {
    setState(() => _remaining = _initialSeconds);
    _startTimer();
  }

  Future<void> _onCopyVa() async {
    await Clipboard.setData(const ClipboardData(text: _vaNumber));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Nomor Virtual Account disalin.')),
    );
  }
}
