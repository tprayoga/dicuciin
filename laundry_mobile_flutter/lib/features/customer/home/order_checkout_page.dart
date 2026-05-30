part of '../home_screen.dart';

class _OrderCheckoutPage extends StatefulWidget {
  const _OrderCheckoutPage({required this.data});

  final _CheckoutData data;

  @override
  State<_OrderCheckoutPage> createState() => _OrderCheckoutPageState();
}

class _OrderCheckoutPageState extends State<_OrderCheckoutPage> {
  static const _banks = [
    'Bank BCA',
    'Bank BRI',
    'Bank BNI',
    'Bank Mandiri',
    'Bank BSI',
    'Bank CIMB Niaga',
  ];

  _PaymentMethod _method = _PaymentMethod.qris;
  String _selectedBank = 'Bank BCA';
  bool _vaExpanded = false;
  final TextEditingController _voucherController = TextEditingController();
  bool _voucherApplied = false;
  String _appliedVoucherCode = '';
  int _discount = 0;

  @override
  void dispose() {
    _voucherController.dispose();
    super.dispose();
  }

  bool get _canApplyVoucher => _voucherController.text.trim().isNotEmpty;

  int get _total => (widget.data.price - _discount).clamp(0, widget.data.price);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Column(
          children: [
            const _BlueHeader(title: 'Order', showBack: true, alignLeft: true),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
                children: [
                  _CheckoutSummaryCard(
                    data: widget.data,
                    discount: _discount,
                    total: _total,
                  ),
                  const SizedBox(height: 18),
                  _sectionTitle(
                    title: 'Voucher/Kode Promo',
                    subtitle: 'Masukkan voucher jika kamu punya kode promo.',
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
                    decoration: BoxDecoration(
                      border: Border.all(color: _line),
                      borderRadius: BorderRadius.circular(12),
                      color: Colors.white,
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.confirmation_number_outlined,
                          color: _textMuted,
                          size: 20,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextField(
                            controller: _voucherController,
                            textCapitalization: TextCapitalization.characters,
                            onChanged: (value) {
                              setState(() {
                                if (_voucherApplied &&
                                    value.trim().toUpperCase() !=
                                        _appliedVoucherCode) {
                                  _voucherApplied = false;
                                  _appliedVoucherCode = '';
                                  _discount = 0;
                                }
                              });
                            },
                            decoration: const InputDecoration(
                              hintText: 'Masukkan kode promo',
                              hintStyle: TextStyle(
                                fontSize: 14,
                                color: _textMuted,
                              ),
                              border: InputBorder.none,
                              isDense: true,
                            ),
                            style: const TextStyle(
                              fontSize: 14,
                              color: _textDark,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: _voucherApplied
                            ? Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 6,
                                    ),
                                    decoration: BoxDecoration(
                                      color: AppColors.successBg,
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(
                                          Icons.check_circle,
                                          size: 14,
                                          color: AppColors.success,
                                        ),
                                        const SizedBox(width: 6),
                                        Text(
                                          'Aktif: $_appliedVoucherCode',
                                          style: const TextStyle(
                                            fontSize: 12,
                                            color: AppColors.success,
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              )
                            : const Text(
                                'Voucher akan dihitung saat checkout.',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: _textMuted,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                      ),
                      const SizedBox(width: 10),
                      FilledButton.icon(
                        onPressed: _canApplyVoucher ? _onApplyVoucher : null,
                        icon: Icon(
                          _voucherApplied ? Icons.edit_outlined : Icons.check,
                          size: 14,
                        ),
                        label: Text(
                          _voucherApplied ? 'Ubah' : 'Terapkan',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(0, 40),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          backgroundColor: _primary,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (_voucherApplied) ...[
                    const SizedBox(height: 6),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _onRemoveVoucher,
                        style: TextButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          minimumSize: const Size(0, 28),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: const Text(
                          'Hapus voucher',
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  _sectionTitle(
                    title: 'Metode Pembayaran',
                    subtitle: 'Pilih metode pembayaran yang paling nyaman.',
                  ),
                  const SizedBox(height: 10),
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: _line),
                    ),
                    child: Column(
                      children: [
                        _paymentRow(
                          leading: const Icon(
                            Icons.account_balance_wallet_rounded,
                            color: _primary,
                            size: 22,
                          ),
                          label: 'Saldo',
                          subtitle:
                              'Saldo tersedia ${_formatRupiah(context.watch<WalletController>().balance)}',
                          active: _method == _PaymentMethod.saldo,
                          onTap: () => setState(() {
                            _method = _PaymentMethod.saldo;
                            _vaExpanded = false;
                          }),
                        ),
                        const Divider(height: 1),
                        _paymentRow(
                          leading: const Text(
                            'QRIS',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              color: _textDark,
                            ),
                          ),
                          label: 'QRIS',
                          subtitle:
                              'Scan kode QR dengan e-wallet atau m-banking',
                          active: _method == _PaymentMethod.qris,
                          onTap: () => setState(() {
                            _method = _PaymentMethod.qris;
                            _vaExpanded = false;
                          }),
                        ),
                        const Divider(height: 1),
                        _vaHeader(),
                        if (_method == _PaymentMethod.va && !_vaExpanded)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.check_circle,
                                  size: 14,
                                  color: AppColors.success,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  'Bank dipilih: $_selectedBank',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: _textMuted,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        AnimatedCrossFade(
                          firstChild: const SizedBox.shrink(),
                          secondChild: Column(
                            children: [
                              const Divider(height: 1),
                              ..._banks.map(
                                (bank) => InkWell(
                                  onTap: () => setState(() {
                                    _selectedBank = bank;
                                    _method = _PaymentMethod.va;
                                  }),
                                  child: Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                      20,
                                      11,
                                      20,
                                      11,
                                    ),
                                    child: Row(
                                      children: [
                                        SizedBox(
                                          width: 88,
                                          child: _bankLogo(bank),
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            bank,
                                            style: const TextStyle(
                                              fontSize: 15,
                                              color: _textDark,
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                        ),
                                        Icon(
                                          _selectedBank == bank
                                              ? Icons.radio_button_checked
                                              : Icons.radio_button_unchecked,
                                          color: _selectedBank == bank
                                              ? _primary
                                              : _textMuted,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          crossFadeState: _vaExpanded
                              ? CrossFadeState.showSecond
                              : CrossFadeState.showFirst,
                          duration: const Duration(milliseconds: 170),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _bottomPayBar(),
    );
  }

  Widget _sectionTitle({required String title, required String subtitle}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: _textDark,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: const TextStyle(fontSize: 13, color: _textMuted, height: 1.4),
        ),
      ],
    );
  }

  Widget _bottomPayBar() {
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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Total Bayar',
                      style: TextStyle(
                        fontSize: 12,
                        color: _textMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _formatRupiah(_total),
                      style: const TextStyle(
                        fontSize: 19,
                        color: AppColors.success,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              SizedBox(
                height: 48,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: _primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 22),
                  ),
                  onPressed: _onPayNow,
                  child: const Text(
                    'Bayar Sekarang',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _vaHeader() {
    final active = _method == _PaymentMethod.va;
    return InkWell(
      onTap: () => setState(() {
        _vaExpanded = !_vaExpanded;
        _method = _PaymentMethod.va;
      }),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 170),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        color: active
            ? AppColors.tintBlueAlt.withValues(alpha: 0.45)
            : Colors.transparent,
        child: Row(
          children: [
            const SizedBox(
              width: 50,
              child: Text(
                'virtual\naccount',
                style: TextStyle(
                  fontSize: 9,
                  color: _textMuted,
                  fontWeight: FontWeight.w700,
                  height: 1.1,
                ),
              ),
            ),
            const SizedBox(width: 10),
            const Expanded(
              child: Text(
                'Virtual Account',
                style: TextStyle(
                  fontSize: 15,
                  color: _textDark,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Icon(
              _vaExpanded
                  ? Icons.keyboard_arrow_up_rounded
                  : Icons.keyboard_arrow_down_rounded,
              color: _textMuted,
            ),
          ],
        ),
      ),
    );
  }

  void _onApplyVoucher() {
    final code = _voucherController.text.trim().toUpperCase();
    if (code.isEmpty) return;

    final discount = _voucherDiscount(code, widget.data.price);
    if (discount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Kode promo "$code" tidak berlaku.')),
      );
      return;
    }

    setState(() {
      _voucherApplied = true;
      _appliedVoucherCode = code;
      _discount = discount;
      _voucherController.text = code;
      _voucherController.selection = TextSelection.collapsed(
        offset: _voucherController.text.length,
      );
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Voucher $code diterapkan, hemat ${_formatRupiah(discount)}.'),
      ),
    );
  }

  void _onRemoveVoucher() {
    setState(() {
      _voucherApplied = false;
      _appliedVoucherCode = '';
      _discount = 0;
      _voucherController.clear();
    });
  }

  Future<void> _payWithWallet() async {
    final wallet = context.read<WalletController>();

    if (!wallet.hasPin) {
      final create = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          title: const Text('Belum Ada PIN Wallet'),
          content: const Text(
            'Buat PIN wallet dulu untuk bisa bayar pakai saldo.',
            style: TextStyle(color: _textMuted, height: 1.4),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Nanti', style: TextStyle(color: _textMuted)),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: _primary),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Buat PIN'),
            ),
          ],
        ),
      );
      if (create != true || !mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const _WalletPinSettingsPage()),
      );
      return;
    }

    if (!wallet.canPay(_total)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saldo tidak cukup. Silakan top up dulu.')),
      );
      return;
    }

    final verified = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _WalletPinSheet(amount: _total),
    );
    if (verified != true || !mounted) return;

    if (!wallet.pay(_total)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saldo tidak cukup. Silakan top up dulu.')),
      );
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Pembayaran saldo berhasil.')),
    );
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => _OrderSuccessPage(
          data: widget.data,
          methodLabel: 'Saldo',
          total: _total,
        ),
      ),
    );
  }

  Future<void> _onPayNow() async {
    if (_method == _PaymentMethod.saldo) {
      await _payWithWallet();
      return;
    }

    if (_method == _PaymentMethod.va) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => _PaymentVaPage(
            bank: _selectedBank,
            data: widget.data,
            total: _total,
          ),
        ),
      );
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _PaymentQrisPage(data: widget.data, total: _total),
      ),
    );
  }

  Widget _paymentRow({
    required Widget leading,
    required String label,
    required String subtitle,
    required bool active,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 170),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        color: active
            ? AppColors.tintBlueAlt.withValues(alpha: 0.45)
            : Colors.transparent,
        child: Row(
          children: [
            SizedBox(width: 52, child: Center(child: leading)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 15,
                      color: _textDark,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      color: _textMuted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              active
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: active ? _primary : _textMuted,
            ),
          ],
        ),
      ),
    );
  }

  Widget _bankLogo(String bank) {
    const style = TextStyle(fontWeight: FontWeight.w700);
    if (bank == 'Bank BCA') {
      return Text(
        'BCA',
        style: style.copyWith(color: PaymentBrandColors.bca, fontSize: 24),
      );
    }
    if (bank == 'Bank BRI') {
      return Text(
        'BRI',
        style: style.copyWith(color: PaymentBrandColors.bri, fontSize: 24),
      );
    }
    if (bank == 'Bank BNI') {
      return Text(
        'BNI',
        style: style.copyWith(color: PaymentBrandColors.bni, fontSize: 24),
      );
    }
    if (bank == 'Bank Mandiri') {
      return Text(
        'mandiri',
        style: style.copyWith(color: PaymentBrandColors.mandiri, fontSize: 17),
      );
    }
    if (bank == 'Bank BSI') {
      return Text(
        'BSI',
        style: style.copyWith(color: PaymentBrandColors.permata, fontSize: 20),
      );
    }
    return Text(
      'CIMBNIAGA',
      style: style.copyWith(color: PaymentBrandColors.cimb, fontSize: 12),
    );
  }
}
