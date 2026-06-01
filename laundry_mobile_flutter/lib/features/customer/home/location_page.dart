part of '../home_screen.dart';

class _LocationPage extends StatefulWidget {
  const _LocationPage({required this.onOpenDetail});

  /// Dipanggil saat sebuah outlet dipilih → buka halaman detail (daftar mesin).
  final void Function(OutletOption outlet) onOpenDetail;

  @override
  State<_LocationPage> createState() => _LocationPageState();
}

class _LocationPageState extends State<_LocationPage> {
  bool _loading = true;
  String? _error;
  List<OutletOption> _outlets = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final auth = context.read<AuthController>();
    final token = auth.accessToken;
    if (token == null) {
      setState(() {
        _loading = false;
        _error = 'Silakan masuk untuk melihat lokasi.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    final outlets =
        await context.read<CustomerController>().getOutlets(accessToken: token);
    if (!mounted) return;
    setState(() {
      _outlets = outlets;
      _loading = false;
      _error = outlets.isEmpty ? 'Belum ada outlet tersedia.' : null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _BlueHeader(title: 'Lokasi Laundry'),
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, 0),
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
                style: TextStyle(fontSize: 14, color: _textMuted, height: 1.4),
              ),
            ],
          ),
        ),
        Expanded(child: _body()),
      ],
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null && _outlets.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.store_mall_directory_outlined,
                  size: 44, color: AppColors.textMutedLight),
              const SizedBox(height: 14),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, color: _textMuted),
              ),
              const SizedBox(height: 16),
              AppOutlineButton(label: 'Coba Lagi', onTap: _load),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: _outlets.length,
        separatorBuilder: (_, _) => const SizedBox(height: 14),
        itemBuilder: (_, index) {
          final outlet = _outlets[index];
          return _LocationCard(
            name: outlet.name,
            address: outlet.address,
            machineCount: -1, // jumlah mesin dilihat di halaman detail
            closeTime: '',
            isOpen: true,
            enabled: true,
            onTap: () => widget.onOpenDetail(outlet),
          );
        },
      ),
    );
  }
}
