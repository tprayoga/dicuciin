import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import 'kiosk_controller.dart';
import 'models.dart';

// ── Token warna terpusat — palet resmi Di.Cuciin (Brand Book V01). ──
const primary = Color(0xFF0360DA); // water blue
const primaryDark = Color(0xFF0349A8);
const accent = Color(0xFFFD6A01); // orange (aksen brand)
const brandTurquoise = Color(0xFF05DCF3);

const background = Color(0xFFF2F5FA);
const surfaceAlt = Color(0xFFF7F9FC);
const tintBlue = Color(0xFFE7EEF8);
const tintBlueAlt = Color(0xFFEAF3FF);

const textDark = Color(0xFF272526); // brand black
const textMuted = Color(0xFF667A9E);
const textMutedLight = Color(0xFF90A1BE);

const line = Color(0xFFBFCDE0);
const borderLight = Color(0xFFD6E0EE);

const success = Color(0xFF21A84E);
const successBg = Color(0xFFE6F8EB);
const warning = Color(0xFFF39800);
const warningBg = Color(0xFFF5EFE2);
const errorColor = Color(0xFFE1442F);
const errorBg = Color(0xFFFCE7E5);

class KioskApp extends StatelessWidget {
  const KioskApp({super.key});

  @override
  Widget build(BuildContext context) {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: primary,
      primary: primary,
      secondary: accent,
      error: errorColor,
      surface: Colors.white,
    );

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Dicuciin Kiosk',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: colorScheme,
        scaffoldBackgroundColor: background,
        textTheme: GoogleFonts.poppinsTextTheme().apply(
          bodyColor: textDark,
          displayColor: textDark,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: surfaceAlt,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: line),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: line),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: primary, width: 1.5),
          ),
        ),
        dividerColor: borderLight,
      ),
      home: const PortraitFrame(child: KioskRouter()),
    );
  }
}

class PortraitFrame extends StatelessWidget {
  const PortraitFrame({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF071A33),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxHeight * 9 / 16 <= constraints.maxWidth
              ? constraints.maxHeight * 9 / 16
              : constraints.maxWidth;
          return Center(
            child: SizedBox(
              width: width,
              height: width * 16 / 9,
              child: ClipRect(
                child: ColoredBox(color: background, child: child),
              ),
            ),
          );
        },
      ),
    );
  }
}

