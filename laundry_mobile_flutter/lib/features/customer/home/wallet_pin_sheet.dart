part of '../home_screen.dart';

/// Bottom sheet untuk verifikasi PIN wallet saat bayar pakai saldo.
/// Mengembalikan `true` lewat Navigator.pop bila PIN benar.
class _WalletPinSheet extends StatefulWidget {
  const _WalletPinSheet({required this.amount});

  final int amount;

  @override
  State<_WalletPinSheet> createState() => _WalletPinSheetState();
}

class _WalletPinSheetState extends State<_WalletPinSheet> {
  static const _pinLength = 6;

  String _input = '';
  String? _error;

  void _onDigit(String d) {
    if (_input.length >= _pinLength) return;
    setState(() {
      _input += d;
      _error = null;
    });
    if (_input.length == _pinLength) _verify();
  }

  void _onBackspace() {
    if (_input.isEmpty) return;
    setState(() {
      _input = _input.substring(0, _input.length - 1);
      _error = null;
    });
  }

  Future<void> _verify() async {
    await Future<void>.delayed(const Duration(milliseconds: 120));
    if (!mounted) return;
    final ok = context.read<WalletController>().verifyPin(_input);
    if (ok) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _error = 'PIN salah. Coba lagi.';
      _input = '';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 12, 24, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.borderLight,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 18),
                const Text(
                  'Masukkan PIN Wallet',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: _textDark,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Bayar ${_formatRupiah(widget.amount)} dari saldo wallet.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 13,
                    color: _textMuted,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 24),
                PinDots(
                  length: _pinLength,
                  filled: _input.length,
                  error: _error != null,
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 18,
                  child: _error != null
                      ? Text(
                          _error!,
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: AppColors.error,
                            fontWeight: FontWeight.w500,
                          ),
                        )
                      : null,
                ),
                const SizedBox(height: 8),
                PinKeypad(onDigit: _onDigit, onBackspace: _onBackspace),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
