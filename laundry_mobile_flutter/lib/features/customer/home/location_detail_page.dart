part of '../home_screen.dart';

class _LocationDetailPage extends StatefulWidget {
  const _LocationDetailPage();

  @override
  State<_LocationDetailPage> createState() => _LocationDetailPageState();
}

class _LocationDetailPageState extends State<_LocationDetailPage> {
  static const _locationName = 'Laundry Smart Sudirman';

  _MachineType _type = _MachineType.washer;
  bool _isMachineLoading = true;
  String? _machineError;
  List<_MachineData> _washerMachines = const [];
  List<_MachineData> _dryerMachines = const [];

  @override
  void initState() {
    super.initState();
    _loadMachines();
  }

  @override
  Widget build(BuildContext context) {
    const locationName = _locationName;
    const locationAddress = 'Jl. Jend. Sudirman No. 45, Jakarta Pusat';
    const closeTime = '21:00';
    const availableMachineCount = 5;

    final machines = _machinesForSelectedType;

    return Scaffold(
      backgroundColor: _bg,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Container(
              color: _blue,
              child: SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                  child: Column(
                    children: [
                      SizedBox(
                        height: 44,
                        child: Row(
                          children: [
                            IconButton(
                              onPressed: () => Navigator.of(context).pop(),
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                              icon: const Icon(
                                Icons.arrow_back,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(width: 14),
                            const Expanded(
                              child: Text(
                                'Lokasi Laundry',
                                style: TextStyle(
                                  fontSize: 17,
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            const SizedBox(width: 24),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      AspectRatio(
                        aspectRatio: 16 / 9,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              Image.asset(
                                'assets/mockups/location_cover.png',
                                fit: BoxFit.cover,
                                errorBuilder: (_, _, _) =>
                                    Container(color: AppColors.primaryDark),
                              ),
                              Container(
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.bottomCenter,
                                    end: Alignment.topCenter,
                                    colors: [
                                      Colors.black.withValues(alpha: 0.65),
                                      Colors.black.withValues(alpha: 0.15),
                                      Colors.transparent,
                                    ],
                                  ),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(16),
                                child: Align(
                                  alignment: Alignment.bottomLeft,
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        locationName,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 18,
                                          color: Colors.white,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        locationAddress,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          color: Colors.white,
                                          height: 1.35,
                                        ),
                                      ),
                                      const SizedBox(height: 10),
                                      Wrap(
                                        spacing: 8,
                                        runSpacing: 8,
                                        children: [
                                          _pill(
                                            '$availableMachineCount Mesin Tersedia',
                                            AppColors.tintBlueAlt,
                                            _primary,
                                          ),
                                          _pill(
                                            'Buka',
                                            AppColors.successBg,
                                            AppColors.success,
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: _line),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: _infoTile(
                            icon: Icons.local_laundry_service_outlined,
                            title: 'Mesin Aktif',
                            value: '$availableMachineCount Unit',
                          ),
                        ),
                        Container(width: 1, height: 36, color: _line),
                        Expanded(
                          child: _infoTile(
                            icon: Icons.access_time,
                            title: 'Tutup',
                            value: '$closeTime WIB',
                          ),
                        ),
                        Container(width: 1, height: 36, color: _line),
                        Expanded(
                          child: _infoTile(
                            icon: Icons.check_circle_outline,
                            title: 'Status',
                            value: 'Buka',
                            valueColor: AppColors.success,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Pilih mesin yang tersedia',
                          style: TextStyle(
                            fontSize: 18,
                            color: _textDark,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      TextButton.icon(
                        onPressed: _isMachineLoading ? null : _loadMachines,
                        style: TextButton.styleFrom(
                          visualDensity: VisualDensity.compact,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                            side: const BorderSide(color: _line),
                          ),
                        ),
                        icon: _isMachineLoading
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.refresh, size: 14),
                        label: const Text(
                          'Muat Ulang',
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Lihat status mesin dan pilih sesuai kebutuhanmu.',
                    style: TextStyle(
                      fontSize: 14,
                      color: _textMuted,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: _line),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: _SegmentButton(
                            active: _type == _MachineType.washer,
                            label: 'Mesin Cuci',
                            onTap: () {
                              setState(() => _type = _MachineType.washer);
                              if (_washerMachines.isEmpty &&
                                  !_isMachineLoading &&
                                  _machineError == null) {
                                _loadMachines();
                              }
                            },
                          ),
                        ),
                        Expanded(
                          child: _SegmentButton(
                            active: _type == _MachineType.dryer,
                            label: 'Mesin Pengering',
                            onTap: () {
                              setState(() => _type = _MachineType.dryer);
                              if (_dryerMachines.isEmpty &&
                                  !_isMachineLoading &&
                                  _machineError == null) {
                                _loadMachines();
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
          ..._buildMachineStateSlivers(context, machines),
        ],
      ),
    );
  }

  List<_MachineData> get _machinesForSelectedType =>
      _type == _MachineType.washer ? _washerMachines : _dryerMachines;

  Future<void> _loadMachines() async {
    setState(() {
      _isMachineLoading = true;
      _machineError = null;
    });

    try {
      // Simulasi fetch backend. Nanti diganti call API nyata.
      await Future<void>.delayed(const Duration(milliseconds: 450));
      if (!mounted) return;
      setState(() {
        _washerMachines = const [
          _MachineData(
            name: 'Mesin Cuci #01',
            status: _MachineStatus.available,
            type: _MachineType.washer,
            capacity: '8 KG',
            estimasi: '30 Menit',
            price: 20000,
          ),
          _MachineData(
            name: 'Mesin Cuci #02',
            status: _MachineStatus.inUse,
            type: _MachineType.washer,
            capacity: '12 KG',
            estimasi: '40 Menit',
            price: 25000,
          ),
          _MachineData(
            name: 'Mesin Cuci #03',
            status: _MachineStatus.maintenance,
            type: _MachineType.washer,
          ),
        ];
        _dryerMachines = const [
          _MachineData(
            name: 'Mesin Pengering #01',
            status: _MachineStatus.available,
            type: _MachineType.dryer,
            capacity: '10 KG',
            estimasi: '25 Menit',
            price: 18000,
          ),
          _MachineData(
            name: 'Mesin Pengering #02',
            status: _MachineStatus.inUse,
            type: _MachineType.dryer,
            capacity: '10 KG',
            estimasi: '25 Menit',
            price: 18000,
          ),
          _MachineData(
            name: 'Mesin Pengering #03',
            status: _MachineStatus.maintenance,
            type: _MachineType.dryer,
          ),
        ];
        _isMachineLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isMachineLoading = false;
        _machineError = 'Gagal memuat data mesin. Coba lagi.';
      });
    }
  }

  List<Widget> _buildMachineStateSlivers(
    BuildContext context,
    List<_MachineData> machines,
  ) {
    if (_isMachineLoading) {
      return [
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          sliver: SliverList.separated(
            itemBuilder: (_, index) => _loadingMachineCard(),
            separatorBuilder: (_, index) => const SizedBox(height: 14),
            itemCount: 3,
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 24)),
      ];
    }

    if (_machineError != null) {
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: _stateCard(
              icon: Icons.cloud_off_outlined,
              title: 'Data mesin belum tersedia',
              subtitle: _machineError!,
              actionLabel: 'Coba Lagi',
              onAction: _loadMachines,
            ),
          ),
        ),
      ];
    }

    if (machines.isEmpty) {
      return [
        SliverFillRemaining(
          hasScrollBody: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: _stateCard(
              icon: Icons.inbox_outlined,
              title: 'Belum ada mesin aktif',
              subtitle:
                  'Belum ada mesin untuk tipe ini. Coba pilih tipe lain atau muat ulang.',
              actionLabel: 'Muat Ulang',
              onAction: _loadMachines,
            ),
          ),
        ),
      ];
    }

    return [
      SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        sliver: SliverList.separated(
          itemBuilder: (_, index) {
            final machine = machines[index];
            return _MachineCard(
              machine: machine,
              onUse: machine.status == _MachineStatus.available
                  ? () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => _OrderCheckoutPage(
                            data: _CheckoutData.fromMachine(
                              machine,
                              locationName: _locationName,
                            ),
                          ),
                        ),
                      );
                    }
                  : null,
              onBook: machine.status == _MachineStatus.inUse
                  ? () => _showBookingSheet(machine)
                  : null,
            );
          },
          separatorBuilder: (_, index) => const SizedBox(height: 14),
          itemCount: machines.length,
        ),
      ),
      const SliverToBoxAdapter(child: SizedBox(height: 24)),
    ];
  }

  Widget _loadingMachineCard() {
    return Container(
      height: 178,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 160,
              height: 16,
              decoration: BoxDecoration(
                color: AppColors.borderLight,
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              height: 68,
              decoration: BoxDecoration(
                color: AppColors.surfaceAlt,
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            const Spacer(),
            Container(
              width: double.infinity,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.borderLight,
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stateCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required String actionLabel,
    required VoidCallback onAction,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 44, color: AppColors.textMutedLight),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 16,
              color: _textDark,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 13,
              color: _textMuted,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: AppOutlineButton(label: actionLabel, onTap: onAction),
          ),
        ],
      ),
    );
  }

  Widget _pill(String text, Color bgColor, Color textColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: textColor,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  static Widget _infoTile({
    required IconData icon,
    required String title,
    required String value,
    Color valueColor = _textDark,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: _textMuted),
              const SizedBox(width: 5),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 11,
                  color: _textMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              color: valueColor,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showBookingSheet(_MachineData machine) async {
    final slot = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
      ),
      builder: (_) => _BookingSheet(machineName: machine.name),
    );
    if (slot == null || !mounted) return;
    await _showBookingConfirmation(machine.name, slot);
  }

  Future<void> _showBookingConfirmation(String machineName, String slot) {
    return showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        title: const Row(
          children: [
            Icon(Icons.check_circle, color: AppColors.success),
            SizedBox(width: 10),
            Text(
              'Antrian Dibooking',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
            ),
          ],
        ),
        content: Text(
          'Kamu masuk antrian $machineName untuk slot $slot. '
          'Kami beri tahu saat mesin siap digunakan.',
          style: const TextStyle(fontSize: 14, color: _textMuted, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Mengerti'),
          ),
        ],
      ),
    );
  }
}
