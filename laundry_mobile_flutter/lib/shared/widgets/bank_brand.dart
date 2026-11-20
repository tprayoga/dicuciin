import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// Batch 6 (R4): penanda merek bank VA yang konsisten di semua halaman.
/// Sebelumnya "Bank Permata" jatuh ke cabang default dan tampil "CIMBNIAGA".
class BankBrand {
  const BankBrand._(this.code, this.label, this.color, this.fontSize);

  final String code;
  final String label;
  final Color color;
  final double fontSize;

  static const bca = BankBrand._('BCA', 'BCA', PaymentBrandColors.bca, 24);
  static const bri = BankBrand._('BRI', 'BRI', PaymentBrandColors.bri, 24);
  static const bni = BankBrand._('BNI', 'BNI', PaymentBrandColors.bni, 24);
  static const permata = BankBrand._('PERMATA', 'PermataBank', PaymentBrandColors.permata, 15);
  static const mandiri = BankBrand._('MANDIRI', 'mandiri', PaymentBrandColors.mandiri, 17);
  static const cimb = BankBrand._('CIMB', 'CIMB NIAGA', PaymentBrandColors.cimb, 12);

  /// Dari "Bank BCA", "bca", "PERMATA", dst. Tidak dikenal → null.
  static BankBrand? of(String bank) {
    final b = bank.toUpperCase();
    if (b.contains('BCA')) return bca;
    if (b.contains('BRI')) return bri;
    if (b.contains('BNI')) return bni;
    if (b.contains('PERMATA')) return permata;
    if (b.contains('MANDIRI')) return mandiri;
    if (b.contains('CIMB')) return cimb;
    return null;
  }
}

class BankBrandMark extends StatelessWidget {
  const BankBrandMark({super.key, required this.bank, this.scale = 1});

  final String bank;
  final double scale;

  @override
  Widget build(BuildContext context) {
    final brand = BankBrand.of(bank);
    if (brand == null) {
      return Icon(Icons.account_balance, color: AppColors.textMutedLight, size: 22 * scale);
    }
    return Text(
      brand.label,
      maxLines: 1,
      overflow: TextOverflow.fade,
      softWrap: false,
      style: TextStyle(
        fontWeight: FontWeight.w800,
        color: brand.color,
        fontSize: brand.fontSize * scale,
        letterSpacing: brand.code == 'PERMATA' ? 0 : 0.2,
      ),
    );
  }
}
