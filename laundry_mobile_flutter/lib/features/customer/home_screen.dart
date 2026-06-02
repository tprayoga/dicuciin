import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../shared/widgets/app_buttons.dart';
import '../../shared/widgets/pin_pad.dart';
import '../auth/auth_controller.dart';
import 'customer_controller.dart';
import 'models/customer_models.dart';
import 'wallet_controller.dart';

part 'home/home_models.dart';
part 'home/home_widgets.dart';
part 'home/home_page.dart';
part 'home/promo_page.dart';
part 'home/location_page.dart';
part 'home/order_page.dart';
part 'home/order_detail_page.dart';
part 'home/account_page.dart';
part 'home/location_detail_page.dart';
part 'home/order_checkout_page.dart';
part 'home/wallet_pin_sheet.dart';
part 'home/wallet_pin_settings_page.dart';
part 'home/payment_qris_page.dart';
part 'home/payment_va_page.dart';
part 'home/order_success_page.dart';
part 'home/scan_qr_page.dart';
part 'home/notification_page.dart';
part 'home/topup_page.dart';
part 'home/member_dashboard_page.dart';

const _blue = AppColors.primaryDark;
const _primary = AppColors.primary;
const _bg = AppColors.background;
const _textDark = AppColors.textDark;
const _textMuted = AppColors.textMuted;
const _line = AppColors.border;

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  _MainTab _tab = _MainTab.home;

  @override
  void initState() {
    super.initState();
    // Muat data dashboard (saldo, order, promo, banner) sekali saat home dibuka,
    // lalu tampilkan pop-up promosi (HOME_POPUP) bila ada.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final auth = context.read<AuthController>();
      final user = auth.user;
      final token = auth.accessToken;
      if (user == null || token == null) return;
      final controller = context.read<CustomerController>();
      await controller.loadDashboard(user: user, accessToken: token);
      if (!mounted) return;
      _maybeShowPopup(controller);
    });
  }

  void _maybeShowPopup(CustomerController controller) {
    final popups = controller.popupBanners;
    if (popups.isEmpty) return;
    controller.markPopupShown();
    final banner = popups.first;
    showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (_) => _BannerPopupDialog(banner: banner),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: SafeArea(
        bottom: false,
        child: IndexedStack(
          index: _tab.index,
          children: [
            _HomePage(
              onOpenAccount: _openAccount,
              onOpenScan: _openScan,
              onOpenLocation: () => setState(() => _tab = _MainTab.location),
              onOpenPromo: () => setState(() => _tab = _MainTab.promo),
            ),
            const _PromoPage(),
            _LocationPage(onOpenDetail: _openLocationDetail),
            const _OrderPage(),
          ],
        ),
      ),
      bottomNavigationBar: _MainBottomBar(
        tab: _tab,
        onTap: (tab) => setState(() => _tab = tab),
        onScan: _openScan,
      ),
    );
  }

  void _openAccount() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const _AccountPage()));
  }

  void _openLocationDetail(OutletOption outlet) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => _LocationDetailPage(outlet: outlet)),
    );
  }

  void _openScan() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const _ScanQrPage()));
  }
}

/// Buka [url] di browser/app eksternal. Diam bila kosong/gagal (UI tetap aman).
Future<void> _openBannerLink(BuildContext context, String? url) async {
  if (url == null || url.trim().isEmpty) return;
  final uri = Uri.tryParse(url.trim());
  if (uri == null) return;
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Tidak bisa membuka tautan.')),
    );
  }
}

/// Pop-up promosi/iklan (HOME_POPUP) yang muncul sekali per sesi saat masuk app.
/// Mendukung CTA berlink (mis. ajakan ulasan Google).
class _BannerPopupDialog extends StatelessWidget {
  const _BannerPopupDialog({required this.banner});

  final AppBanner banner;

  @override
  Widget build(BuildContext context) {
    final hasLink = (banner.linkUrl ?? '').trim().isNotEmpty;
    return Dialog(
      backgroundColor: Colors.white,
      insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: Image.network(
                  banner.imageUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => Container(
                    color: AppColors.tintBlueAlt,
                    child: const Center(
                      child: Icon(Icons.image_outlined,
                          size: 48, color: AppColors.textMutedLight),
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: Material(
                  color: Colors.black.withValues(alpha: 0.35),
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => Navigator.of(context).pop(),
                    child: const Padding(
                      padding: EdgeInsets.all(6),
                      child: Icon(Icons.close, color: Colors.white, size: 20),
                    ),
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
            child: Column(
              children: [
                Text(
                  banner.title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: _textDark,
                  ),
                ),
                if (hasLink) ...[
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: _primary,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      onPressed: () {
                        Navigator.of(context).pop();
                        _openBannerLink(context, banner.linkUrl);
                      },
                      child: Text(banner.ctaLabel?.trim().isNotEmpty == true
                          ? banner.ctaLabel!
                          : 'Lihat'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
