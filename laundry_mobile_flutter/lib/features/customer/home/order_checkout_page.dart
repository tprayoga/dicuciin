part of '../home_screen.dart';

class _OrderCheckoutPage extends StatefulWidget {
  const _OrderCheckoutPage({required this.data});

  final _CheckoutData data;

  @override
  State<_OrderCheckoutPage> createState() => _OrderCheckoutPageState();
}

class _LoyaltySummaryCard extends StatelessWidget {
  const _LoyaltySummaryCard({required this.data, required this.quote});

  final _CheckoutData data;
  final PricingQuote? quote;

  @override
  Widget build(BuildContext context) {
    final q = quote;
    final base = q?.basePrice.round() ?? data.price;
    final happy = q?.happyHourDiscount.round() ?? 0;
    final voucher = q?.voucherDiscount.round() ?? 0;
    final b2b = q?.b2bDiscount.round() ?? 0;
    final total = q?.finalAmount.round() ?? data.price;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  data.machineName,
                  style: const TextStyle(
                    fontSize: 17,
                    color: _textDark,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const _SummaryStatusChip(),
            ],
          ),
          const SizedBox(height: 12),
          _DetailRow(left: 'Kategori Mesin', right: data.machineType.label),
          _DetailRow(left: 'Kapasitas', right: data.capacity),
          _DetailRow(left: 'Estimasi', right: data.estimasi),
          _DetailRow(left: 'Tanggal', right: data.date),
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 12),
          _DetailRow(left: 'Harga Normal', right: _formatRupiah(base)),
          _DetailRow(
            left: 'Happy Hour Discount',
            right: '- ${_formatRupiah(happy)}',
          ),
          if (b2b > 0)
            _DetailRow(left: 'B2B Discount', right: '- ${_formatRupiah(b2b)}'),
          _DetailRow(
            left: 'Voucher Discount',
            right: '- ${_formatRupiah(voucher)}',
          ),
          _DetailRow(
            left: 'Estimasi Point',
            right: '${q?.pointsToEarn ?? 0} poin',
          ),
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 12),
          _DetailRow(
            left: 'Total Bayar',
            right: _formatRupiah(total),
            greenRight: true,
          ),
        ],
      ),
    );
  }
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
  PricingQuote? _quote;
  List<VoucherEligibility> _voucherEligibility = const [];
  bool _quoteLoading = true;
  bool _voucherLoading = false;
  // Order nyata yang sudah dibuat di backend (dibuat sekali saat bayar).
  // Direset bila voucher berubah agar diskon ikut terhitung ulang.
  CreatedOrder? _createdOrder;
  bool _processing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshQuote();
      _loadVoucherEligibility();
    });
  }

  @override
  void dispose() {
    _voucherController.dispose();
    super.dispose();
  }

  bool get _canApplyVoucher => _voucherController.text.trim().isNotEmpty;

  List<CreateOrderItemInput> get _items => [
    CreateOrderItemInput(
      serviceId: widget.data.serviceId,
      quantity: 1,
      machineType: widget.data.machineType.label.toUpperCase(),
    ),
  ];

  int get _total => (_quote?.finalAmount ?? widget.data.price).round();

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
                  _LoyaltySummaryCard(data: widget.data, quote: _quote),
                  if (_quoteLoading) ...[
                    const SizedBox(height: 8),
                    const LinearProgressIndicator(minHeight: 3),
                  ],
                  const SizedBox(height: 18),
                  _sectionTitle(
                    title: 'Promo Eligible',
                    subtitle:
                        'Harga promo dihitung backend, termasuk happy hour.',
                  ),
                  const SizedBox(height: 10),
                  if ((_quote?.happyHourDiscount ?? 0) > 0)
                    _infoPill(
                      Icons.schedule,
                      'Happy hour aktif: hemat ${_formatRupiah(_quote!.happyHourDiscount.round())}',
                      AppColors.successBg,
                      AppColors.success,
                    )
                  else
                    _infoPill(
                      Icons.info_outline,
                      'Belum ada happy hour untuk mesin dan waktu ini.',
                      AppColors.tintBlueAlt,
                      _primary,
                    ),
                  const SizedBox(height: 18),
                  _sectionTitle(
                    title: 'Voucher Kamu',
                    subtitle:
                        'Pilih maksimal 1 voucher. Voucher tidak valid tetap ditampilkan dengan alasan.',
                  ),
                  const SizedBox(height: 10),
                  _voucherList(),
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
                                }
                              });
                            },
                            decoration: const InputDecoration(
                              hintText: 'Atau masukkan kode voucher',
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
                                'Pilih satu voucher atau masukkan kode manual.',
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

  Widget _infoPill(IconData icon, String text, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: fg.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Icon(icon, color: fg, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: fg,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _voucherList() {
    if (_voucherLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_voucherEligibility.isEmpty) {
      return _infoPill(
        Icons.confirmation_number_outlined,
        'Belum ada voucher di akun ini.',
        AppColors.surfaceAlt,
        _textMuted,
      );
    }
    final eligible = _voucherEligibility.where((v) => v.eligible).toList();
    final invalid = _voucherEligibility.where((v) => !v.eligible).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (eligible.isNotEmpty) ...[
          const Text(
            'Bisa digunakan',
            style: TextStyle(
              fontSize: 13,
              color: _textDark,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          ...eligible.map((item) => _voucherTile(item)),
        ],
        if (invalid.isNotEmpty) ...[
          const SizedBox(height: 12),
          const Text(
            'Tidak bisa digunakan',
            style: TextStyle(
              fontSize: 13,
              color: _textDark,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          ...invalid.map((item) => _voucherTile(item)),
        ],
      ],
    );
  }

  Widget _voucherTile(VoucherEligibility item) {
    final selected =
        _voucherApplied && _appliedVoucherCode == item.voucher.code;
    final saving = item.quote?.voucherDiscount.round() ?? 0;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: selected ? _primary : _line),
      ),
      child: ListTile(
        dense: true,
        onTap: item.eligible
            ? () => _selectVoucher(item.voucher.code, item.quote)
            : null,
        leading: Icon(
          item.eligible
              ? Icons.confirmation_number_outlined
              : Icons.block_outlined,
          color: item.eligible ? _primary : _textMuted,
        ),
        title: Text(
          item.voucher.templateName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          item.eligible
              ? '${item.voucher.code} • Hemat ${_formatRupiah(saving)}'
              : '${item.voucher.code} • ${item.reason ?? 'Tidak valid'}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: selected
            ? const Icon(Icons.check_circle, color: _primary)
            : item.eligible
            ? const Icon(Icons.radio_button_unchecked, color: _textMuted)
            : null,
      ),
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

  Future<void> _onApplyVoucher() async {
    final code = _voucherController.text.trim().toUpperCase();
    if (code.isEmpty) return;

    final auth = context.read<AuthController>();
    final user = auth.user;
    final token = auth.accessToken;
    final messenger = ScaffoldMessenger.of(context);
    if (user == null || token == null) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Sesi berakhir. Silakan masuk lagi.')),
      );
      return;
    }

    try {
      final result = await context.read<CustomerController>().quotePricing(
        user: user,
        accessToken: token,
        outletId: widget.data.outletId,
        items: _items,
        voucherCode: code,
      );
      if (!mounted) return;
      _selectVoucher(code, result);
      messenger.showSnackBar(
        SnackBar(content: Text('Voucher $code diterapkan.')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!mounted) return;
      messenger.showSnackBar(
        const SnackBar(content: Text('Gagal memvalidasi voucher.')),
      );
    }
  }

  void _onRemoveVoucher() {
    setState(() {
      _voucherApplied = false;
      _appliedVoucherCode = '';
      _createdOrder = null; // promo dilepas → order dibuat ulang tanpa diskon
      _voucherController.clear();
    });
    _refreshQuote();
  }

  void _selectVoucher(String code, PricingQuote? quote) {
    setState(() {
      _voucherApplied = true;
      _appliedVoucherCode = code;
      _quote = quote ?? _quote;
      _createdOrder = null;
      _voucherController.text = code;
      _voucherController.selection = TextSelection.collapsed(
        offset: _voucherController.text.length,
      );
    });
  }

  Future<void> _refreshQuote() async {
    final auth = context.read<AuthController>();
    final user = auth.user;
    final token = auth.accessToken;
    if (user == null || token == null || widget.data.serviceId.isEmpty) {
      setState(() => _quoteLoading = false);
      return;
    }
    setState(() => _quoteLoading = true);
    try {
      final quote = await context.read<CustomerController>().quotePricing(
        user: user,
        accessToken: token,
        outletId: widget.data.outletId,
        items: _items,
        voucherCode: _voucherApplied ? _appliedVoucherCode : null,
      );
      if (!mounted) return;
      setState(() {
        _quote = quote;
      });
    } catch (_) {
      if (!mounted) return;
    } finally {
      if (mounted) setState(() => _quoteLoading = false);
    }
  }

  Future<void> _loadVoucherEligibility() async {
    final auth = context.read<AuthController>();
    final user = auth.user;
    final token = auth.accessToken;
    if (user == null || token == null || widget.data.serviceId.isEmpty) return;
    setState(() => _voucherLoading = true);
    final items = await context
        .read<CustomerController>()
        .getVoucherEligibility(
          user: user,
          accessToken: token,
          outletId: widget.data.outletId,
          items: _items,
        );
    if (!mounted) return;
    setState(() {
      _voucherEligibility = items;
      _voucherLoading = false;
    });
  }

  /// Buat order nyata di backend (sekali). Diskon dihitung server bila ada
  /// voucher. Mengembalikan null bila gagal (pesan sudah ditampilkan).
  Future<CreatedOrder?> _ensureOrder() async {
    if (_createdOrder != null) return _createdOrder;

    final auth = context.read<AuthController>();
    final user = auth.user;
    final token = auth.accessToken;
    final messenger = ScaffoldMessenger.of(context);

    if (user == null || token == null) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Sesi berakhir. Silakan masuk lagi.')),
      );
      return null;
    }
    if (widget.data.serviceId.isEmpty || widget.data.outletId.isEmpty) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Layanan ini belum bisa dipesan.')),
      );
      return null;
    }

    final controller = context.read<CustomerController>();
    final created = await controller.createOrder(
      user: user,
      accessToken: token,
      outletId: widget.data.outletId,
      items: [
        CreateOrderItemInput(
          serviceId: widget.data.serviceId,
          quantity: 1,
          machineType: widget.data.machineType.label.toUpperCase(),
        ),
      ],
      promoCode: _voucherApplied ? _appliedVoucherCode : null,
    );
    if (created == null) {
      if (!mounted) return null;
      messenger.showSnackBar(
        SnackBar(
          content: Text(controller.errorMessage ?? 'Gagal membuat order.'),
        ),
      );
      return null;
    }
    _createdOrder = created;
    return created;
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
      await Navigator.of(
        context,
      ).push(MaterialPageRoute(builder: (_) => const _WalletPinSettingsPage()));
      return;
    }

    await _refreshQuote();
    if (!mounted) return;
    final total = _total;

    if (!wallet.canPay(total)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Saldo tidak cukup. Silakan top up dulu.'),
        ),
      );
      return;
    }

    final verified = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _WalletPinSheet(amount: total),
    );
    if (verified != true || !mounted) return;

    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final auth = context.read<AuthController>();
    final customerController = context.read<CustomerController>();
    final result = await customerController.checkoutLoyalty(
      user: auth.user!,
      accessToken: auth.accessToken!,
      outletId: widget.data.outletId,
      items: _items,
      voucherCode: _voucherApplied ? _appliedVoucherCode : null,
    );
    if (result == null || !mounted) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(customerController.errorMessage ?? 'Pembayaran gagal.'),
        ),
      );
      return;
    }
    await wallet.loadBalance();
    if (!mounted) return;

    messenger.showSnackBar(
      const SnackBar(content: Text('Pembayaran saldo berhasil.')),
    );
    navigator.pushReplacement(
      MaterialPageRoute(
        builder: (_) => _OrderSuccessPage(
          data: widget.data,
          methodLabel: 'Saldo',
          total: result.breakdown.finalAmount.round(),
          orderId: result.orderId,
          result: result,
        ),
      ),
    );
  }

  Future<void> _onPayNow() async {
    if (_processing) return;
    setState(() => _processing = true);
    try {
      await _runPayment();
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  Future<void> _runPayment() async {
    if (_method == _PaymentMethod.saldo) {
      await _payWithWallet();
      return;
    }

    if (_voucherApplied || ((_quote?.happyHourDiscount ?? 0) > 0)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Voucher dan happy hour loyalty saat ini diproses lewat Saldo.',
          ),
        ),
      );
      setState(() {
        _method = _PaymentMethod.saldo;
        _vaExpanded = false;
      });
      return;
    }

    // QRIS/VA: buat order dulu (total final + orderId) sebelum buka halaman bayar.
    final order = await _ensureOrder();
    if (order == null || !mounted) return;
    final total = order.totalAmount.round();

    if (_method == _PaymentMethod.va) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => _PaymentVaPage(
            bank: _selectedBank,
            data: widget.data,
            total: total,
            orderId: order.id,
          ),
        ),
      );
      return;
    }

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _PaymentQrisPage(
          data: widget.data,
          total: total,
          orderId: order.id,
        ),
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
