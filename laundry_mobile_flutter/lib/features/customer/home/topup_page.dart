part of '../home_screen.dart';

class _TopUpPage extends StatefulWidget {
  const _TopUpPage();

  @override
  State<_TopUpPage> createState() => _TopUpPageState();
}

class _TopUpPageState extends State<_TopUpPage> {
  static const _nominals = [10000, 25000, 50000, 100000, 200000, 500000];
  static const _methods = ['QRIS', 'Virtual Account', 'Saldo Bank'];

  int? _selectedNominal;
  String _method = 'QRIS';

  String _rupiah(int value) {
    final s = value.toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write('.');
      buf.write(s[i]);
    }
    return 'Rp$buf';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const _BlueHeader(title: 'Top Up Saldo', showBack: true),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                children: [
                  // Saldo saat ini
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: _blue,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.account_balance_wallet,
                            color: Colors.white,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: const [
                            Text(
                              'Saldo saat ini',
                              style: TextStyle(color: Colors.white70, fontSize: 12),
                            ),
                            SizedBox(height: 2),
                            Text(
                              'Rp100.000',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Pilih nominal
                  const Text(
                    'Pilih Nominal',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: _textDark,
                    ),
                  ),
                  const SizedBox(height: 12),
                  GridView.count(
                    crossAxisCount: 3,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.9,
                    children: _nominals.map((n) {
                      final selected = _selectedNominal == n;
                      return GestureDetector(
                        onTap: () => setState(() => _selectedNominal = n),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: selected ? AppColors.tintBlueAlt : Colors.white,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: selected ? _primary : _line,
                              width: selected ? 1.5 : 1,
                            ),
                          ),
                          child: Text(
                            _rupiah(n),
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: selected ? _primary : _textDark,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 24),

                  // Metode pembayaran
                  const Text(
                    'Metode Pembayaran',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: _textDark,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: _line),
                    ),
                    child: Column(
                      children: [
                        for (var i = 0; i < _methods.length; i++) ...[
                          if (i > 0) const Divider(height: 1),
                          InkWell(
                            onTap: () => setState(() => _method = _methods[i]),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 14,
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      _methods[i],
                                      style: const TextStyle(
                                        fontSize: 15,
                                        color: _textDark,
                                      ),
                                    ),
                                  ),
                                  Icon(
                                    _method == _methods[i]
                                        ? Icons.radio_button_checked
                                        : Icons.radio_button_unchecked,
                                    color: _method == _methods[i]
                                        ? _primary
                                        : _textMuted,
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 8, 20, 12),
        child: _PrimaryButtonTopup(
          enabled: _selectedNominal != null,
          label: _selectedNominal == null
              ? 'Pilih nominal'
              : 'Top Up ${_rupiah(_selectedNominal!)}',
          onTap: _selectedNominal == null ? null : _confirm,
        ),
      ),
    );
  }

  void _confirm() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Konfirmasi Top Up'),
        content: Text(
          'Top up sebesar ${_rupiah(_selectedNominal!)} via $_method?',
          style: const TextStyle(color: _textMuted, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Batal', style: TextStyle(color: _textMuted)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: _primary),
            onPressed: () {
              final nominal = _selectedNominal!;
              context.read<WalletController>().topUp(nominal);
              Navigator.pop(ctx); // tutup dialog
              Navigator.pop(context); // kembali ke home
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Top up ${_rupiah(nominal)} berhasil diproses'),
                  backgroundColor: AppColors.success,
                ),
              );
            },
            child: const Text('Konfirmasi'),
          ),
        ],
      ),
    );
  }
}

class _PrimaryButtonTopup extends StatelessWidget {
  const _PrimaryButtonTopup({
    required this.label,
    required this.enabled,
    this.onTap,
  });

  final String label;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 50,
      width: double.infinity,
      child: FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: enabled ? _primary : AppColors.borderLight,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
        onPressed: onTap,
        child: Text(
          label,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: enabled ? Colors.white : AppColors.textMutedLight,
          ),
        ),
      ),
    );
  }
}
