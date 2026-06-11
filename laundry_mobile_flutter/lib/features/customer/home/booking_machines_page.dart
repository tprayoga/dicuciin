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

  Future<void> _reserve(OutletMachine m) async {
    final token = _token;
    if (token == null) return;
    setState(() => _reservingCode = m.deviceCode);
    try {
      final booking = await context.read<CustomerController>().reserveMachine(
            accessToken: token,
            deviceCode: m.deviceCode,
          );
      if (!mounted) return;
      AppToast.success(context, 'Mesin dibooking — kode ${booking.bookingCode}');
      await _load();
    } on ApiException catch (e) {
      if (mounted) AppToast.error(context, e.message);
    } catch (_) {
      if (mounted) AppToast.error(context, 'Gagal booking. Coba lagi.');
    } finally {
      if (mounted) setState(() => _reservingCode = null);
    }
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
                Text(
                  '${occ.available} dari ${occ.total} mesin tersedia',
                  style: const TextStyle(fontSize: 12.5, color: _textMuted),
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
            reserving
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : SizedBox(
                    height: 38,
                    child: AppPrimaryButton(
                      label: 'Booking',
                      onTap: () => _reserve(m),
                    ),
                  ),
        ],
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
