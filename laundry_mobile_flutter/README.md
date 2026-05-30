# laundry_mobile_flutter

Flutter mobile app untuk customer Dicuciin.

## Jalankan Lokal

```bash
cd laundry_mobile_flutter
flutter pub get
flutter run --dart-define API_BASE_URL=http://10.0.2.2:3000/api/v1
```

Catatan API Base:

- Android emulator: `http://10.0.2.2:3000/api/v1`
- iOS simulator: `http://localhost:3000/api/v1`
- Device fisik: pakai IP lokal mesin backend, contoh `http://192.168.1.10:3000/api/v1`

## Build

```bash
flutter build apk --dart-define API_BASE_URL=https://api.dicuciin.com/api/v1
```

## Fitur MVP

- Login customer (email/phone + password)
- Register customer (otomatis login setelah sukses)
- Edit profil customer (nama/email/phone)
- Restore session (secure storage + refresh token)
- Profil customer + member code
- Saldo wallet + transaksi terakhir
- Order customer terbaru
- Buat order baru dengan multi-item cart
- Detail order + timeline status + cancel order
- Auto refresh status order setiap 20 detik di halaman detail
- Upload bukti pembayaran dari galeri
- Promo aktif
- Logout
