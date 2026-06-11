import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'kiosk_controller.dart';
import 'models.dart';

const primary = Color(0xFF1A73E8);
const primaryDark = Color(0xFF0B4A93);
const accent = Color(0xFF29CC5F);
const background = Color(0xFFF2F5FA);
const textDark = Color(0xFF131722);
const textMuted = Color(0xFF667A9E);

class KioskApp extends StatelessWidget {
  const KioskApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Dicuciin Kiosk',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primary,
          primary: primary,
          secondary: accent,
        ),
        scaffoldBackgroundColor: background,
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
      KioskStage.ordering => const OrderScreen(),
      KioskStage.review => const ReviewScreen(),
      KioskStage.success => const SuccessScreen(),
    };
  }
}

class InitializingScreen extends StatelessWidget {
  const InitializingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: Colors.white,
      child: Center(
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
    return ColoredBox(
      color: Colors.white,
      child: SafeArea(
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
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Buat kode 6 digit dari Admin Panel pada Kelola Outlet → Kelola Kiosk.',
                      style: TextStyle(color: textMuted),
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
                        fontWeight: FontWeight.w900,
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
                    SizedBox(
                      height: 56,
                      child: FilledButton(
                        onPressed: controller.loading
                            ? null
                            : () => controller.enroll(code.text),
                        child: controller.loading
                            ? const CircularProgressIndicator(
                                color: Colors.white,
                              )
                            : const Text(
                                'Hubungkan Perangkat',
                                style: TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w700,
                                ),
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
    );
  }
}

class ClosedScreen extends StatelessWidget {
  const ClosedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    return ColoredBox(
      color: Colors.white,
      child: SafeArea(
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
                  color: Color(0xFFE8F1FF),
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
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
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
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [primaryDark, primary],
                    ),
                    borderRadius: BorderRadius.vertical(
                      bottom: Radius.circular(42),
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
                          fontSize: 34,
                          height: 1.12,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      SizedBox(height: 13),
                      Text(
                        'Pilih layanan, cek pesanan, lalu bayar di kasir.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Color(0xFFDCEBFF),
                          fontSize: 14,
                        ),
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
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        controller.terminal?.outlet.name ?? 'Dicuciin Laundry',
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: textMuted),
                      ),
                      const Spacer(),
                      SizedBox(
                        width: double.infinity,
                        height: 62,
                        child: FilledButton.icon(
                          onPressed: controller.startOrder,
                          icon: const Icon(Icons.touch_app_rounded, size: 26),
                          label: const Text(
                            'Sentuh untuk Mulai',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
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

class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key});

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends State<OrderScreen> {
  String selectedCategory = 'Semua';

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    final categories = <String>{
      'Semua',
      ...controller.services.map((service) => service.category),
    }.toList();
    if (!categories.contains(selectedCategory)) selectedCategory = 'Semua';
    final services = selectedCategory == 'Semua'
        ? controller.services
        : controller.services
              .where((service) => service.category == selectedCategory)
              .toList();

    return PageShell(
      header: MenuHeader(
        outlet: controller.terminal?.outlet.name ?? 'Dicuciin Laundry',
        onHome: controller.newOrder,
      ),
      bottom: controller.cart.isEmpty
          ? null
          : CartBar(
              count: controller.itemCount,
              total: controller.total,
              onTap: controller.reviewOrder,
            ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 20, 20, 5),
            child: Text(
              'Mau cuci apa\nhari ini?',
              style: TextStyle(
                color: textDark,
                fontSize: 27,
                height: 1.12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          SizedBox(
            height: 58,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
              scrollDirection: Axis.horizontal,
              itemCount: categories.length,
              separatorBuilder: (context, index) => const SizedBox(width: 8),
              itemBuilder: (_, index) {
                final category = categories[index];
                final selected = selectedCategory == category;
                return ChoiceChip(
                  label: Text(category),
                  selected: selected,
                  showCheckmark: false,
                  selectedColor: primary,
                  backgroundColor: Colors.white,
                  labelStyle: TextStyle(
                    color: selected ? Colors.white : textMuted,
                    fontWeight: FontWeight.w700,
                  ),
                  onSelected: (_) => setState(() {
                    selectedCategory = category;
                  }),
                );
              },
            ),
          ),
          Expanded(
            child: controller.loading
                ? const Center(child: CircularProgressIndicator())
                : services.isEmpty
                ? const EmptyState(
                    icon: Icons.local_laundry_service_outlined,
                    title: 'Layanan belum tersedia',
                    message: 'Pilih kategori lain atau hubungi petugas.',
                  )
                : GridView.builder(
                    padding: const EdgeInsets.fromLTRB(20, 7, 20, 24),
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          childAspectRatio: 0.76,
                        ),
                    itemCount: services.length,
                    itemBuilder: (_, index) {
                      final service = services[index];
                      return ServiceCard(
                        service: service,
                        quantity:
                            controller.cart[service.serviceId]?.quantity ?? 0,
                        onAdd: () => controller.add(service),
                        onRemove: () => controller.decrease(service),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class ServiceCard extends StatelessWidget {
  const ServiceCard({
    required this.service,
    required this.quantity,
    required this.onAdd,
    required this.onRemove,
    super.key,
  });

  final ServicePrice service;
  final int quantity;
  final VoidCallback onAdd;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final color = serviceColor(service);
    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: InkWell(
        onTap: onAdd,
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Stack(
                    children: [
                      Center(
                        child: Icon(
                          serviceIcon(service),
                          size: 50,
                          color: color,
                        ),
                      ),
                      if (quantity > 0)
                        Positioned(
                          top: 7,
                          right: 7,
                          child: CircleAvatar(
                            radius: 14,
                            backgroundColor: primary,
                            child: Text(
                              '$quantity',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                service.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: textDark,
                  fontSize: 14,
                  height: 1.15,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${rupiah(service.price)} / ${service.unit}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: primary,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 9),
              if (quantity == 0)
                SizedBox(
                  width: double.infinity,
                  height: 36,
                  child: FilledButton.icon(
                    onPressed: onAdd,
                    icon: const Icon(Icons.add_rounded, size: 18),
                    label: const Text(
                      'Tambah',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  ),
                )
              else
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    QuantityButton(icon: Icons.remove_rounded, onTap: onRemove),
                    Text(
                      '$quantity',
                      style: const TextStyle(
                        color: textDark,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    QuantityButton(icon: Icons.add_rounded, onTap: onAdd),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class ReviewScreen extends StatelessWidget {
  const ReviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    return PageShell(
      header: Header(
        title: 'Cek Pesanan',
        subtitle: 'Pastikan layanan yang dipilih sudah benar',
        leading: IconButton(
          onPressed: controller.backToMenu,
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
        ),
      ),
      bottom: BottomAction(
        loading: controller.loading,
        onPressed: controller.cart.isEmpty ? null : controller.submitOrder,
      ),
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const GuestCard(),
          if (controller.error != null) ...[
            const SizedBox(height: 13),
            ErrorMessage(controller.error!),
          ],
          const SizedBox(height: 20),
          const Text(
            'Detail Layanan',
            style: TextStyle(
              color: textDark,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 11),
          for (final line in controller.cart.values)
            ReviewLine(line: line, controller: controller),
          const SizedBox(height: 8),
          Card(
            elevation: 0,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  SummaryRow(
                    label: 'Jumlah item',
                    value: '${controller.itemCount} layanan',
                  ),
                  const Divider(height: 25),
                  SummaryRow(
                    label: 'Total',
                    value: rupiah(controller.total),
                    emphasized: true,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ReviewLine extends StatelessWidget {
  const ReviewLine({required this.line, required this.controller, super.key});

  final CartLine line;
  final KioskController controller;

  @override
  Widget build(BuildContext context) {
    final color = serviceColor(line.service);
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 11),
      child: Padding(
        padding: const EdgeInsets.all(13),
        child: Row(
          children: [
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(13),
              ),
              child: Icon(serviceIcon(line.service), color: color),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    line.service.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: textDark,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    rupiah(line.subtotal),
                    style: const TextStyle(
                      color: primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            QuantityButton(
              icon: Icons.remove_rounded,
              onTap: () => controller.decrease(line.service),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text(
                '${line.quantity}',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
            QuantityButton(
              icon: Icons.add_rounded,
              onTap: () => controller.add(line.service),
            ),
          ],
        ),
      ),
    );
  }
}

class SuccessScreen extends StatelessWidget {
  const SuccessScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<KioskController>();
    final order = controller.createdOrder;
    return ColoredBox(
      color: Colors.white,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(26, 38, 26, 24),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 116,
                height: 116,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.14),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_circle_rounded,
                  color: accent,
                  size: 86,
                ),
              ),
              const SizedBox(height: 27),
              const Text(
                'Pesanan Berhasil!',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: textDark,
                  fontSize: 29,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Tunjukkan nomor pesanan ini kepada petugas dan lanjutkan pembayaran di kasir.',
                textAlign: TextAlign.center,
                style: TextStyle(color: textMuted, fontSize: 15, height: 1.45),
              ),
              const SizedBox(height: 27),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(21),
                decoration: BoxDecoration(
                  color: const Color(0xFFE8F1FF),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  children: [
                    const Text(
                      'NOMOR PESANAN',
                      style: TextStyle(
                        color: textMuted,
                        fontSize: 12,
                        letterSpacing: 1.1,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      order?.orderNumber ?? '-',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: primaryDark,
                        fontSize: 27,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 13),
                    Text(
                      rupiah(order?.total ?? 0),
                      style: const TextStyle(
                        color: textDark,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 60,
                child: FilledButton(
                  onPressed: controller.newOrder,
                  child: const Text(
                    'Selesai',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
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

class PageShell extends StatelessWidget {
  const PageShell({
    required this.header,
    required this.child,
    this.bottom,
    super.key,
  });

  final Widget header;
  final Widget child;
  final Widget? bottom;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            header,
            Expanded(child: child),
          ],
        ),
      ),
      bottomNavigationBar: bottom,
    );
  }
}

class Header extends StatelessWidget {
  const Header({
    required this.title,
    required this.subtitle,
    this.leading,
    super.key,
  });

  final String title;
  final String subtitle;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 17, 20, 20),
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [primaryDark, primary]),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(26)),
      ),
      child: Row(
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 5)],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: Color(0xFFDCEBFF),
                    fontSize: 12,
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

class MenuHeader extends StatelessWidget {
  const MenuHeader({required this.outlet, required this.onHome, super.key});

  final String outlet;
  final VoidCallback onHome;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 13, 14, 14),
      decoration: const BoxDecoration(
        color: primary,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(24)),
      ),
      child: Row(
        children: [
          const Brand(compact: true),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              outlet,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFFDCEBFF), fontSize: 12),
            ),
          ),
          IconButton(
            onPressed: onHome,
            icon: const Icon(Icons.home_outlined, color: Colors.white),
          ),
        ],
      ),
    );
  }
}

class CartBar extends StatelessWidget {
  const CartBar({
    required this.count,
    required this.total,
    required this.onTap,
    super.key,
  });

  final int count;
  final double total;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(16, 11, 16, 13),
        child: FilledButton(
          onPressed: onTap,
          style: FilledButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(17),
            ),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 17,
                backgroundColor: Colors.white24,
                child: Text(
                  '$count',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  rupiah(total),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const Text(
                'Lihat Pesanan',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

class BottomAction extends StatelessWidget {
  const BottomAction({
    required this.loading,
    required this.onPressed,
    super.key,
  });

  final bool loading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(20, 13, 20, 18),
        child: SizedBox(
          height: 58,
          child: FilledButton(
            onPressed: loading ? null : onPressed,
            child: loading
                ? const CircularProgressIndicator(color: Colors.white)
                : const Text(
                    'Buat Pesanan',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                  ),
          ),
        ),
      ),
    );
  }
}

class GuestCard extends StatelessWidget {
  const GuestCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: const Color(0xFFE8F1FF),
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Row(
        children: [
          CircleAvatar(
            backgroundColor: Colors.white,
            foregroundColor: primary,
            child: Icon(Icons.person_outline_rounded),
          ),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Pesanan Tamu',
                  style: TextStyle(
                    color: textDark,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  'Member dapat dihubungkan oleh petugas di kasir.',
                  style: TextStyle(color: textMuted, fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class SummaryRow extends StatelessWidget {
  const SummaryRow({
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
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            color: emphasized ? textDark : textMuted,
            fontSize: emphasized ? 17 : 14,
            fontWeight: emphasized ? FontWeight.w800 : FontWeight.w500,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            color: emphasized ? primary : textDark,
            fontSize: emphasized ? 20 : 14,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

class QuantityButton extends StatelessWidget {
  const QuantityButton({required this.icon, required this.onTap, super.key});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFE8F1FF),
      borderRadius: BorderRadius.circular(9),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(9),
        child: SizedBox(
          width: 32,
          height: 32,
          child: Icon(icon, color: primary, size: 19),
        ),
      ),
    );
  }
}

class Brand extends StatelessWidget {
  const Brand({this.compact = false, super.key});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final size = compact ? 38.0 : 46.0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(13),
          ),
          child: Icon(
            Icons.water_drop_rounded,
            color: primary,
            size: size * 0.58,
          ),
        ),
        const SizedBox(width: 10),
        Text(
          compact ? 'dicuciin' : 'dicuciin',
          style: TextStyle(
            color: Colors.white,
            fontSize: compact ? 19 : 25,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
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
        gradient: LinearGradient(colors: [primary, primaryDark]),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(36)),
      ),
      child: Column(
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(21),
            ),
            child: Icon(icon, color: primary, size: 43),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 29,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(subtitle, style: const TextStyle(color: Color(0xFFDCEBFF))),
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
        color: const Color(0xFFFFEBEE),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        message,
        style: const TextStyle(color: Color(0xFFB71C1C), fontSize: 12),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    required this.icon,
    required this.title,
    required this.message,
    super.key,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 58, color: textMuted),
            const SizedBox(height: 13),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: textDark,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

InputDecoration inputDecoration(String label, IconData icon) {
  return InputDecoration(
    labelText: label,
    prefixIcon: Icon(icon),
    filled: true,
    fillColor: background,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(15),
      borderSide: BorderSide.none,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(15),
      borderSide: const BorderSide(color: Color(0xFFDCE3ED)),
    ),
  );
}

IconData serviceIcon(ServicePrice service) {
  final value = '${service.category} ${service.name}'.toLowerCase();
  if (value.contains('setrika') || value.contains('iron')) {
    return Icons.iron_rounded;
  }
  if (value.contains('sepatu') || value.contains('shoe')) {
    return Icons.hiking_rounded;
  }
  if (value.contains('karpet') || value.contains('bedcover')) {
    return Icons.bed_rounded;
  }
  if (value.contains('dry') || value.contains('kering')) {
    return Icons.dry_cleaning_rounded;
  }
  return Icons.local_laundry_service_rounded;
}

Color serviceColor(ServicePrice service) {
  final value = '${service.category} ${service.name}'.toLowerCase();
  if (value.contains('setrika')) return const Color(0xFFF59E0B);
  if (value.contains('sepatu')) return const Color(0xFF8B5CF6);
  if (value.contains('karpet')) return const Color(0xFFEC4899);
  if (value.contains('dry') || value.contains('kering')) {
    return const Color(0xFF06A6A6);
  }
  return primary;
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
