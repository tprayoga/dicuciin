import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../auth/auth_controller.dart';
import 'customer_controller.dart';
import 'models/customer_models.dart';

class CreateOrderScreen extends StatefulWidget {
  const CreateOrderScreen({super.key});

  @override
  State<CreateOrderScreen> createState() => _CreateOrderScreenState();
}

class _CreateOrderScreenState extends State<CreateOrderScreen> {
  final _qtyController = TextEditingController(text: '1');
  final _promoController = TextEditingController();
  final _notesController = TextEditingController();

  List<OutletOption> _outlets = const [];
  List<ServicePriceOption> _services = const [];
  final List<_CartItem> _cartItems = [];

  String? _selectedOutletId;
  String? _selectedServiceId;
  bool _loadingInit = true;

  @override
  void initState() {
    super.initState();
    _loadOutlets();
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _promoController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final customer = context.watch<CustomerController>();
    final currency = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);

    final selectedService = _services
        .cast<ServicePriceOption?>()
        .firstWhere(
          (service) => service?.serviceId == _selectedServiceId,
          orElse: () => null,
        );

    final subtotal = _cartItems.fold<double>(0, (sum, item) => sum + item.subtotal);

    return Scaffold(
      appBar: AppBar(title: const Text('Buat Order Baru')),
      body: SafeArea(
        child: _loadingInit
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: _selectedOutletId,
                      decoration: const InputDecoration(
                        labelText: 'Pilih Outlet',
                        border: OutlineInputBorder(),
                      ),
                      items: _outlets
                          .map(
                            (outlet) => DropdownMenuItem<String>(
                              value: outlet.id,
                              child: Text(outlet.name),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() {
                          _selectedOutletId = value;
                          _selectedServiceId = null;
                          _services = const [];
                          _cartItems.clear();
                        });
                        _loadServices(value);
                      },
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: _selectedServiceId,
                      decoration: const InputDecoration(
                        labelText: 'Pilih Layanan',
                        border: OutlineInputBorder(),
                      ),
                      items: _services
                          .map(
                            (service) => DropdownMenuItem<String>(
                              value: service.serviceId,
                              child: Text(
                                '${service.serviceName} (${currency.format(service.price)}/${service.unit})',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: _services.isEmpty
                          ? null
                          : (value) {
                              setState(() => _selectedServiceId = value);
                            },
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _qtyController,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: const InputDecoration(
                              labelText: 'Jumlah',
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        FilledButton.icon(
                          onPressed: _addToCart,
                          icon: const Icon(Icons.add),
                          label: const Text('Tambah'),
                        ),
                      ],
                    ),
                    if (selectedService != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Harga layanan: ${currency.format(selectedService.price)} / ${selectedService.unit}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                    const SizedBox(height: 16),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Keranjang Layanan', style: Theme.of(context).textTheme.titleMedium),
                            const SizedBox(height: 8),
                            if (_cartItems.isEmpty)
                              const Text('Belum ada item. Tambahkan layanan dulu.')
                            else
                              ..._cartItems.asMap().entries.map(
                                    (entry) => ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(entry.value.serviceName),
                                      subtitle: Text(
                                        '${entry.value.quantity} ${entry.value.unit} x ${currency.format(entry.value.price)}',
                                      ),
                                      trailing: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(currency.format(entry.value.subtotal)),
                                          IconButton(
                                            onPressed: () {
                                              setState(() {
                                                _cartItems.removeAt(entry.key);
                                              });
                                            },
                                            icon: const Icon(Icons.delete_outline),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                            const Divider(),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Subtotal'),
                                Text(
                                  currency.format(subtotal),
                                  style: Theme.of(context).textTheme.titleSmall,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _promoController,
                      decoration: const InputDecoration(
                        labelText: 'Kode Promo (opsional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _notesController,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Catatan Order (opsional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    if (customer.errorMessage != null) ...[
                      const SizedBox(height: 12),
                      Text(customer.errorMessage!, style: const TextStyle(color: Colors.red)),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: customer.isSubmittingOrder ? null : _submit,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: customer.isSubmittingOrder
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Buat Order'),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Future<void> _loadOutlets() async {
    final auth = context.read<AuthController>();
    final accessToken = auth.accessToken;
    if (accessToken == null) return;

    final outlets = await context.read<CustomerController>().getOutlets(accessToken: accessToken);

    if (!mounted) return;
    setState(() {
      _outlets = outlets;
      _selectedOutletId = outlets.isNotEmpty ? outlets.first.id : null;
      _loadingInit = false;
    });

    if (_selectedOutletId != null) {
      await _loadServices(_selectedOutletId!);
    }
  }

  Future<void> _loadServices(String outletId) async {
    final auth = context.read<AuthController>();
    final accessToken = auth.accessToken;
    if (accessToken == null) return;

    final services = await context.read<CustomerController>().getServicePrices(
          accessToken: accessToken,
          outletId: outletId,
        );

    if (!mounted) return;
    setState(() {
      _services = services;
      _selectedServiceId = services.isNotEmpty ? services.first.serviceId : null;
    });
  }

  void _addToCart() {
    final serviceId = _selectedServiceId;
    if (serviceId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pilih layanan terlebih dahulu.')),
      );
      return;
    }

    final selectedService = _services
        .cast<ServicePriceOption?>()
        .firstWhere(
          (service) => service?.serviceId == serviceId,
          orElse: () => null,
        );

    if (selectedService == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Layanan tidak ditemukan.')),
      );
      return;
    }

    final quantity = double.tryParse(_qtyController.text.trim());
    if (quantity == null || quantity <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Jumlah harus lebih dari 0.')),
      );
      return;
    }

    final existingIndex = _cartItems.indexWhere((item) => item.serviceId == serviceId);

    setState(() {
      if (existingIndex >= 0) {
        final existing = _cartItems[existingIndex];
        _cartItems[existingIndex] = existing.copyWith(quantity: existing.quantity + quantity);
      } else {
        _cartItems.add(
          _CartItem(
            serviceId: selectedService.serviceId,
            serviceName: selectedService.serviceName,
            unit: selectedService.unit,
            price: selectedService.price,
            quantity: quantity,
          ),
        );
      }
    });
  }

  Future<void> _submit() async {
    final auth = context.read<AuthController>();
    final user = auth.user;
    final accessToken = auth.accessToken;

    if (user == null || accessToken == null) return;
    if (_selectedOutletId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pilih outlet terlebih dahulu.')),
      );
      return;
    }
    if (_cartItems.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Keranjang masih kosong.')),
      );
      return;
    }

    final createdOrder = await context.read<CustomerController>().createOrder(
          user: user,
          accessToken: accessToken,
          outletId: _selectedOutletId!,
          items: _cartItems
              .map(
                (item) => CreateOrderItemInput(
                  serviceId: item.serviceId,
                  quantity: item.quantity,
                ),
              )
              .toList(),
          promoCode: _promoController.text.trim().isEmpty
              ? null
              : _promoController.text.trim(),
          notes: _notesController.text.trim().isEmpty
              ? null
              : _notesController.text.trim(),
        );

    if (!mounted || createdOrder == null) return;

    final currency = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Order Berhasil Dibuat'),
        content: Text(
          'No. Order: ${createdOrder.orderNumber}\n'
          'Status: ${createdOrder.status}\n'
          'Total: ${currency.format(createdOrder.totalAmount)}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );

    if (!mounted) return;
    Navigator.of(context).pop();
  }
}

class _CartItem {
  _CartItem({
    required this.serviceId,
    required this.serviceName,
    required this.unit,
    required this.price,
    required this.quantity,
  });

  final String serviceId;
  final String serviceName;
  final String unit;
  final double price;
  final double quantity;

  double get subtotal => price * quantity;

  _CartItem copyWith({double? quantity}) {
    return _CartItem(
      serviceId: serviceId,
      serviceName: serviceName,
      unit: unit,
      price: price,
      quantity: quantity ?? this.quantity,
    );
  }
}
