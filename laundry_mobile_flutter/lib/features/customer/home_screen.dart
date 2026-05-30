import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_colors.dart';
import '../../shared/widgets/app_buttons.dart';
import '../../shared/widgets/pin_pad.dart';
import '../auth/auth_controller.dart';
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

  void _openLocationDetail() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const _LocationDetailPage()));
  }

  void _openScan() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const _ScanQrPage()));
  }
}
