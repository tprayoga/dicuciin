part of '../home_screen.dart';

class _OrderDetailPage extends StatelessWidget {
  const _OrderDetailPage({required this.order});

  final _OrderItem order;

  bool get _isRunning => order.status == _OrderStatus.running;
  Color get _statusColor =>
      _isRunning ? AppColors.warning : AppColors.success;
  Color get _statusBg => _isRunning ? AppColors.warningBg : AppColors.successBg;

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
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                children: [
                  _statusCard(),
                  const SizedBox(height: 16),
                  _detailCard(),
                  const SizedBox(height: 16),
                  _scheduleCard(),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _bottomBar(context),
    );
  }

  Widget _statusCard() {
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
              CircleAvatar(
                radius: 24,
                backgroundColor: _statusBg,
                child: Icon(
                  _isRunning ? Icons.local_laundry_service : Icons.check_rounded,
                  color: _statusColor,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.machineName,
                      style: const TextStyle(
                        fontSize: 18,
                        color: _textDark,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _isRunning
                          ? 'Mesin sedang kamu gunakan.'
                          : 'Order sudah selesai digunakan.',
                      style: const TextStyle(
                        fontSize: 12,
                        color: _textMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              _statusDot(order.status.label, _statusColor),
            ],
          ),
          if (_isRunning && order.remainingLabel != null) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.warningBg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.timelapse_outlined,
                    size: 18,
                    color: AppColors.warning,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: RichText(
                      text: TextSpan(
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                        children: [
                          TextSpan(
                            text: 'Sisa waktu ${order.remainingLabel}',
                            style: const TextStyle(color: AppColors.warning),
                          ),
                          if (order.finishLabel != null)
                            TextSpan(
                              text: ' (${order.finishLabel})',
                              style: const TextStyle(
                                color: _textMuted,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _detailCard() {
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
          const Text(
            'Rincian Order',
            style: TextStyle(
              fontSize: 16,
              color: _textDark,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          _DetailRow(left: 'No. Order', right: order.orderNo),
          _DetailRow(left: 'Kategori Mesin', right: order.machineType.label),
          _DetailRow(left: 'Kapasitas', right: order.capacity),
          _DetailRow(left: 'Estimasi', right: order.estimasi),
          _DetailRow(left: 'Tanggal', right: order.date),
          _DetailRow(left: 'Lokasi', right: order.locationName),
          _DetailRow(left: 'Metode', right: order.methodLabel),
          const SizedBox(height: 10),
          const Divider(height: 1),
          const SizedBox(height: 10),
          _DetailRow(
            left: 'Total Bayar',
            right: _formatRupiah(order.price),
            greenRight: true,
          ),
        ],
      ),
    );
  }

  Widget _scheduleCard() {
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
          const Text(
            'Jadwal Penggunaan',
            style: TextStyle(
              fontSize: 16,
              color: _textDark,
              fontWeight: FontWeight.w700,
            ),
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
            child: Row(
              children: [
                const Icon(Icons.schedule, size: 18, color: _primary),
                const SizedBox(width: 8),
                Text(
                  order.schedule.isEmpty ? '-' : order.schedule,
                  style: const TextStyle(
                    fontSize: 14,
                    color: _textDark,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          if (_isRunning) ...[
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
          child: AppPrimaryButton(
            label: 'Kembali',
            onTap: () => Navigator.of(context).pop(),
          ),
        ),
      ),
    );
  }
}
