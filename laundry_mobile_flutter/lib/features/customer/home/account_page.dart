part of '../home_screen.dart';

class _AccountPage extends StatelessWidget {
  const _AccountPage();

  Future<void> _confirmSignOutEverywhere(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Keluar dari semua perangkat?'),
        content: const Text(
          'Semua perangkat yang masuk dengan akun ini, termasuk HP ini, akan dikeluarkan.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Keluar Semua'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await context.read<AuthController>().signOutEverywhere();
      if (context.mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (context.mounted) AppToast.error(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;
    final name = user?.name ?? 'Nama Lengkap';
    final joinYear = DateTime.now().year;

    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header dengan tombol kembali.
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 20, 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.arrow_back, color: _textDark),
                  ),
                  const SizedBox(width: 4),
                  const Text(
                    'Akun',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: _textDark,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
                child: Column(
                  children: [
                    // Kartu profil ringkas.
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: _line),
                      ),
                      child: Row(
                        children: [
                          UserAvatar(
                            avatarUrl: user?.avatarUrl,
                            name: user?.name,
                            size: 60,
                            iconSize: 28,
                            backgroundColor: AppColors.tintBlue,
                            foregroundColor: AppColors.textMutedLight,
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                    color: _textDark,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  'Bergabung sejak $joinYear',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    color: _textMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Kartu menu.
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: _line),
                      ),
                      child: Column(
                        children: [
                          _AccountItem(
                            icon: Icons.dashboard_outlined,
                            title: 'Dashboard Member',
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const _MemberDashboardPage(),
                              ),
                            ),
                          ),
                          // Batch 5: profil & keamanan akun.
                          _AccountItem(
                            icon: Icons.person_outline,
                            title: 'Edit Profil',
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const EditProfileScreen(),
                              ),
                            ),
                          ),
                          _AccountItem(
                            icon: Icons.password_outlined,
                            title: 'Ubah Kata Sandi',
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const ChangePasswordScreen(),
                              ),
                            ),
                          ),
                          _AccountItem(
                            icon: Icons.lock_outline,
                            title: context.watch<WalletController>().hasPin
                                ? 'Ubah PIN Wallet'
                                : 'Buat PIN Wallet',
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => const _WalletPinSettingsPage(),
                              ),
                            ),
                          ),
                          // Batch 6 (R2): dulu tanpa aksi.
                          _AccountItem(
                            icon: Icons.settings_phone_outlined,
                            title: 'Hubungi Kami',
                            onTap: () => _showSupportSheet(context),
                          ),
                          _AccountItem(
                            icon: Icons.list_alt_outlined,
                            title: 'Ketentuan Layanan',
                            onTap: () => _openBannerLink(context, AppConfig.termsUrl),
                          ),
                          _AccountItem(
                            icon: Icons.note_alt_outlined,
                            title: 'Kebijakan Privasi',
                            onTap: () => _openBannerLink(context, AppConfig.privacyUrl),
                          ),
                          _AccountItem(
                            icon: Icons.person_remove_outlined,
                            title: 'Hapus Akun',
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(builder: (_) => const _DeleteAccountPage()),
                            ),
                          ),
                          _AccountItem(
                            icon: Icons.devices_other_outlined,
                            title: 'Keluar dari Semua Perangkat',
                            onTap: () => _confirmSignOutEverywhere(context),
                          ),
                          _AccountItem(
                            icon: Icons.logout,
                            title: 'Keluar',
                            onTap: () async {
                              await context.read<AuthController>().signOut();
                              if (context.mounted) Navigator.of(context).pop();
                            },
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
      bottomNavigationBar: _StaticBottomBar(
        showCenterScan: true,
        onTabSelected: (tab) => Navigator.of(context).pop(tab),
        onScan: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const _ScanQrPage()),
        ),
      ),
    );
  }
}

