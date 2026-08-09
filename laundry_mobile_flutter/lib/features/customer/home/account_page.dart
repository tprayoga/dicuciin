part of '../home_screen.dart';

class _AccountPage extends StatelessWidget {
  const _AccountPage();

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
                          const _AccountItem(
                            icon: Icons.settings_phone_outlined,
                            title: 'Hubungi Kami',
                          ),
                          const _AccountItem(
                            icon: Icons.list_alt_outlined,
                            title: 'Ketentuan Layanan',
                          ),
                          const _AccountItem(
                            icon: Icons.note_alt_outlined,
                            title: 'Kebijakan Privasi',
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