class KioskRouter extends StatelessWidget {
  const KioskRouter({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    return switch (controller.stage) {
      KioskStage.initializing => const InitializingScreen(),
      KioskStage.enrollment => const EnrollmentScreen(),
      KioskStage.closed => const ClosedScreen(),
      KioskStage.welcome => const WelcomeScreen(),
      KioskStage.machines => const MachinesScreen(),
      KioskStage.checkout => const CheckoutScreen(),
      KioskStage.payment => const PaymentScreen(),
      KioskStage.success => const SuccessScreen(),
    };
  }
}

class InitializingScreen extends StatelessWidget {
  const InitializingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.water_drop_rounded, color: primary, size: 72),
            SizedBox(height: 24),
            CircularProgressIndicator(),
            SizedBox(height: 14),
            Text(
              'Menyiapkan perangkat kiosk...',
              style: TextStyle(color: textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class EnrollmentScreen extends StatefulWidget {
  const EnrollmentScreen({super.key});

  @override
  State<EnrollmentScreen> createState() => _EnrollmentScreenState();
}

class _EnrollmentScreenState extends State<EnrollmentScreen> {
  final code = TextEditingController();

  @override
  void dispose() {
    code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            children: [
              const BlueHero(
                icon: Icons.qr_code_2_rounded,
                title: 'Enroll Kiosk',
                subtitle: 'Hubungkan perangkat ke outlet',
              ),
              Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'Masukkan Kode Enrollment',
                      style: TextStyle(
                        color: textDark,
                        fontSize: 24,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Buat kode 6 digit dari Admin Panel pada Kelola Outlet → Kelola Kiosk.',
                      style: TextStyle(color: textMuted, height: 1.4),
                    ),
                    const SizedBox(height: 26),
                    TextField(
                      controller: code,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 30,
                        letterSpacing: 10,
                        fontWeight: FontWeight.w700,
                      ),
                      onSubmitted: (_) => controller.enroll(code.text),
                      decoration: inputDecoration(
                        'Kode 6 digit',
                        Icons.key_rounded,
                      ),
                    ),
                    if (controller.error != null) ...[
                      const SizedBox(height: 15),
                      ErrorMessage(controller.error!),
                    ],
                    const SizedBox(height: 22),
                    PrimaryButton(
                      label: 'Hubungkan Perangkat',
                      loading: controller.loading,
                      onPressed: () => controller.enroll(code.text),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ClosedScreen extends StatelessWidget {
  const ClosedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            children: [
              const Brand(),
              const Spacer(),
              Container(
                width: 150,
                height: 150,
                decoration: const BoxDecoration(
                  color: tintBlue,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.schedule_rounded,
                  color: primary,
                  size: 82,
                ),
              ),
              const SizedBox(height: 28),
              const Text(
                'Kiosk Sedang Tutup',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: textDark,
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                '${controller.terminal?.outlet.name ?? 'Outlet'} sedang berada di luar jam operasional.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: textMuted,
                  fontSize: 15,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Layar akan aktif kembali secara otomatis sesuai jadwal.',
                textAlign: TextAlign.center,
                style: TextStyle(color: textMuted, fontSize: 13),
              ),
              const Spacer(),
              const Text(
                'Status perangkat dipantau otomatis.',
                style: TextStyle(color: textMuted, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    return Material(
      color: Colors.white,
      child: InkWell(
        onTap: controller.startOrder,
        child: SafeArea(
          child: Column(
            children: [
              Expanded(
                flex: 6,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(24, 28, 24, 30),
                  decoration: const BoxDecoration(
                    color: primaryDark,
                    borderRadius: BorderRadius.only(
                      bottomLeft: Radius.circular(36),
                      bottomRight: Radius.circular(36),
                    ),
                  ),
                  child: const Column(
                    children: [
                      Brand(),
                      Spacer(),
                      CircleIllustration(),
                      Spacer(),
                      Text(
                        'Laundry Jadi\nLebih Mudah',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 32,
                          height: 1.15,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      SizedBox(height: 12),
                      Text(
                        'Pilih mesin, bayar, lalu mesin siap dipakai.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white70, fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ),
              Expanded(
                flex: 4,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 25, 24, 15),
                  child: Column(
                    children: [
                      const Text(
                        'Selamat Datang!',
                        style: TextStyle(
                          color: textDark,
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        controller.terminal?.outlet.name ?? 'Dicuciin Laundry',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: textMuted),
                      ),
                      const Spacer(),
                      PrimaryButton(
                        label: 'Sentuh untuk Mulai',
                        icon: Icons.touch_app_rounded,
                        height: 60,
                        onPressed: controller.startOrder,
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Pilih Mesin ──────────────────────────────────────────────────────
class MachinesScreen extends StatefulWidget {
  const MachinesScreen({super.key});

  @override
  State<MachinesScreen> createState() => _MachinesScreenState();
}

class _MachinesScreenState extends State<MachinesScreen> {
  String? selectedDeviceId;

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    final machines = controller.machines;

    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const CenterHeader(title: 'Layanan Laundry'),
            Expanded(
              child: controller.machinesLoading
                  ? const Center(child: CircularProgressIndicator())
                  : machines.isEmpty
                  ? RefreshableEmpty(
                      message:
                          controller.error ?? 'Belum ada mesin di outlet ini.',
                      onRetry: controller.loadMachines,
                    )
                  : Column(
                      children: [
                        const Padding(
                          padding: EdgeInsets.fromLTRB(20, 18, 20, 2),
                          child: Text(
                            'Pilih Mesin yang tersedia',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: textDark,
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const Padding(
                          padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
                          child: Text(
                            'Pilih mesin yang siap digunakan untuk memulai laundry',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: textMuted, fontSize: 13),
                          ),
                        ),
                        Expanded(
                          child: GridView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
                            gridDelegate:
                                const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 2,
                                  crossAxisSpacing: 12,
                                  mainAxisSpacing: 12,
                                  childAspectRatio: 0.82,
                                ),
                            itemCount: machines.length,
                            itemBuilder: (_, index) {
                              final machine = machines[index];
                              return MachineCard(
                                machine: machine,
                                service: controller.serviceFor(machine),
                                selected: selectedDeviceId == machine.deviceId,
                                onTap: machine.bookable
                                    ? () => setState(
                                        () =>
                                            selectedDeviceId = machine.deviceId,
                                      )
                                    : null,
                              );
                            },
                          ),
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: TwoButtonBar(
        secondaryLabel: 'Kembali',
        onSecondary: controller.newOrder,
        primaryLabel: 'Lanjutkan Pesanan',
        onPrimary: selectedDeviceId == null
            ? null
            : () => controller.selectMachine(
                machines.firstWhere((m) => m.deviceId == selectedDeviceId),
              ),
      ),
    );
  }
}

class MachineCard extends StatelessWidget {
  const MachineCard({
    required this.machine,
    required this.service,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final Machine machine;
  final ServicePrice? service;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final disabled = onTap == null;
    return Opacity(
      opacity: disabled ? 0.55 : 1,
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: selected ? primary : line,
                width: selected ? 1.6 : 1,
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: selected ? primary : tintBlue,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        machine.isWasher
                            ? Icons.local_laundry_service_rounded
                            : Icons.dry_cleaning_rounded,
                        color: selected ? Colors.white : primary,
                        size: 34,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    machine.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: textDark,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 10),
                  _row('Kapasitas', _capacityLabel(service)),
                  const SizedBox(height: 5),
                  _row('Estimasi', _estimasiLabel(service)),
                  const SizedBox(height: 7),
                  Row(
                    children: [
                      const Text(
                        'Status',
                        style: TextStyle(color: textMuted, fontSize: 12),
                      ),
                      const Spacer(),
                      MachineStatusChip(status: machine.status),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Row(
      children: [
        Text(label, style: const TextStyle(color: textMuted, fontSize: 12)),
        const Spacer(),
        Text(
          value,
          style: const TextStyle(
            color: textDark,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class MachineStatusChip extends StatelessWidget {
  const MachineStatusChip({required this.status, super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg) = switch (status) {
      'AVAILABLE' => ('Tersedia', successBg, success),
      'RESERVED' => ('Dibooking', warningBg, warning),
      'IN_USE' => ('Dipakai', errorBg, errorColor),
      _ => ('Offline', surfaceAlt, textMuted),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: fg),
      ),
    );
  }
}

// ── Checkout (Order layanan) ─────────────────────────────────────────
class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  static const _banks = ['BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'CIMB'];

  final voucher = TextEditingController();
  final customerLookup = TextEditingController();
  String method = 'QRIS';
  bool vaExpanded = false;
  String selectedBank = 'BCA';

  @override
  void dispose() {
    voucher.dispose();
    customerLookup.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    final service = controller.selectedService;
    final machine = controller.selectedMachine;
    final price = service?.price ?? 0;
    final quote = controller.quote;

    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            CenterHeader(
              title: 'Order layanan',
              onBack: controller.backToMachines,
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                children: [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                machine?.name ?? 'Mesin',
                                style: const TextStyle(
                                  fontSize: 20,
                                  color: textDark,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            Container(
                              width: 52,
                              height: 52,
                              decoration: const BoxDecoration(
                                color: tintBlue,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                (machine?.isWasher ?? true)
                                    ? Icons.local_laundry_service_rounded
                                    : Icons.dry_cleaning_rounded,
                                color: primary,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        DetailRow(
                          label: 'No. Order',
                          value: controller.createdOrder?.orderNumber ?? '-',
                        ),
                        DetailRow(
                          label: 'Kategori Mesin',
                          value: (machine?.isWasher ?? true)
                              ? 'Washer'
                              : 'Dryer',
                        ),
                        DetailRow(
                          label: 'Kapasitas',
                          value: _capacityLabel(service),
                        ),
                        DetailRow(
                          label: 'Estimasi',
                          value: _estimasiLabel(service),
                        ),
                        DetailRow(label: 'Tanggal', value: _todayLabel()),
                        const SizedBox(height: 10),
                        const Divider(height: 1),
                        const SizedBox(height: 10),
                        DetailRow(
                          label: 'Harga Normal',
                          value: rupiah(quote?.basePrice ?? price),
                        ),
                        DetailRow(
                          label: 'Happy Hour Discount',
                          value: '- ${rupiah(quote?.happyHourDiscount ?? 0)}',
                        ),
                        DetailRow(
                          label: 'Voucher Discount',
                          value: '- ${rupiah(quote?.voucherDiscount ?? 0)}',
                        ),
                        DetailRow(
                          label: 'Estimasi Point',
                          value: '${quote?.pointsToEarn ?? 0} poin',
                        ),
                        const SizedBox(height: 10),
                        const DashedDivider(),
                        const SizedBox(height: 10),
                        DetailRow(
                          label: 'Total Bayar',
                          value: rupiah(quote?.finalAmount ?? price),
                          emphasized: true,
                        ),
                      ],
                    ),
                  ),
                  if (controller.error != null) ...[
                    const SizedBox(height: 14),
                    ErrorMessage(controller.error!),
                  ],
                  const SizedBox(height: 22),
                  const SectionTitle('Customer'),
                  const SizedBox(height: 10),
                  TextField(
                    controller: customerLookup,
                    decoration: inputDecoration(
                      'No HP / kode member untuk wallet',
                      Icons.person_outline_rounded,
                    ),
                  ),
                  const SizedBox(height: 22),
                  const SectionTitle('Voucher/Kode Promo'),
                  const SizedBox(height: 10),
                  TextField(
                    controller: voucher,
                    textCapitalization: TextCapitalization.characters,
                    decoration: inputDecoration(
                      'Masukkan voucher/kode promo',
                      Icons.confirmation_number_outlined,
                    ),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () =>
                        controller.loadQuote(voucherCode: voucher.text),
                    icon: const Icon(Icons.check_rounded),
                    label: const Text('Cek Promo'),
                  ),
                  const SizedBox(height: 22),
                  const SectionTitle('Metode Pembayaran'),
                  const SizedBox(height: 10),
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: line),
                    ),
                    child: Column(
                      children: [
                        PaymentMethodRow(
                          leading: const Text(
                            'QRIS',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: textDark,
                            ),
                          ),
                          label: 'QRIS',
                          active: method == 'QRIS',
                          onTap: () => setState(() {
                            method = 'QRIS';
                            vaExpanded = false;
                          }),
                        ),
                        const Divider(height: 1),
                        PaymentMethodRow(
                          leading: const Icon(
                            Icons.account_balance_wallet_outlined,
                            color: primary,
                          ),
                          label: 'Wallet',
                          active: method == 'WALLET',
                          onTap: () => setState(() {
                            method = 'WALLET';
                            vaExpanded = false;
                          }),
                        ),
                        const Divider(height: 1),
                        InkWell(
                          onTap: () => setState(() {
                            method = 'VA';
                            vaExpanded = !vaExpanded;
                          }),
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                            child: Row(
                              children: [
                                const Text(
                                  'virtual\naccount',
                                  style: TextStyle(
                                    fontSize: 9,
                                    color: textMuted,
                                    fontWeight: FontWeight.w700,
                                    height: 1.1,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                const Expanded(
                                  child: Text(
                                    'Virtual Account',
                                    style: TextStyle(
                                      fontSize: 15,
                                      color: textDark,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                Icon(
                                  vaExpanded
                                      ? Icons.keyboard_arrow_up_rounded
                                      : Icons.keyboard_arrow_down_rounded,
                                  color: textMuted,
                                ),
                              ],
                            ),
                          ),
                        ),
                        if (vaExpanded)
                          Column(
                            children: [
                              const Divider(height: 1),
                              for (final bank in _banks)
                                InkWell(
                                  onTap: () => setState(() {
                                    selectedBank = bank;
                                    method = 'VA';
                                  }),
                                  child: Padding(
                                    padding: const EdgeInsets.fromLTRB(
                                      16,
                                      11,
                                      16,
                                      11,
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            'Bank $bank',
                                            style: const TextStyle(
                                              fontSize: 14,
                                              color: textDark,
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                        ),
                                        Icon(
                                          selectedBank == bank
                                              ? Icons.radio_button_checked
                                              : Icons.radio_button_unchecked,
                                          color: selectedBank == bank
                                              ? primary
                                              : textMuted,
                                          size: 20,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: TwoButtonBar(
        secondaryLabel: 'Batalkan',
        onSecondary: controller.backToMachines,
        primaryLabel: 'Lanjut Bayar',
        loading: controller.loading,
        onPrimary: () {
          if (method == 'WALLET') {
            controller.submitWalletCheckout(
              customerLookup: customerLookup.text,
              voucherCode: voucher.text,
            );
            return;
          }
          controller.submitCheckout(
            promoCode: voucher.text,
            customerLookup: customerLookup.text,
            method: method,
            bank: method == 'VA' ? selectedBank : null,
          );
        },
      ),
    );
  }
}

// ── Pembayaran (QRIS / VA) ───────────────────────────────────────────
class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    final payment = controller.payment;
    final isQris = payment?.method == 'QRIS';

    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            CenterHeader(
              title: 'Pembayaran',
              onBack: controller.backToCheckout,
            ),
            Expanded(
              child: payment == null
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
                      children: [
                        AppCard(
                          child: Column(
                            children: [
                              DetailRow(
                                label: 'Total Pembayaran',
                                value: rupiah(payment.amount),
                                emphasized: true,
                              ),
                              if (payment.expiresAt != null) ...[
                                const SizedBox(height: 6),
                                CountdownRow(expiresAtIso: payment.expiresAt!),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        if (isQris) _qrisCard() else _vaCard(payment),
                        const SizedBox(height: 16),
                        const InstructionCard(
                          title: 'Petunjuk Pembayaran',
                          items: [
                            'Scan/masukkan kode pembayaran lewat m-banking atau e-wallet.',
                            'Pastikan nama merchant dan nominal sudah sesuai.',
                            'Status diperbarui otomatis setelah pembayaran berhasil.',
                          ],
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: payment == null
          ? null
          : TwoButtonBar(
              secondaryLabel: 'Ganti Metode',
              onSecondary: controller.backToCheckout,
              primaryLabel: 'Simulasikan Bayar',
              onPrimary: controller.simulatePayment,
            ),
    );
  }

  Widget _qrisCard() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: line),
      ),
      child: Column(
        children: [
          const Text(
            'QRIS',
            style: TextStyle(
              fontSize: 17,
              color: textDark,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          const Text(
            'QR Code Standar Pembayaran Nasional',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, color: textMuted),
          ),
          const SizedBox(height: 14),
          Container(
            width: 220,
            height: 220,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: Colors.white,
              border: Border.all(color: borderLight),
            ),
            child: const Icon(Icons.qr_code_2_rounded, size: 180),
          ),
          const SizedBox(height: 10),
          _waiting(),
        ],
      ),
    );
  }

  Widget _vaCard(KioskPayment payment) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: line),
      ),
      child: Column(
        children: [
          Text(
            'Virtual Account ${payment.bank ?? ''}'.trim(),
            style: const TextStyle(
              fontSize: 15,
              color: textDark,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: tintBlueAlt,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: borderLight),
            ),
            child: Text(
              payment.vaNumber ?? '-',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 22,
                color: primaryDark,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.5,
              ),
            ),
          ),
          const SizedBox(height: 12),
          _waiting(),
        ],
      ),
    );
  }

  Widget _waiting() {
    return const Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        SizedBox(width: 8),
        Text(
          'Menunggu pembayaran…',
          style: TextStyle(fontSize: 12, color: textMuted),
        ),
      ],
    );
  }
}

// ── Sukses (Detail Order) ────────────────────────────────────────────
class SuccessScreen extends StatelessWidget {
  const SuccessScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    final order = controller.createdOrder;
    final service = controller.selectedService;
    final machine = controller.selectedMachine;
    final payment = controller.payment;
    final methodLabel =
        controller.completedPaymentMethod ??
        (payment?.method == 'TRANSFER' ? 'Virtual Account' : 'QRIS');

    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const CenterHeader(title: 'Detail Order'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 26, 20, 24),
                children: [
                  Column(
                    children: [
                      Container(
                        width: 84,
                        height: 84,
                        decoration: const BoxDecoration(
                          color: success,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          color: Colors.white,
                          size: 50,
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Pembayaran Berhasil!',
                        style: TextStyle(
                          color: textDark,
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  AppCard(
                    child: Column(
                      children: [
                        DetailRow(
                          label: 'No. Order',
                          value: order?.orderNumber ?? '-',
                        ),
                        DetailRow(
                          label: 'Kategori Mesin',
                          value: (machine?.isWasher ?? true)
                              ? 'Washer'
                              : 'Dryer',
                        ),
                        DetailRow(
                          label: 'Kapasitas',
                          value: _capacityLabel(service),
                        ),
                        DetailRow(
                          label: 'Estimasi',
                          value: _estimasiLabel(service),
                        ),
                        DetailRow(label: 'Tanggal', value: _todayLabel()),
                        DetailRow(
                          label: 'Lokasi',
                          value: controller.terminal?.outlet.name ?? '-',
                        ),
                        DetailRow(label: 'Metode', value: methodLabel),
                        const SizedBox(height: 10),
                        const DashedDivider(),
                        const SizedBox(height: 10),
                        DetailRow(
                          label: 'Total Bayar',
                          value: rupiah(order?.total ?? payment?.amount ?? 0),
                          emphasized: true,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  AppCard(
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Selamat ${machine?.name ?? 'mesin'} sudah bisa digunakan!',
                            style: const TextStyle(
                              fontSize: 16,
                              color: textDark,
                              fontWeight: FontWeight.w700,
                              height: 1.3,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Container(
                          width: 52,
                          height: 52,
                          decoration: const BoxDecoration(
                            color: tintBlue,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.local_laundry_service_rounded,
                            color: primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: TwoButtonBar(
        secondaryLabel: 'Cetak',
        onSecondary: null,
        primaryLabel: 'Selesai',
        onPrimary: controller.newOrder,
      ),
    );
  }
}

// ── Komponen bersama ─────────────────────────────────────────────────

/// Header datar bergaya mobile (`_BlueHeader`): solid [primaryDark], judul di
/// tengah, tombol kembali opsional di kiri.
class CenterHeader extends StatelessWidget {
  const CenterHeader({required this.title, this.onBack, super.key});

  final String title;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: primaryDark,
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        children: [
          if (onBack != null)
            IconButton(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back, color: Colors.white),
            )
          else
            const SizedBox(width: 52),
          Expanded(
            child: Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 52),
        ],
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 18,
        color: textDark,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class DetailRow extends StatelessWidget {
  const DetailRow({
    required this.label,
    required this.value,
    this.emphasized = false,
    super.key,
  });

  final String label;
  final String value;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: emphasized ? textDark : textMuted,
              fontSize: emphasized ? 15 : 14,
              fontWeight: emphasized ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: emphasized ? success : textDark,
                fontSize: emphasized ? 17 : 14,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class DashedDivider extends StatelessWidget {
  const DashedDivider({super.key});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const dashWidth = 5.0;
        const dashSpace = 4.0;
        final count = (constraints.maxWidth / (dashWidth + dashSpace)).floor();
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(
            count,
            (_) => Container(width: dashWidth, height: 1, color: borderLight),
          ),
        );
      },
    );
  }
}

class CountdownRow extends StatefulWidget {
  const CountdownRow({required this.expiresAtIso, super.key});

  final String expiresAtIso;

  @override
  State<CountdownRow> createState() => _CountdownRowState();
}

class _CountdownRowState extends State<CountdownRow> {
  late DateTime _expiry;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _expiry =
        DateTime.tryParse(widget.expiresAtIso)?.toLocal() ?? DateTime.now();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final left = _expiry.difference(DateTime.now());
    final expired = left.isNegative;
    final mm = (expired ? 0 : left.inMinutes).toString().padLeft(2, '0');
    final ss = (expired ? 0 : left.inSeconds % 60).toString().padLeft(2, '0');
    return Row(
      children: [
        const Text(
          'Bayar dalam',
          style: TextStyle(color: textMuted, fontSize: 14),
        ),
        const Spacer(),
        Text(
          expired ? 'Kedaluwarsa' : '$mm:$ss',
          style: const TextStyle(
            color: errorColor,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class PaymentMethodRow extends StatelessWidget {
  const PaymentMethodRow({
    required this.leading,
    required this.label,
    required this.active,
    required this.onTap,
    super.key,
  });

  final Widget leading;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        color: active ? tintBlueAlt.withValues(alpha: 0.5) : Colors.transparent,
        child: Row(
          children: [
            SizedBox(width: 48, child: Center(child: leading)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 15,
                  color: textDark,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Icon(
              active
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: active ? primary : textMuted,
            ),
          ],
        ),
      ),
    );
  }
}

class InstructionCard extends StatelessWidget {
  const InstructionCard({required this.title, required this.items, super.key});

  final String title;
  final List<String> items;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: textDark,
            ),
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < items.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 9,
                    backgroundColor: tintBlue,
                    child: Text(
                      '${i + 1}',
                      style: const TextStyle(
                        fontSize: 10,
                        color: textMuted,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      items[i],
                      style: const TextStyle(
                        fontSize: 12,
                        color: textMuted,
                        height: 1.35,
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

/// Bilah bawah dua tombol (sekunder outline + primer filled) bergaya mobile.
class TwoButtonBar extends StatelessWidget {
  const TwoButtonBar({
    required this.secondaryLabel,
    required this.onSecondary,
    required this.primaryLabel,
    required this.onPrimary,
    this.loading = false,
    super.key,
  });

  final String secondaryLabel;
  final VoidCallback? onSecondary;
  final String primaryLabel;
  final VoidCallback? onPrimary;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
          child: Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 52,
                  child: OutlinedButton(
                    onPressed: onSecondary,
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: primary),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(
                      secondaryLabel,
                      style: const TextStyle(
                        color: primary,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: PrimaryButton(
                  label: primaryLabel,
                  height: 52,
                  loading: loading,
                  onPressed: onPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class RefreshableEmpty extends StatelessWidget {
  const RefreshableEmpty({
    required this.message,
    required this.onRetry,
    super.key,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.local_laundry_service_outlined,
              size: 58,
              color: textMutedLight,
            ),
            const SizedBox(height: 14),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: textMuted),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: 180,
              child: PrimaryButton(label: 'Coba Lagi', onPressed: onRetry),
            ),
          ],
        ),
      ),
    );
  }
}

/// Tombol aksi utama bergaya mobile (`AppPrimaryButton`).
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    required this.label,
    this.onPressed,
    this.icon,
    this.loading = false,
    this.height = 48,
    this.fontSize = 16,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final double height;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final child = loading
        ? const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              color: Colors.white,
              strokeWidth: 2.5,
            ),
          )
        : icon != null
        ? Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: fontSize + 6),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: fontSize,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          )
        : Text(
            label,
            style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w700),
          );

    return SizedBox(
      height: height,
      width: double.infinity,
      child: FilledButton(
        style: FilledButton.styleFrom(
          backgroundColor: primary,
          disabledBackgroundColor: borderLight,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        onPressed: loading ? null : onPressed,
        child: child,
      ),
    );
  }
}

/// Kartu putih datar ber-border, gaya mobile.
class AppCard extends StatelessWidget {
  const AppCard({
    required this.child,
    this.padding = const EdgeInsets.all(16),
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: line),
      ),
      child: child,
    );
  }
}

class Brand extends StatelessWidget {
  const Brand({this.compact = false, super.key});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final height = compact ? 24.0 : 32.0;
    return Image.asset(
      'assets/branding/logo-putih.png',
      height: height,
      fit: BoxFit.contain,
      errorBuilder: (_, _, _) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: compact ? 34 : 44,
            height: compact ? 34 : 44,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              Icons.water_drop_rounded,
              color: primary,
              size: compact ? 20 : 26,
            ),
          ),
          const SizedBox(width: 10),
          Text(
            'dicuciin',
            style: TextStyle(
              color: Colors.white,
              fontSize: compact ? 19 : 25,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class CircleIllustration extends StatelessWidget {
  const CircleIllustration({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 185,
      height: 185,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white24, width: 2),
      ),
      child: const Icon(
        Icons.local_laundry_service_rounded,
        size: 100,
        color: Colors.white,
      ),
    );
  }
}

class BlueHero extends StatelessWidget {
  const BlueHero({
    required this.icon,
    required this.title,
    required this.subtitle,
    super.key,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(28, 45, 28, 38),
      decoration: const BoxDecoration(
        color: primaryDark,
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(28),
          bottomRight: Radius.circular(28),
        ),
      ),
      child: Column(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(icon, color: primary, size: 43),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(subtitle, style: const TextStyle(color: Colors.white70)),
        ],
      ),
    );
  }
}

class ErrorMessage extends StatelessWidget {
  const ErrorMessage(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: errorBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: errorColor.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, color: errorColor, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(color: errorColor, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

InputDecoration inputDecoration(String label, IconData icon) {
  return InputDecoration(
    labelText: label,
    prefixIcon: Icon(icon),
    filled: true,
    fillColor: surfaceAlt,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide.none,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: line),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: primary, width: 1.5),
    ),
  );
}

String _capacityLabel(ServicePrice? service) {
  final kg = service?.capacityKg;
  if (kg == null) return '—';
  return '${kg.toStringAsFixed(kg.truncateToDouble() == kg ? 0 : 1)} KG';
}

String _estimasiLabel(ServicePrice? service) {
  final minutes = service?.estimateMinutes;
  if (minutes == null) return '—';
  return '$minutes Menit';
}

String _todayLabel() {
  const months = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  final now = DateTime.now();
  return '${now.day} ${months[now.month - 1]} ${now.year}';
}

String rupiah(num value) {
  final digits = value.round().toString();
  final parts = <String>[];
  for (var end = digits.length; end > 0; end -= 3) {
    final start = (end - 3).clamp(0, digits.length);
    parts.insert(0, digits.substring(start, end));
  }
  return 'Rp ${parts.join('.')}';
}
