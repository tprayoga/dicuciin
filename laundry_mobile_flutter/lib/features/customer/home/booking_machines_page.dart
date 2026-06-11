part of '../home_screen.dart';

/// Layar booking mesin sebuah outlet: daftar mesin nyata + status, reserve mesin
/// yang tersedia, dan kelola booking aktif (kode + hitung mundur + batal).
class _BookingMachinesPage extends StatefulWidget {
  const _BookingMachinesPage({required this.outlet});

  final OutletOption outlet;

  @override
  State<_BookingMachinesPage> createState() => _BookingMachinesPageState();
}

class _BookingMachinesPageState extends State<_BookingMachinesPage> {
  OutletMachines? _data;
  List<MachineBooking> _active = const [];
  bool _loading = true;
  String? _error;
  String? _reservingCode;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _load();
    // Hitung mundur reservasi: rebuild tiap detik.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _active.isNotEmpty) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  String? get _token => context.read<AuthController>().accessToken;

  Future<void> _load() async {
    final token = _token;
    if (token == null) {
      setState(() {
        _loading = false;
        _error = 'Sesi berakhir. Silakan masuk lagi.';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final ctrl = context.read<CustomerController>();
      final results = await Future.wait([
        ctrl.getOutletMachines(accessToken: token, outletId: widget.outlet.id),
        ctrl.getActiveBookings(accessToken: token),
      ]);
      if (!mounted) return;
      setState(() {
        _data = results[0] as OutletMachines;
        _active = results[1] as List<MachineBooking>;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Gagal memuat mesin. Coba lagi.';
        });
      }
    }
  }

  /// Alur booking: pilih waktu + layanan → reservasi mesin → checkout (order+bayar).
  Future<void> _openBookingFlow(OutletMachine m) async {
    final token = _token;
    if (token == null) return;

    final choice = await showModalBottomSheet<_BookingChoice>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _BookingFlowSheet(outlet: widget.outlet, machine: m),
    );
    if (choice == null || !mounted) return;

    // Reservasi mesin untuk waktu terjadwal.
    setState(() => _reservingCode = m.deviceCode);
    try {
      await context.read<CustomerController>().reserveMachine(
            accessToken: token,
            deviceCode: m.deviceCode,
            scheduledAt: choice.scheduledAt.toUtc().toIso8601String(),
          );
    } on ApiException catch (e) {
      if (mounted) AppToast.error(context, e.message);
      if (mounted) setState(() => _reservingCode = null);
      return;
    } catch (_) {
      if (mounted) AppToast.error(context, 'Gagal booking. Coba lagi.');
      if (mounted) setState(() => _reservingCode = null);
      return;
    }
    if (!mounted) return;
    setState(() => _reservingCode = null);

    // Lanjut ke checkout untuk order + pembayaran layanan terpilih.
    final svc = choice.service;
    final data = _CheckoutData(
      machineName: m.name,
      machineType:
          m.isWasher ? _MachineType.washer : _MachineType.dryer,
      capacity: svc.capacityKg != null
          ? '${svc.capacityKg!.toStringAsFixed(0)} KG'
          : '—',
      estimasi:
          svc.estimateMinutes != null ? '${svc.estimateMinutes} Menit' : '—',
      price: svc.price.round(),
      locationName: widget.outlet.name,
      orderNo: '-',
      date: _bookingDateLabel(choice.scheduledAt),
      serviceId: svc.serviceId,
      outletId: svc.outletId.isNotEmpty ? svc.outletId : widget.outlet.id,
    );
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => _OrderCheckoutPage(data: data)),
    );
    if (mounted) await _load();
  }

  Future<void> _cancel(MachineBooking b) async {
    final token = _token;
    if (token == null) return;
    try {
      await context
          .read<CustomerController>()
          .cancelBooking(accessToken: token, bookingId: b.id);
      if (!mounted) return;
      AppToast.info(context, 'Reservasi dibatalkan.');
      await _load();
    } on ApiException catch (e) {
      if (mounted) AppToast.error(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        child: Column(
          children: [
            const _BlueHeader(title: 'Booking Mesin', showBack: true),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? _errorView()
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView(
                            padding: const EdgeInsets.fromLTRB(20, 18, 20, 40),
                            children: [
                              _outletHeader(),
                              const SizedBox(height: 16),
                              if (_active.isNotEmpty) ...[
                                _sectionTitle('Booking Aktif'),
                                const SizedBox(height: 8),
                                ..._active.map(_activeCard),
                                const SizedBox(height: 16),
                              ],
                              _sectionTitle('Pilih Mesin'),
                              const SizedBox(height: 8),
                              ...(_data?.machines ?? []).map(_machineCard),
                              if ((_data?.machines.isEmpty ?? true))
                                const Padding(
                                  padding: EdgeInsets.only(top: 24),
                                  child: Center(
                                    child: Text('Belum ada mesin di outlet ini.',
                                        style: TextStyle(color: _textMuted)),
                                  ),
                                ),
                            ],
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _errorView() => Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: _textMuted)),
              const SizedBox(height: 16),
              AppPrimaryButton(label: 'Coba Lagi', onTap: _load),
            ],
          ),
        ),
      );

  Widget _sectionTitle(String t) => Text(
        t,
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: _textDark,
        ),
      );

  Widget _outletHeader() {
    final occ = _data?.occupancy;
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
          Text(widget.outlet.name,
              style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: _textDark)),
          const SizedBox(height: 4),
          Text(widget.outlet.address,
              style: const TextStyle(fontSize: 13, color: _textMuted)),
          if (occ != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                _OccupancyChip(level: occ.level, remark: occ.remark),
                const SizedBox(width: 10),
                Flexible(
                  child: Text(
                    '${occ.available} dari ${occ.total} mesin tersedia',
                    style: const TextStyle(fontSize: 12.5, color: _textMuted),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _activeCard(MachineBooking b) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.tintBlueAlt,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(b.deviceName ?? b.deviceCode ?? 'Mesin',
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, color: _textDark)),
                const SizedBox(height: 2),
                Text('Kode booking: ${b.bookingCode}',
                    style: const TextStyle(fontSize: 12.5, color: _textMuted)),
                if (b.scheduledAt != null)
                  Text('Jadwal: ${_bookingDateLabel(b.scheduledAt!)}',
                      style: const TextStyle(fontSize: 12.5, color: _textMuted)),
                const SizedBox(height: 2),
                Text(
                  b.status == 'IN_USE'
                      ? 'Sedang dipakai'
                      : 'Scan QR mesin untuk mulai • ${_remainingText(b)}',
                  style: TextStyle(
                    fontSize: 12,
                    color: b.status == 'IN_USE' ? AppColors.success : _primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          if (b.status == 'RESERVED')
            TextButton(
              onPressed: () => _cancel(b),
              child: const Text('Batal',
                  style: TextStyle(color: AppColors.error)),
            ),
        ],
      ),
    );
  }

  String _bookingDateLabel(DateTime dt) {
    final now = DateTime.now();
    final isToday =
        dt.year == now.year && dt.month == now.month && dt.day == now.day;
    final hh = dt.hour.toString().padLeft(2, '0');
    final mm = dt.minute.toString().padLeft(2, '0');
    final prefix = isToday ? 'Hari ini' : _formatDateId(dt);
    return '$prefix, $hh:$mm';
  }

  String _remainingText(MachineBooking b) {
    final exp = b.expiresAt;
    if (exp == null) return 'aktif';
    final left = exp.difference(DateTime.now());
    if (left.isNegative) return 'kedaluwarsa';
    final m = left.inMinutes;
    final s = left.inSeconds % 60;
    return 'sisa ${m}m ${s.toString().padLeft(2, '0')}s';
  }

  Widget _machineCard(OutletMachine m) {
    final reserving = _reservingCode == m.deviceCode;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _line),
      ),
      child: Row(
        children: [
          Icon(
            m.isWasher ? Icons.local_laundry_service : Icons.dry_cleaning,
            color: _primary,
            size: 30,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(m.name,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, color: _textDark)),
                const SizedBox(height: 2),
                Text(m.isWasher ? 'Mesin Cuci' : 'Mesin Pengering',
                    style: const TextStyle(fontSize: 12.5, color: _textMuted)),
                const SizedBox(height: 6),
                _MachineStatusChip(status: m.status),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (m.bookable)
            _BookingPillButton(
              loading: reserving,
              onTap: () => _openBookingFlow(m),
            ),
        ],
      ),
    );
  }
}

