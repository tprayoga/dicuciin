part of '../home_screen.dart';

enum _PinStep { verifyOld, enterNew, confirmNew }

/// Halaman buat / ubah PIN wallet dari menu Akun.
class _WalletPinSettingsPage extends StatefulWidget {
  const _WalletPinSettingsPage();

  @override
  State<_WalletPinSettingsPage> createState() => _WalletPinSettingsPageState();
}

class _WalletPinSettingsPageState extends State<_WalletPinSettingsPage> {
  static const _pinLength = 6;

  late _PinStep _step;
  String _input = '';
  String? _newPin;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Sudah punya PIN → wajib verifikasi PIN lama dulu.
    _step = context.read<WalletController>().hasPin
        ? _PinStep.verifyOld
        : _PinStep.enterNew;
  }

  String get _title => switch (_step) {
    _PinStep.verifyOld => 'PIN Lama',
    _PinStep.enterNew => 'PIN Baru',
    _PinStep.confirmNew => 'Konfirmasi PIN',
  };

  String get _subtitle => switch (_step) {
    _PinStep.verifyOld => 'Masukkan PIN wallet kamu saat ini.',
    _PinStep.enterNew => 'Buat 6 digit PIN baru untuk wallet kamu.',
    _PinStep.confirmNew => 'Masukkan ulang PIN baru untuk konfirmasi.',
  };

  void _onDigit(String d) {
    if (_input.length >= _pinLength) return;
    setState(() {
      _input += d;
      _error = null;
    });
    if (_input.length == _pinLength) _onComplete();
  }

  void _onBackspace() {
    if (_input.isEmpty) return;
    setState(() {
      _input = _input.substring(0, _input.length - 1);
      _error = null;
    });
  }

  Future<void> _onComplete() async {
    await Future<void>.delayed(const Duration(milliseconds: 120));
    if (!mounted) return;

    final wallet = context.read<WalletController>();

    switch (_step) {
      case _PinStep.verifyOld:
        if (wallet.verifyPin(_input)) {
          setState(() {
            _step = _PinStep.enterNew;
            _input = '';
          });
        } else {
          setState(() {
            _error = 'PIN lama salah.';
            _input = '';
          });
        }
      case _PinStep.enterNew:
        setState(() {
          _newPin = _input;
          _step = _PinStep.confirmNew;
          _input = '';
        });
      case _PinStep.confirmNew:
        if (_input == _newPin) {
          wallet.setPin(_input);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('PIN wallet berhasil disimpan.')),
          );
          Navigator.of(context).pop();
        } else {
          setState(() {
            _error = 'PIN tidak cocok. Ulangi.';
            _step = _PinStep.enterNew;
            _newPin = null;
            _input = '';
          });
        }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Column(
          children: [
            const _BlueHeader(title: 'PIN Wallet', showBack: true),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  children: [
                    const SizedBox(height: 16),
                    Container(
                      width: 64,
                      height: 64,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.tintBlue,
                      ),
                      child: const Icon(
                        Icons.lock_outline,
                        color: _primary,
                        size: 30,
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      _title,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: _textDark,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _subtitle,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 14,
                        color: _textMuted,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 32),
                    PinDots(
                      length: _pinLength,
                      filled: _input.length,
                      error: _error != null,
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      height: 20,
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
                    const Spacer(),
                    PinKeypad(onDigit: _onDigit, onBackspace: _onBackspace),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
