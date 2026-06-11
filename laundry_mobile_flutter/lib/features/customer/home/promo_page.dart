part of '../home_screen.dart';

class _PromoPage extends StatelessWidget {
  const _PromoPage();

  @override
  Widget build(BuildContext context) {
    final promos = context.watch<CustomerController>().promos;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _BlueHeader(title: 'Promo'),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            physics: const ClampingScrollPhysics(),
            children: [
              const Text(
                'Cuci Lebih Hemat Setiap Hari',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: _textDark,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Nikmati diskon dan penawaran menarik untuk pengalaman laundry yang lebih hemat.',
                style: TextStyle(fontSize: 14, color: _textMuted, height: 1.4),
              ),
              const SizedBox(height: 20),
              if (promos.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 40),
                  child: Center(
                    child: Column(
                      children: [
                        const Text(
                          'Belum ada promo aktif saat ini.',
                          style: TextStyle(fontSize: 14, color: _textMuted),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: 160,
                          child: AppOutlineButton(
                            label: 'Muat ulang',
                            onTap: () {
                              final auth = context.read<AuthController>();
                              final user = auth.user;
                              final token = auth.accessToken;
                              if (user != null && token != null) {
                                context.read<CustomerController>().loadDashboard(
                                      user: user,
                                      accessToken: token,
                                    );
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              else
                for (final promo in promos) ...[
                  _PromoCard(promo: promo),
                  const SizedBox(height: 16),
                ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Label periode promo (mis. "Berlaku s.d. 30 Juni 2026").
String _promoPeriodLabel(PromoSummary promo) =>
    'Berlaku s.d. ${_formatDateId(promo.endDate)}';

/// Gambar promo: pakai [url] (network) bila ada, fallback ke aset/placeholder.
Widget _promoImage(String? url, {BoxFit fit = BoxFit.cover}) {
  Widget placeholder() => Container(
        color: AppColors.tintBlueAlt,
        child: const Center(
          child: Icon(Icons.image_outlined,
              size: 48, color: AppColors.textMutedLight),
        ),
      );
  if (url != null && url.trim().isNotEmpty) {
    return Image.network(url, fit: fit, errorBuilder: (_, _, _) => placeholder());
  }
  return Image.asset('assets/mockups/promo_banner.png',
      fit: fit, errorBuilder: (_, _, _) => placeholder());
}

class _PromoCard extends StatelessWidget {
  const _PromoCard({required this.promo});

  final PromoSummary promo;

  Future<void> _copyCode(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: promo.code));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Kode promo ${promo.code} disalin.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Banner — aspect ratio tetap agar konsisten apapun aset-nya
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: AspectRatio(
              aspectRatio: 2,
              child: _promoImage(promo.bannerUrl),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            promo.name,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: _textDark,
            ),
          ),
          if (promo.description != null && promo.description!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              promo.description!,
              style: const TextStyle(fontSize: 14, color: _textMuted),
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(
                Icons.local_offer_outlined,
                size: 14,
                color: _primary,
              ),
              const SizedBox(width: 6),
              Text(
                _promoPeriodLabel(promo),
                style: const TextStyle(
                  fontSize: 13,
                  color: _primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Kode promo + tombol salin
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
            decoration: BoxDecoration(
              color: AppColors.tintBlueAlt,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: _primary.withValues(alpha: 0.35)),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.confirmation_number_outlined,
                  size: 18,
                  color: _primary,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    promo.code,
                    style: const TextStyle(
                      fontSize: 15,
                      color: _primary,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => _copyCode(context),
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    minimumSize: const Size(0, 34),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  icon: const Icon(Icons.copy, size: 15),
                  label: const Text(
                    'Salin',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