/// Tombol "Booking" ringkas bergaya pill.
class _BookingPillButton extends StatelessWidget {
  const _BookingPillButton({required this.onTap, this.loading = false});

  final VoidCallback onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: _primary,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: loading ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          child: loading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                )
              : const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.event_available, size: 16, color: Colors.white),
                    SizedBox(width: 6),
                    Text('Booking',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700)),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Pilihan hasil dari sheet booking: waktu + layanan.
class _BookingChoice {
  const _BookingChoice({required this.scheduledAt, required this.service});
  final DateTime scheduledAt;
  final ServicePriceOption service;
}

/// Bottom sheet: pilih waktu (slot jam) + layanan untuk mesin yang dibooking.
class _BookingFlowSheet extends StatefulWidget {
  const _BookingFlowSheet({required this.outlet, required this.machine});

  final OutletOption outlet;
  final OutletMachine machine;

  @override
  State<_BookingFlowSheet> createState() => _BookingFlowSheetState();
}

class _BookingFlowSheetState extends State<_BookingFlowSheet> {
  bool _loading = true;
  String? _error;
  List<ServicePriceOption> _services = const [];

  int _dayOffset = 0; // 0 = hari ini, 1 = besok
  DateTime? _slot;
  ServicePriceOption? _service;

  @override
  void initState() {
    super.initState();
    _loadServices();
  }

