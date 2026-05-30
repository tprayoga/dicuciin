part of '../home_screen.dart';

class _AccountPage extends StatelessWidget {
  const _AccountPage();

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;
    final name = user?.name ?? 'Nama Lengkap';
    final joinYear = DateTime.now().year;

    return Scaffold(
      backgroundColor: _blue,
      body: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 8),
            const SizedBox(
              height: 52,
              child: Center(
                child: Text(
                  'Akun',
                  style: TextStyle(
                    fontSize: 17,
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            Expanded(
              child: Container(
                width: double.infinity,
                decoration: const BoxDecoration(color: _bg),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 120),
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: _line),
                    ),
                    child: Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(20),
                          child: Row(
                            children: [
                              Container(
                                width: 102,
                                height: 102,
                                decoration: const BoxDecoration(
                                  color: AppColors.tintBlue,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.image_outlined,
                                  size: 46,
                                  color: AppColors.textMutedLight,
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      name,
                                      style: const TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w600,
                                        color: _textDark,
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      'Bergabung sejak $joinYear',
                                      style: const TextStyle(
                                        fontSize: 14,
                                        color: _textMuted,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const Icon(Icons.open_in_new, size: 28),
                            ],
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
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: const _StaticBottomBar(showCenterScan: true),
    );
  }
}

