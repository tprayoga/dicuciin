import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:gal/gal.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

/// Batch 6 (R5): simpan gambar QRIS ke galeri agar bisa dibayar dari aplikasi
/// lain di HP yang sama (pilih gambar dari galeri di m-banking/e-wallet).
enum QrSaveResult { saved, openedInBrowser, permissionDenied, failed }

Future<QrSaveResult> saveQrImage(String imageUrl, {required String name}) async {
  final uri = Uri.tryParse(imageUrl);
  if (uri == null) return QrSaveResult.failed;
  if (kIsWeb) {
    // Web: tidak ada galeri — buka gambar (pengguna bisa menyimpan dari browser).
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    return ok ? QrSaveResult.openedInBrowser : QrSaveResult.failed;
  }
  try {
    final res = await http.get(uri).timeout(const Duration(seconds: 15));
    if (res.statusCode != 200 || res.bodyBytes.isEmpty) return QrSaveResult.failed;
    if (!await Gal.hasPermission()) {
      if (!await Gal.requestPermission()) return QrSaveResult.permissionDenied;
    }
    await Gal.putImageBytes(res.bodyBytes, name: name);
    return QrSaveResult.saved;
  } on GalException catch (e) {
    return e.type == GalExceptionType.permissionDenied ? QrSaveResult.permissionDenied : QrSaveResult.failed;
  } catch (_) {
    return QrSaveResult.failed;
  }
}
