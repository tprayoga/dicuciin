part of '../home_screen.dart';

class _LocationInfo {
  const _LocationInfo({
    required this.name,
    required this.address,
    required this.machineCount,
    required this.closeTime,
    required this.isOpen,
  });

  final String name;
  final String address;
  final int machineCount;
  final String closeTime;
  final bool isOpen;
}

class _LocationPage extends StatelessWidget {
  const _LocationPage({required this.onOpenDetail});

  final VoidCallback onOpenDetail;

  // Data mock — nanti diganti dari backend (outlet list)
  static const _locations = [
    _LocationInfo(
      name: 'Laundry Smart Sudirman',
      address: 'Jl. Jend. Sudirman No. 45, Jakarta Pusat',
      machineCount: 5,
      closeTime: '21:00',
      isOpen: true,
    ),
    _LocationInfo(
      name: 'Laundry Smart Kemang',
      address: 'Jl. Kemang Raya No. 12, Jakarta Selatan',
      machineCount: 3,
      closeTime: '22:00',
      isOpen: true,
    ),
    _LocationInfo(
      name: 'Laundry Smart Menteng',
      address: 'Jl. HOS Cokroaminoto No. 8, Jakarta Pusat',
      machineCount: 0,
      closeTime: '20:00',
      isOpen: false,
    ),
    _LocationInfo(
      name: 'Laundry Smart BSD',
      address: 'Jl. Pahlawan Seribu, Tangerang Selatan',
      machineCount: 7,
      closeTime: '23:00',
      isOpen: true,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final locations = [..._locations]
      ..sort((a, b) {
        if (a.isOpen == b.isOpen) {
          return b.machineCount.compareTo(a.machineCount);
        }
        return a.isOpen ? -1 : 1;
      });
    final openCount = locations.where((location) => location.isOpen).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _BlueHeader(title: 'Lokasi Laundry'),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Temukan lokasi laundry terdekat!',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: _textDark,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Cek mesin yang tersedia dan pilih sesuai kebutuhanmu.',
                      style: TextStyle(
                        fontSize: 14,
                        color: _textMuted,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: AppColors.tintBlueAlt,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '$openCount/${locations.length} Buka',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: _primary,
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _line),
            ),
            child: Row(
              children: [
                const Icon(Icons.tune, size: 16, color: _textMuted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Urutan: outlet yang masih buka ditampilkan lebih dulu',
                    style: TextStyle(
                      fontSize: 12,
                      color: _textMuted.withValues(alpha: 0.95),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            physics: const ClampingScrollPhysics(),
            itemCount: locations.length,
            separatorBuilder: (_, _) => const SizedBox(height: 14),
            itemBuilder: (_, index) {
              final loc = locations[index];
              return _LocationCard(
                name: loc.name,
                address: loc.address,
                machineCount: loc.machineCount,
                closeTime: loc.closeTime,
                isOpen: loc.isOpen,
                enabled: loc.isOpen,
                onTap: loc.isOpen ? onOpenDetail : null,
              );
            },
          ),
        ),
      ],
    );
  }
}
