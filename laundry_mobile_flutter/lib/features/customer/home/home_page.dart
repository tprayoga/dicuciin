part of '../home_screen.dart';

class _HomePage extends StatefulWidget {
  const _HomePage({
    required this.onOpenAccount,
    required this.onOpenScan,
    required this.onOpenLocation,
    required this.onOpenPromo,
  });

  final VoidCallback onOpenAccount;
  final VoidCallback onOpenScan;
  final VoidCallback onOpenLocation;
  final VoidCallback onOpenPromo;

  @override
  State<_HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<_HomePage> {
  late final PageController _promoCtrl;
  int _currentPromo = 0;
  int get _promoCount => _promos.length;

  @override
  void initState() {
    super.initState();
    _promoCtrl = PageController(viewportFraction: 0.88);
    _promoCtrl.addListener(() {
      final page = _promoCtrl.page?.round() ?? 0;
      if (page != _currentPromo) setState(() => _currentPromo = page);
    });
  }

  @override
  void dispose() {
    _promoCtrl.dispose();
    super.dispose();
  }

  void _showContactSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text(
                'Hubungi Kami',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: _textDark,
                ),
              ),
              SizedBox(height: 16),
              _ContactRow(
                icon: Icons.chat,
                label: 'WhatsApp',
                value: '+62 812-3456-7890',
              ),
              SizedBox(height: 12),
              _ContactRow(
                icon: Icons.email_outlined,
                label: 'Email',
                value: 'cs@dicuciin.com',
              ),
              SizedBox(height: 12),
              _ContactRow(
                icon: Icons.headset_mic_outlined,
                label: 'Call Center',
                value: '0800-1234-5678',
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final user = context.watch<AuthController>().user;
    final firstName = (user?.name ?? 'Pengguna').split(' ').first;

    return SingleChildScrollView(
      // Clamping → tidak ada efek bounce; terasa "fixed" saat konten muat,
      // tetap bisa scroll hanya jika layar terlalu kecil.
      physics: const ClampingScrollPhysics(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header + Wallet card ─────────────────────────────────
          Stack(
            children: [
              // Sizing: tinggi total = header biru (250) + overhang card (52)
              // agar card berada DALAM batas Stack → tombol bisa ditekan.
              const SizedBox(height: 302, width: double.infinity),
              // Background biru
              Container(
                height: 250,
                width: double.infinity,
                decoration: const BoxDecoration(
                  color: _blue,
                  borderRadius: BorderRadius.only(
                    bottomLeft: Radius.circular(28),
                  ),
                ),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    // Gambar mesin kanan
                    Positioned(
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 140,
                      child: ClipRRect(
                        borderRadius: const BorderRadius.only(
                          bottomLeft: Radius.circular(60),
                          bottomRight: Radius.circular(28),
                        ),
                        child: Image.asset(
                          'assets/mockups/location_cover.png',
                          fit: BoxFit.cover,
                          alignment: Alignment.centerLeft,
                          errorBuilder: (_, _, _) =>
                              Container(color: AppColors.primaryDark),
                        ),
                      ),
                    ),
                    // Gradient agar teks tetap terbaca di atas gambar
                    Positioned(
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 160,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.centerLeft,
                            end: Alignment.centerRight,
                            colors: [
                              _blue,
                              _blue.withValues(alpha: 0),
                            ],
                            stops: const [0.0, 0.5],
                          ),
                        ),
                      ),
                    ),
                    // Teks kiri
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 14, 150, 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Avatar
                          GestureDetector(
                            onTap: widget.onOpenAccount,
                            child: Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.white.withValues(alpha: 0.2),
                              ),
                              child: const Icon(
                                Icons.person,
                                color: Colors.white,
                                size: 20,
                              ),
                            ),
                          ),
                          const Spacer(),
                          // Lead-in kecil
                          const Text(
                            'Selamat Datang,',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 2),
                          // Nama user — anchor utama
                          Text(
                            '$firstName 👋',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 24,
                              fontWeight: FontWeight.w700,
                              height: 1.2,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Solusi self-service laundry yang cepat, higienis, dan praktis.',
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 12.5,
                              height: 1.4,
                            ),
                          ),
                          const SizedBox(height: 48),
                        ],
                      ),
                    ),
                    // Logo + ikon top
                    Positioned(
                      top: 14,
                      left: 0,
                      right: 0,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Row(
                          children: [
                            const SizedBox(width: 40),
                            const Spacer(),
                            Image.asset(
                              'assets/branding/logo-putih.png',
                              height: 26,
                              fit: BoxFit.contain,
                              errorBuilder: (_, _, _) => const Text(
                                'dicuciin',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            const Spacer(),
                            GestureDetector(
                              onTap: () => _showContactSheet(context),
                              child: const Icon(
                                Icons.call_outlined,
                                color: Colors.white,
                                size: 21,
                              ),
                            ),
                            const SizedBox(width: 14),
                            GestureDetector(
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => const _NotificationPage(),
                                ),
                              ),
                              child: Stack(
                                clipBehavior: Clip.none,
                                children: [
                                  const Icon(
                                    Icons.notifications_outlined,
                                    color: Colors.white,
                                    size: 21,
                                  ),
                                  Positioned(
                                    right: -2,
                                    top: -2,
                                    child: Container(
                                      width: 8,
                                      height: 8,
                                      decoration: const BoxDecoration(
                                        color: AppColors.primaryAccent,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Wallet card melayang (dalam batas Stack → tappable)
              Positioned(
                left: 20,
                right: 20,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.09),
                        blurRadius: 18,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: AppColors.tintBlue,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.account_balance_wallet_outlined,
                          color: _primary,
                          size: 19,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Total Saldo',
                              style: TextStyle(
                                fontSize: 11,
                                color: _textMuted,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Row(
                              children: [
                                Text(
                                  _formatRupiah(
                                    context.watch<WalletController>().balance,
                                  ),
                                  style: const TextStyle(
                                    fontSize: 18,
                                    color: _textDark,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(width: 5),
                                const Icon(
                                  Icons.remove_red_eye_outlined,
                                  color: _textMuted,
                                  size: 16,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const _TopUpPage(),
                          ),
                        ),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: _primary),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 7,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        ),
                        icon: const Icon(Icons.add, color: _primary, size: 15),
                        label: const Text(
                          'Top up',
                          style: TextStyle(color: _primary, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 20),

          // ── Promo carousel ───────────────────────────────────────
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Text(
              'Promo yang wajib dicek',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: _textDark,
              ),
            ),
          ),
          SizedBox(
            height: 175,
            child: PageView.builder(
              controller: _promoCtrl,
              itemCount: _promoCount,
              padEnds: true,
              itemBuilder: (_, i) {
                final promo = _promos[i];
                return Padding(
                  padding: EdgeInsets.only(
                    left: i == 0 ? 20 : 8,
                    right: i == _promoCount - 1 ? 20 : 0,
                  ),
                  child: GestureDetector(
                    onTap: widget.onOpenPromo,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: SizedBox(
                        width: screenWidth * 0.88,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Image.asset(
                              'assets/mockups/promo_banner.png',
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) =>
                                  Container(color: AppColors.tintBlueAlt),
                            ),
                            DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.bottomLeft,
                                  end: Alignment.topRight,
                                  colors: [
                                    Colors.black.withValues(alpha: 0.7),
                                    Colors.black.withValues(alpha: 0.15),
                                    Colors.transparent,
                                  ],
                                ),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.end,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    promo.title,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 18,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Kode: ${promo.code}',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          // Dots indicator — terpusat + animasi
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(_promoCount, (i) {
              final isActive = i == _currentPromo;
              return GestureDetector(
                onTap: () => _promoCtrl.animateToPage(
                  i,
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeInOut,
                ),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeInOut,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: isActive ? 22 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: isActive ? _primary : AppColors.borderLight,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              );
            }),
          ),

          const SizedBox(height: 24),

          // ── Service tiles ─────────────────────────────────────────
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, 14),
            child: Text(
              'Pilih layanan yang anda butuhkan!',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: _textDark,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                Expanded(
                  child: _ServiceTile(
                    label: 'Washing\nmachine',
                    onTap: widget.onOpenLocation,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: _ServiceTile(
                    label: 'Dryer\nmachine',
                    onTap: widget.onOpenLocation,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _ContactRow extends StatelessWidget {
  const _ContactRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.tintBlue,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: _primary, size: 20),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(fontSize: 12, color: _textMuted),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: _textDark,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
