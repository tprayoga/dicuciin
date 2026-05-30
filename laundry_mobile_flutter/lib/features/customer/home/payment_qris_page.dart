part of '../home_screen.dart';

class _PaymentQrisPage extends StatefulWidget {
  const _PaymentQrisPage({required this.data, required this.total});

  final _CheckoutData data;
  final int total;

  @override
  State<_PaymentQrisPage> createState() => _PaymentQrisPageState();
}

class _PaymentQrisPageState extends State<_PaymentQrisPage> {
  static const _initialSeconds = 5 * 60;
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
                  _qrisCard(),
                  const SizedBox(height: 16),
                  const _PaymentInstructionCard(
                    title: 'Petunjuk Pembayaran QRIS',
                    items: [
                      'Simpan atau screenshot kode QR sebelum waktu pembayaran habis.',
                      'Scan QR dari m-banking, e-wallet, atau aplikasi pembayaran lain.',
                      'Pastikan nama merchant dan nominal pembayaran sudah sesuai.',
                      'Lanjutkan pembayaran lalu tunggu status berhasil diperbarui otomatis.',
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
            child: _isExpired
                ? const Center(
                    child: Text(
                      'Kode QR kedaluwarsa',
                      style: TextStyle(
                        fontSize: 13,
                        color: _textMuted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                : const Icon(Icons.qr_code_2_rounded, size: 192),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: AppOutlineButton(
                  label: _isExpired ? 'Muat Ulang Kode' : 'Simpan Kode QR',
                  onTap: _isExpired ? _restartTimer : _onSaveQr,
                ),
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
                child: _isExpired
                    ? const AppDisabledButton(label: 'Waktu Habis')
                    : AppPrimaryButton(
                        label: 'Saya Sudah Bayar',
                        onTap: () {
                          Navigator.of(context).pushReplacement(
                            MaterialPageRoute(
                              builder: (_) => _OrderSuccessPage(
                                data: widget.data,
                                methodLabel: 'QRIS',
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

  void _onSaveQr() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Kode QR berhasil disimpan (mock).')),
    );
  }
}
