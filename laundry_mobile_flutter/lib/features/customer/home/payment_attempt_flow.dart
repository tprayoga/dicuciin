part of '../home_screen.dart';

/// Alur satu percobaan pembayaran QRIS/VA (Batch 2 — T5), dipakai bersama
/// halaman QRIS & VA.
///
/// - Hitung mundur memakai `secondsRemaining` dari SERVER (bukan jam HP).
/// - Saat hitung mundur habis, status TIDAK diubah di klien: aplikasi tetap
///   bertanya ke server, yang memverifikasi ke gateway (bisa ternyata lunas).
/// - Polling berhenti begitu status bukan PENDING, atau setelah batas aman.
/// - Satu permintaan pada satu waktu; navigasi sukses hanya sekali.
mixin _PaymentAttemptFlow<T extends StatefulWidget> on State<T> {
  GatewayPayment? _payment;
  bool _loading = true;
  String? _error;
  Timer? _poll;
  Timer? _tick;
  bool _checking = false;
  bool _creating = false;
  bool _navigated = false;
  DateTime? _deadline;
  int _remaining = 0;

  /// Batas polling setelah hitung mundur habis (server butuh waktu memastikan).
  static const _confirmWindow = Duration(minutes: 3);

  String get _attemptMethod;
  String? get _attemptBank => null;
  String get _attemptOrderId;
  void _onAttemptPaid();

  /// Batch 4: sumber tagihan — order (default) atau top-up saldo.
  int? get _topupAmount => null;

  Future<GatewayPayment> _attemptCreate(String token) {
    final c = context.read<CustomerController>();
    final amount = _topupAmount;
    if (amount != null) {
      return c.createWalletTopup(
        accessToken: token,
        amount: amount,
        method: _attemptMethod,
        bank: _attemptBank,
      );
    }
    return c.createGatewayPayment(
      accessToken: token,
      orderId: _attemptOrderId,
      method: _attemptMethod,
      bank: _attemptBank,
    );
  }

  Future<GatewayPayment> _attemptStatus(String token, String paymentNumber) {
    final c = context.read<CustomerController>();
    return _topupAmount != null
        ? c.getWalletTopupStatus(accessToken: token, topupNumber: paymentNumber)
        : c.getPaymentStatus(accessToken: token, paymentNumber: paymentNumber);
  }

  Future<void> _attemptSimulate(String token, String paymentNumber) {
    final c = context.read<CustomerController>();
    return _topupAmount != null
        ? c.simulateWalletTopup(accessToken: token, topupNumber: paymentNumber)
        : c.simulatePayment(accessToken: token, paymentNumber: paymentNumber);
  }

  String? get _token => context.read<AuthController>().accessToken;

  void _disposeAttempt() {
    _poll?.cancel();
    _tick?.cancel();
  }

  Future<void> _createPayment() async {
    if (_creating || _navigated) return;
    _creating = true;
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
      _creating = false;
      return;
    }
    try {
      final payment = await _attemptCreate(token);
      if (!mounted) return;
      setState(() => _loading = false);
      _applyPayment(payment);
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
    } finally {
      _creating = false;
    }
  }

  void _applyPayment(GatewayPayment p) {
    if (!mounted) return;
    if (p.isPaid) {
      _finishPaid();
      return;
    }
    setState(() {
      _payment = p;
      if (p.isPending) {
        _deadline = DateTime.now().add(Duration(seconds: p.secondsRemaining));
        _remaining = p.secondsRemaining;
      } else {
        _remaining = 0;
      }
    });
    if (p.isPending) {
      _poll ??= Timer.periodic(
        const Duration(seconds: 3),
        (_) => _checkStatus(),
      );
      _tick ??= Timer.periodic(const Duration(seconds: 1), (_) => _onTick());
    } else {
      _disposeAttempt();
      _poll = null;
      _tick = null;
    }
  }

  void _onTick() {
    final deadline = _deadline;
    if (deadline == null || !mounted) return;
    final left = deadline.difference(DateTime.now()).inSeconds;
    setState(() => _remaining = left < 0 ? 0 : left);
    // Lewat batas konfirmasi tanpa kepastian → hentikan polling otomatis,
    // pengguna masih bisa menekan "Cek Status".
    if (DateTime.now().isAfter(deadline.add(_confirmWindow))) {
      _poll?.cancel();
      _poll = null;
    }
  }

  Future<void> _checkStatus() async {
    if (_checking || _navigated) return;
    final token = _token;
    final pn = _payment?.paymentNumber;
    if (token == null || pn == null) return;
    _checking = true;
    try {
      final status = await _attemptStatus(token, pn);
      _applyPayment(status);
    } catch (_) {
      // Abaikan error sesaat; polling berikutnya mencoba lagi.
    } finally {
      _checking = false;
    }
  }

  void _finishPaid() {
    if (_navigated) return;
    _navigated = true;
    _disposeAttempt();
    _onAttemptPaid();
  }

  /// Teks hitung mundur / status menurut server.
  String get _attemptStatusLabel {
    final p = _payment;
    if (p == null) return '';
    if (p.isPending) {
      if (_remaining <= 0) return 'Memastikan status pembayaran…';
      final m = (_remaining ~/ 60).toString().padLeft(2, '0');
      final s = (_remaining % 60).toString().padLeft(2, '0');
      return 'Bayar sebelum $m:$s';
    }
    if (p.isExpired) return 'Tagihan kedaluwarsa';
    if (p.status == 'CANCELLED') return 'Tagihan dibatalkan';
    return 'Pembayaran gagal';
  }

  /// Tampilan bila tagihan sudah tidak berlaku (status dari server).
  Widget? _attemptEndedView() {
    final p = _payment;
    if (p == null || p.isPending || p.isPaid) return null;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: MascotMessageCard(
          mascotAsset: AppMascotAssets.paymentFailedReceipt,
          variant: MascotMessageVariant.error,
          fullWidth: false,
          title: _attemptStatusLabel,
          message: p.isExpired
              ? 'Waktu pembayaran habis dan belum ada dana masuk. Buat tagihan baru untuk melanjutkan.'
              : 'Tagihan ini sudah tidak berlaku. Buat tagihan baru atau pilih metode lain.',
          primaryButtonText: p.canRetry ? 'Buat Tagihan Baru' : 'Kembali',
          onPrimaryPressed: p.canRetry
              ? _createPayment
              : () => Navigator.of(context).pop(),
        ),
      ),
    );
  }
}
