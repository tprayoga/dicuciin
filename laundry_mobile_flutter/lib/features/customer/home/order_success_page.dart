part of '../home_screen.dart';

class _OrderSuccessPage extends StatelessWidget {
  const _OrderSuccessPage({
    required this.data,
    required this.methodLabel,
    required this.total,
  });

  final _CheckoutData data;
  final String methodLabel;
  final int total;

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