  Future<void> _loadServices() async {
    final token = context.read<AuthController>().accessToken;
    if (token == null) {
      setState(() {
        _loading = false;
        _error = 'Sesi berakhir. Silakan masuk lagi.';
      });
      return;
    }
    try {
      final prices = await context.read<CustomerController>().getServicePrices(
            accessToken: token,
            outletId: widget.outlet.id,
          );
      if (!mounted) return;
      // Saring sesuai tipe mesin; bila tak ada yang cocok, tampilkan semua.
      final wantDryer = !widget.machine.isWasher;
      final filtered = prices
          .where((p) =>
              ((p.machineType ?? '').toUpperCase().contains('DRY')) == wantDryer)
          .toList();
      setState(() {
        _services = filtered.isNotEmpty ? filtered : prices;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Gagal memuat layanan.';
        });
      }
    }
  }

  /// Slot jam untuk hari terpilih: hari ini mulai jam berikutnya, besok 08:00.
  List<DateTime> get _slots {
    final base = DateTime.now().add(Duration(days: _dayOffset));
    final day = DateTime(base.year, base.month, base.day);
    final startHour = _dayOffset == 0
        ? (DateTime.now().hour + 1).clamp(8, 21)
        : 8;
    return [
      for (int h = startHour; h <= 21; h++) day.add(Duration(hours: h)),
    ];
  }

  bool get _ready => _slot != null && _service != null;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.78,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scroll) => Container(
        decoration: const BoxDecoration(
          color: _bg,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: _line,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Booking Mesin',
                            style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                                color: _textDark)),
                        const SizedBox(height: 2),
                        Text(widget.machine.name,
                            style: const TextStyle(
                                fontSize: 13, color: _textMuted)),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, color: _textMuted),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? Center(
                          child: Text(_error!,
                              style: const TextStyle(color: _textMuted)))
                      : ListView(
                          controller: scroll,
                          padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
                          children: [
                            _label('Pilih Waktu'),
                            const SizedBox(height: 8),
                            _dayTabs(),
                            const SizedBox(height: 10),
                            _slotChips(),
                            const SizedBox(height: 20),
                            _label('Pilih Layanan'),
                            const SizedBox(height: 8),
                            ..._services.map(_serviceTile),
                          ],
                        ),
            ),
            _bottomBar(),
          ],
        ),
      ),
    );
  }

  Widget _label(String t) => Text(t,
      style: const TextStyle(
          fontSize: 15, fontWeight: FontWeight.w700, color: _textDark));

  Widget _dayTabs() {
    Widget tab(String label, int offset) {
      final active = _dayOffset == offset;
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() {
            _dayOffset = offset;
            _slot = null;
          }),
          child: Container(
            margin: const EdgeInsets.only(right: 8),
            padding: const EdgeInsets.symmetric(vertical: 10),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: active ? _primary : Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: active ? _primary : _line),
            ),
            child: Text(label,
                style: TextStyle(
                    color: active ? Colors.white : _textDark,
                    fontWeight: FontWeight.w600,
                    fontSize: 13.5)),
          ),
        ),
      );
    }

    return Row(children: [tab('Hari ini', 0), tab('Besok', 1)]);
  }

  Widget _slotChips() {
    final slots = _slots;
    if (slots.isEmpty) {
      return const Text('Tidak ada slot tersisa hari ini.',
          style: TextStyle(color: _textMuted, fontSize: 13));
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: slots.map((s) {
        final active = _slot == s;
        final label = '${s.hour.toString().padLeft(2, '0')}:00';
        return GestureDetector(
          onTap: () => setState(() => _slot = s),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: active ? _primary : Colors.white,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: active ? _primary : _line),
            ),
            child: Text(label,
                style: TextStyle(
                    color: active ? Colors.white : _textDark,
                    fontWeight: FontWeight.w600,
                    fontSize: 13)),
          ),
        );
      }).toList(),
    );
  }

  Widget _serviceTile(ServicePriceOption s) {
    final active = _service?.serviceId == s.serviceId;
    return GestureDetector(
      onTap: () => setState(() => _service = s),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: active ? _primary : _line, width: active ? 1.5 : 1),
        ),
        child: Row(
          children: [
            Icon(active ? Icons.radio_button_checked : Icons.radio_button_off,
                color: active ? _primary : _textMuted, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s.serviceName,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, color: _textDark)),
                  if (s.estimateMinutes != null)
                    Text('Estimasi ${s.estimateMinutes} menit',
                        style:
                            const TextStyle(fontSize: 12, color: _textMuted)),
                ],
              ),
            ),
            Text(_formatRupiah(s.price.round()),
                style: const TextStyle(
                    fontWeight: FontWeight.w700, color: _primary)),
          ],
        ),
      ),
    );
  }

  Widget _bottomBar() {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: _line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: _ready
              ? AppPrimaryButton(
                  label: 'Lanjut Bayar',
                  onTap: () => Navigator.of(context).pop(
                    _BookingChoice(scheduledAt: _slot!, service: _service!),
                  ),
                )
              : const AppDisabledButton(label: 'Pilih waktu & layanan'),
        ),
      ),
    );
  }
}

class _OccupancyChip extends StatelessWidget {
  const _OccupancyChip({required this.level, required this.remark});

  final String level;
  final String remark;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (level) {
      'low' => (AppColors.successBg, AppColors.success),
      'medium' => (AppColors.tintBlue, _primary),
      'high' => (AppColors.warningBg, AppColors.warning),
      'full' => (AppColors.errorBg, AppColors.error),
      _ => (AppColors.surfaceAlt, _textMuted),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        remark,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: fg),
      ),
    );
  }
}

class _MachineStatusChip extends StatelessWidget {
  const _MachineStatusChip({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg) = switch (status) {
      'AVAILABLE' => ('Tersedia', AppColors.successBg, AppColors.success),
      'RESERVED' => ('Dibooking', AppColors.warningBg, AppColors.warning),
      'IN_USE' => ('Dipakai', AppColors.errorBg, AppColors.error),
      _ => ('Offline', AppColors.surfaceAlt, _textMuted),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: fg),
      ),
    );
  }
}
