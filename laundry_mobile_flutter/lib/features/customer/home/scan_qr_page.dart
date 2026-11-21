part of '../home_screen.dart';

/// Scan QR mesin. Kode QR (deviceCode) dikirim ke backend, yang memvalidasi
/// pemesan, booking, mesin, jadwal, dan order LUNAS sebelum menyalakan mesin.
/// Mesin yang belum dipesan & dibayar tidak bisa dipakai dari layar ini.
class _ScanQrPage extends StatefulWidget {
  const _ScanQrPage();

  @override
  State<_ScanQrPage> createState() => _ScanQrPageState();
}

class _ScanQrPageState extends State<_ScanQrPage> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _busy = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_busy) return;
    final code = capture.barcodes.isNotEmpty
        ? capture.barcodes.first.rawValue
        : null;
    if (code == null || code.trim().isEmpty) return;
    await _handleCode(code.trim());
  }

  Future<void> _handleCode(String deviceCode) async {
    final auth = context.read<AuthController>();
    final token = auth.accessToken;
    if (token == null) return;
    final controller = context.read<CustomerController>();

    setState(() => _busy = true);
    await _controller.stop();

    try {
      final result = await controller.verifyMachine(
        accessToken: token,
        deviceCode: deviceCode,
      );
      if (!mounted) return;
      await _showResult(success: true, message: result.message);
    } on ApiException catch (e) {
      if (!mounted) return;
      await _showResult(success: false, message: e.message);
    } catch (_) {
      if (!mounted) return;
      await _showResult(success: false, message: 'Gagal memproses QR mesin.');
    }
  }

  Future<void> _showResult({required bool success, required String message}) {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            Icon(
              success ? Icons.check_circle : Icons.error_outline,
              color: success ? AppColors.success : AppColors.error,
            ),
            const SizedBox(width: 10),
            Text(success ? 'Berhasil' : 'Tidak Bisa'),
          ],
        ),
        content: Text(
          message,
          style: const TextStyle(color: _textMuted, height: 1.4),
        ),
        actions: [
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: _primary),
            onPressed: () {
              Navigator.of(ctx).pop(); // tutup dialog
              Navigator.of(context).pop(); // tutup halaman scan
            },
            child: const Text('Selesai'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(controller: _controller, onDetect: _onDetect),
          Container(color: Colors.black.withValues(alpha: 0.25)),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 16, 10),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Align(
                        alignment: Alignment.centerLeft,
                        child: IconButton(
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(Icons.arrow_back, color: Colors.white),
                        ),
                      ),
                      const Text(
                        'Scan QR Mesin',
                        style: TextStyle(
                          fontSize: 17,
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: IconButton(
                          onPressed: () => _controller.toggleTorch(),
                          icon: const Icon(Icons.flash_on, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 90),
                Center(
                  child: Container(
                    width: 250,
                    height: 250,
                    decoration: BoxDecoration(
                      border: Border.all(color: _primary, width: 3),
                      borderRadius: BorderRadius.circular(18),
                    ),
                  ),
                ),
                const SizedBox(height: 22),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Text(
                    _busy
                        ? 'Memproses...'
                        : 'Arahkan kamera ke QR pada mesin untuk membuka mesin yang kamu booking.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                ),
                const Spacer(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
