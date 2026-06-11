# Dicuciin Kiosk Flutter

Aplikasi kiosk self-service Dicuciin berbasis Flutter dengan tampilan portrait
9:16. Alur pelanggan dibuat seperti kiosk restoran cepat saji: sentuh untuk
mulai, pilih layanan, cek keranjang, buat pesanan, lalu bayar di kasir.

## Menjalankan

Android emulator:

```bash
flutter run --dart-define API_BASE_URL=http://10.0.2.2:3000/api/v1
```

Web/desktop lokal:

```bash
flutter run -d chrome --dart-define API_BASE_URL=http://localhost:3000/api/v1
```

## Flow MVP

1. Admin membuat perangkat kiosk dari menu Kelola Outlet.
2. Admin membuat kode enrollment 6 digit yang berlaku selama 10 menit.
3. Kode dimasukkan sekali pada perangkat kiosk.
4. Device token disimpan melalui secure storage dan dipulihkan otomatis setiap
   perangkat menyala.
5. Kiosk mengikuti jadwal operasional dan mengirim heartbeat berkala.
6. Enrollment tetap tersimpan saat kiosk mati; runtime session dibuat ulang
   ketika perangkat kembali menyala.
4. Pelanggan memilih layanan outlet dan jumlah item.
5. Pelanggan mengecek keranjang dan membuat order dengan
   `sourcePlatform: KIOSK`.
6. Nomor pesanan ditampilkan untuk dilanjutkan ke kasir.

Pembayaran kiosk, printer struk, timbangan, dan scanner QR menjadi tahap integrasi berikutnya.
