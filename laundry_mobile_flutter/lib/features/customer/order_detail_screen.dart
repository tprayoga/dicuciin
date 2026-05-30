import 'dart:async';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../auth/auth_controller.dart';
import 'customer_controller.dart';
import 'models/customer_models.dart';

class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  final ImagePicker _picker = ImagePicker();
  Timer? _autoRefreshTimer;
  OrderDetail? _detail;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadDetail();
  }

  @override
  void dispose() {
    _autoRefreshTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);
    final date = DateFormat('dd MMM yyyy, HH:mm', 'id_ID');

    return Scaffold(
      appBar: AppBar(title: const Text('Detail Order')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : _detail == null
                    ? const Center(child: Text('Order tidak ditemukan'))
                    : RefreshIndicator(
                        onRefresh: _loadDetail,
                        child: ListView(
                          padding: const EdgeInsets.all(16),
                          children: [
                            Card(
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '#${_detail!.orderNumber}',
                                      style: Theme.of(context).textTheme.titleLarge,
                                    ),
                                    const SizedBox(height: 4),
                                    Text('Status: ${_detail!.status}'),
                                    Text('Tanggal: ${date.format(_detail!.orderDate)}'),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Card(
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.end,
                                      children: [
                                        if (_canCancel(_detail!.status))
                                          OutlinedButton.icon(
                                            onPressed: context.watch<CustomerController>().isCancellingOrder
                                                ? null
                                                : _confirmCancelOrder,
                                            icon: context.watch<CustomerController>().isCancellingOrder
                                                ? const SizedBox(
                                                    height: 14,
                                                    width: 14,
                                                    child: CircularProgressIndicator(strokeWidth: 2),
                                                  )
                                                : const Icon(Icons.cancel_outlined),
                                            label: const Text('Batalkan Order'),
                                          ),
                                      ],
                                    ),
                                    if (_canCancel(_detail!.status)) const SizedBox(height: 8),
                                    Align(
                                      alignment: Alignment.centerRight,
                                      child: FilledButton.icon(
                                        onPressed: context.watch<CustomerController>().isUploadingPaymentProof
                                            ? null
                                            : _uploadPaymentProof,
                                        icon: context.watch<CustomerController>().isUploadingPaymentProof
                                            ? const SizedBox(
                                                height: 16,
                                                width: 16,
                                                child: CircularProgressIndicator(strokeWidth: 2),
                                              )
                                            : const Icon(Icons.upload_file),
                                        label: const Text('Upload Bukti Bayar'),
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    Text('Item Layanan', style: Theme.of(context).textTheme.titleMedium),
                                    const SizedBox(height: 8),
                                    ..._detail!.items.map(
                                      (item) => ListTile(
                                        contentPadding: EdgeInsets.zero,
                                        title: Text(item.serviceName),
                                        subtitle: Text('${item.quantity} ${item.unit} x ${money.format(item.pricePerUnit)}'),
                                        trailing: Text(money.format(item.subtotal)),
                                      ),
                                    ),
                                    const Divider(),
                                    _PriceRow(label: 'Subtotal', value: money.format(_detail!.subtotal)),
                                    _PriceRow(label: 'Diskon', value: '-${money.format(_detail!.discountAmount)}'),
                                    _PriceRow(label: 'Delivery', value: money.format(_detail!.deliveryFee)),
                                    const SizedBox(height: 6),
                                    _PriceRow(
                                      label: 'Total',
                                      value: money.format(_detail!.totalAmount),
                                      isStrong: true,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Card(
                              child: Padding(
                                padding: const EdgeInsets.all(16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Timeline Status', style: Theme.of(context).textTheme.titleMedium),
                                    const SizedBox(height: 8),
                                    if (_detail!.statusLogs.isEmpty)
                                      const Text('Belum ada status log')
                                    else
                                      ..._detail!.statusLogs.map(
                                        (log) => ListTile(
                                          contentPadding: EdgeInsets.zero,
                                          leading: const Icon(Icons.check_circle_outline),
                                          title: Text(log.status),
                                          subtitle: Text(
                                            '${date.format(log.createdAt)}${log.notes == null ? '' : '\n${log.notes}'}',
                                          ),
                                        ),
                                      ),
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

  Future<void> _loadDetail() async {
    final auth = context.read<AuthController>();
    final accessToken = auth.accessToken;

    if (accessToken == null) {
      setState(() {
        _loading = false;
        _error = 'Sesi tidak tersedia.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final detail = await context.read<CustomerController>().getOrderDetail(
        accessToken: accessToken,
        orderId: widget.orderId,
      );
      if (detail == null) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error = context.read<CustomerController>().errorMessage ??
              'Gagal memuat detail order.';
        });
        return;
      }
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _loading = false;
      });
      _syncAutoRefresh(detail.status);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _uploadPaymentProof() async {
    final auth = context.read<AuthController>();
    final customerController = context.read<CustomerController>();
    final accessToken = auth.accessToken;
    if (accessToken == null) return;

    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 1920,
    );
    if (file == null) return;
    if (!mounted) return;

    final result = await customerController.uploadPaymentProof(
          accessToken: accessToken,
          orderId: widget.orderId,
          imagePath: file.path,
        );

    if (!mounted || result == null) return;

    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Upload Berhasil'),
        content: Text('File: ${result.filename}\\nURL: ${result.url}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmCancelOrder() async {
    final authController = context.read<AuthController>();
    final customerController = context.read<CustomerController>();
    final reasonController = TextEditingController();
    final shouldCancel = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Batalkan Order'),
        content: TextField(
          controller: reasonController,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Masukkan alasan pembatalan',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Batal'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Konfirmasi'),
          ),
        ],
      ),
    );

    final reason = reasonController.text.trim();
    reasonController.dispose();

    if (shouldCancel != true) return;
    if (reason.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Alasan pembatalan wajib diisi.')),
      );
      return;
    }

    final accessToken = authController.accessToken;
    if (accessToken == null) return;

    final detail = await customerController.cancelOrder(
          accessToken: accessToken,
          orderId: widget.orderId,
          cancelReason: reason,
        );

    if (!mounted || detail == null) return;

    setState(() {
      _detail = detail;
    });
    _syncAutoRefresh(detail.status);

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Order berhasil dibatalkan.')),
    );
  }

  bool _canCancel(String status) {
    const blocked = {'COMPLETED', 'CANCELLED', 'REFUNDED'};
    return !blocked.contains(status);
  }

  void _syncAutoRefresh(String status) {
    const finalStatuses = {'COMPLETED', 'CANCELLED', 'REFUNDED'};
    if (finalStatuses.contains(status)) {
      _autoRefreshTimer?.cancel();
      _autoRefreshTimer = null;
      return;
    }

    if (_autoRefreshTimer != null) return;

    _autoRefreshTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (!mounted) return;
      _loadDetail();
    });
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({required this.label, required this.value, this.isStrong = false});

  final String label;
  final String value;
  final bool isStrong;

  @override
  Widget build(BuildContext context) {
    final textStyle = isStrong
        ? Theme.of(context).textTheme.titleMedium
        : Theme.of(context).textTheme.bodyMedium;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: textStyle),
          Text(value, style: textStyle),
        ],
      ),
    );
  }
}
