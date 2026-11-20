part of '../home_screen.dart';

/// Batch 6 — hapus akun mandiri. Pratinjau penghalang dari server, lalu
/// re-autentikasi (kata sandi) + ketik HAPUS. Order/pembayaran tetap disimpan
/// sebagai catatan keuangan; data pribadi dianonimkan.
class _DeleteAccountPage extends StatefulWidget {
  const _DeleteAccountPage();

  @override
  State<_DeleteAccountPage> createState() => _DeleteAccountPageState();
}

class _DeleteAccountPageState extends State<_DeleteAccountPage> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _reason = TextEditingController();
  Map<String, dynamic>? _preview;
  String? _error;
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final p = await context.read<AuthController>().accountDeletionPreview();
      if (!mounted) return;
      setState(() {
        _preview = p;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  List<Map<String, dynamic>> get _blockers =>
      ((_preview?['blockers'] as List?) ?? const []).cast<Map<String, dynamic>>();

  Future<void> _submit() async {
    if (_submitting) return;
    if (_password.text.isEmpty) {
      AppToast.error(context, 'Masukkan kata sandi.');
      return;
    }
    if (_confirm.text.trim().toUpperCase() != 'HAPUS') {
      AppToast.error(context, 'Ketik HAPUS untuk konfirmasi.');
      return;
    }
    setState(() => _submitting = true);
    final auth = context.read<AuthController>();
    final navigator = Navigator.of(context);
    try {
      final result = await auth.deleteAccount(password: _password.text, reason: _reason.text);
      if (!mounted) return;
      if (result['status'] == 'COMPLETED') {
        // Logout lokal sudah dilakukan AuthController → kembali ke awal.
        navigator.popUntil((r) => r.isFirst);
        return;
      }
      setState(() => _submitting = false);
      await showDialog<void>(
        context: context,
        builder: (d) => AlertDialog(
          title: const Text('Permintaan dicatat'),
          content: const Text(
            'Akun belum bisa dihapus karena masih ada saldo atau transaksi yang belum selesai. '
            'Tim kami akan menghubungimu untuk menuntaskannya, lalu menghapus akun.',
          ),
          actions: [TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Mengerti'))],
        ),
      );
      if (mounted) await _load();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      AppToast.error(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Column(
          children: [
            const _BlueHeader(title: 'Hapus Akun', showBack: true),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                      children: _error != null ? _unavailable() : _form(),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  /// Fitur belum diaktifkan / gagal memuat → arahkan ke layanan pelanggan.
  List<Widget> _unavailable() => [
    Text(_error!, style: const TextStyle(fontSize: 14, color: _textDark, height: 1.4)),
    const SizedBox(height: 16),
    AppPrimaryButton(label: 'Hubungi Layanan Pelanggan', onTap: () => _showSupportSheet(context)),
    const SizedBox(height: 8),
    AppOutlineButton(
      label: 'Hapus akun lewat situs web',
      onTap: () => _openBannerLink(context, AppConfig.accountDeletionUrl),
    ),
  ];

  List<Widget> _form() {
    final forfeited = (_preview?['forfeited'] as Map<String, dynamic>?) ?? const {};
    final points = (forfeited['pointBalance'] as num?)?.toInt() ?? 0;
    final bonus = (forfeited['bonusBalance'] as num?)?.toDouble() ?? 0;
    return [
      _infoCard(
        icon: Icons.warning_amber_rounded,
        color: AppColors.error,
        title: 'Yang terjadi bila akun dihapus',
        lines: [
          'Nama, nomor HP, email, foto, alamat, dan PIN dihapus. Kamu tidak bisa masuk lagi dengan akun ini.',
          if (points > 0) '$points poin hangus.',
          if (bonus > 0) 'Saldo bonus ${_formatRupiah(bonus.round())} hangus.',
          'Riwayat transaksi tetap disimpan tanpa identitasmu (kewajiban pencatatan keuangan).',
          'Nomor HP bisa dipakai mendaftar akun baru.',
        ],
      ),
      if (_blockers.isNotEmpty) ...[
        const SizedBox(height: 12),
        _infoCard(
          icon: Icons.block,
          color: AppColors.warning,
          title: 'Selesaikan dulu sebelum akun bisa dihapus',
          lines: [for (final b in _blockers) (b['message'] as String?) ?? '-'],
        ),
      ],
      const SizedBox(height: 16),
      TextField(
        controller: _reason,
        maxLength: 500,
        decoration: const InputDecoration(labelText: 'Alasan (opsional)'),
      ),
      TextField(
        controller: _password,
        obscureText: true,
        decoration: const InputDecoration(labelText: 'Kata sandi'),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _confirm,
        textCapitalization: TextCapitalization.characters,
        decoration: const InputDecoration(labelText: 'Ketik HAPUS untuk konfirmasi'),
      ),
      const SizedBox(height: 20),
      FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.error,
          padding: const EdgeInsets.symmetric(vertical: 14),
        ),
        onPressed: _submitting ? null : _submit,
        child: _submitting
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Text(_blockers.isEmpty ? 'Hapus Akun Permanen' : 'Ajukan Penghapusan'),
      ),
    ];
  }

  Widget _infoCard({required IconData icon, required Color color, required String title, required List<String> lines}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color),
              const SizedBox(width: 8),
              Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: _textDark))),
            ],
          ),
          const SizedBox(height: 8),
          for (final l in lines)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text('• $l', style: const TextStyle(fontSize: 13, color: _textMuted, height: 1.35)),
            ),
        ],
      ),
    );
  }
}
