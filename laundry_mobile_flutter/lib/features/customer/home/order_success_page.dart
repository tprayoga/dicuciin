part of '../home_screen.dart';

class _OrderSuccessPage extends StatelessWidget {
  const _OrderSuccessPage({
    required this.data,
    required this.methodLabel,
    required this.total,
    this.orderId,
  });

  final _CheckoutData data;
  final String methodLabel;
  final int total;

  /// ID order nyata (bila ada) → untuk form ulasan akhir pembayaran.
  final String? orderId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Column(
          children: [
            const _BlueHeader(title: 'Detail Order', showBack: true),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
                children: [
                  _successSummaryCard(),
                  const SizedBox(height: 16),
                  _usageScheduleCard(),
                  if (orderId != null) ...[
                    const SizedBox(height: 16),
                    _ReviewCard(orderId: orderId!),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _bottomBar(context),
    );
  }

  Widget _successSummaryCard() {
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
          const Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: AppColors.successDark,
                child: Icon(Icons.check_rounded, color: Colors.white, size: 28),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Pembayaran Berhasil',
                      style: TextStyle(
                        fontSize: 18,
                        color: _textDark,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Transaksi kamu sudah dikonfirmasi otomatis.',
                      style: TextStyle(
                        fontSize: 12,
                        color: _textMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(height: 1),
          const SizedBox(height: 10),
          _DetailRow(left: 'No. Order', right: data.orderNo),
          _DetailRow(left: 'Kategori Mesin', right: data.machineType.label),
          _DetailRow(left: 'Kapasitas', right: data.capacity),
          _DetailRow(left: 'Estimasi', right: data.estimasi),
          _DetailRow(left: 'Tanggal', right: data.date),
          _DetailRow(left: 'Lokasi', right: data.locationName),
          _DetailRow(left: 'Metode', right: methodLabel),
          const SizedBox(height: 10),
          const Divider(height: 1),
          const SizedBox(height: 10),
          _DetailRow(
            left: 'Total Bayar',
            right: _formatRupiah(total),
            greenRight: true,
          ),
        ],
      ),
    );
  }

  Widget _usageScheduleCard() {
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
                  '${data.machineName} Siap Digunakan',
                  style: const TextStyle(
                    fontSize: 16,
                    color: _textDark,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Container(
                width: 56,
                height: 56,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.tintBlue,
                ),
                child: const Icon(Icons.local_laundry_service, color: _primary),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Silakan gunakan mesin sesuai jadwal berikut.',
            style: TextStyle(fontSize: 13, color: _textMuted, height: 1.35),
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.surfaceAlt,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.borderLight),
            ),
            child: const Row(
              children: [
                Icon(Icons.schedule, size: 18, color: _primary),
                SizedBox(width: 8),
                Text(
                  '11:00 s/d 11:30',
                  style: TextStyle(
                    fontSize: 14,
                    color: _textDark,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.tintBlueAlt,
              border: Border.all(color: _primary),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info, color: _primary, size: 18),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Mesin akan otomatis berhenti setelah jadwal penggunaan berakhir.',
                    style: TextStyle(
                      fontSize: 12,
                      color: _textDark,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _bottomBar(BuildContext context) {
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
                  label: 'Lihat Order',
                  onTap: () => Navigator.of(context).pop(),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: AppPrimaryButton(
                  label: 'Selesai',
                  onTap: () =>
                      Navigator.of(context).popUntil((route) => route.isFirst),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Form ulasan/feedback di akhir pembayaran. Rating bintang + komentar opsional
/// → POST /reviews. Setelah terkirim menampilkan state "terima kasih".
class _ReviewCard extends StatefulWidget {
  const _ReviewCard({required this.orderId});

  final String orderId;

  @override
  State<_ReviewCard> createState() => _ReviewCardState();
}

class _ReviewCardState extends State<_ReviewCard> {
  final _commentController = TextEditingController();
  int _rating = 0;
  bool _submitting = false;
  bool _done = false;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_rating == 0 || _submitting) return;
    final auth = context.read<AuthController>();
    final token = auth.accessToken;
    final messenger = ScaffoldMessenger.of(context);
    if (token == null) return;

    setState(() => _submitting = true);
    final controller = context.read<CustomerController>();
    final ok = await controller.submitReview(
      accessToken: token,
      orderId: widget.orderId,
      rating: _rating,
      comment: _commentController.text,
    );
    if (!mounted) return;
    setState(() {
      _submitting = false;
      _done = ok;
    });
    if (!ok) {
      messenger.showSnackBar(
        SnackBar(content: Text(controller.errorMessage ?? 'Gagal mengirim ulasan.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: _done ? _thanks() : _form(),
    );
  }

  Widget _thanks() {
    return const Row(
      children: [
        Icon(Icons.favorite, color: AppColors.success),
        SizedBox(width: 10),
        Expanded(
          child: Text(
            'Terima kasih atas ulasanmu!',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: _textDark,
            ),
          ),
        ),
      ],
    );
  }

  Widget _form() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Bagaimana pengalamanmu?',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: _textDark,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'Beri rating & masukan untuk layanan ini.',
          style: TextStyle(fontSize: 13, color: _textMuted, height: 1.35),
        ),
        const SizedBox(height: 12),
        Row(
          children: List.generate(5, (i) {
            final filled = i < _rating;
            return IconButton(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              constraints: const BoxConstraints(),
              onPressed: _submitting
                  ? null
                  : () => setState(() => _rating = i + 1),
              icon: Icon(
                filled ? Icons.star_rounded : Icons.star_outline_rounded,
                color: filled ? const Color(0xFFFFB400) : _textMuted,
                size: 34,
              ),
            );
          }),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _commentController,
          enabled: !_submitting,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: 'Tulis masukanmu (opsional)',
            filled: true,
            fillColor: AppColors.background,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: _line),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: _line),
            ),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: _primary,
              padding: const EdgeInsets.symmetric(vertical: 13),
            ),
            onPressed: (_rating == 0 || _submitting) ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('Kirim Ulasan'),
          ),
        ),
      ],
    );
  }
}
