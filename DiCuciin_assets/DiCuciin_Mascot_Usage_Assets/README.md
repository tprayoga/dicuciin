# Di.Cuciin Mascot Usage Assets

Asset pack ini dibuat mengikuti struktur kebutuhan dari file `Di.Cuciin Mascot Usage.pdf`:
- Registrasi dan permission flow
- Homepage, outlet, promo, history, wallet
- Scan QR, pilihan mesin, pembayaran
- Notifikasi, feedback, error state
- Kiosk opportunity
- Emotion Pack, Action Pack, Notification Pack

Format:
- PNG transparan per asset
- Sprite sheet sumber disimpan di `00_source_sprite_sheets`
- Mapping asset tersedia di `asset_manifest.json`

Catatan penggunaan:
- Gunakan maskot hanya sebagai pendukung konteks, bukan dekorasi acak.
- Untuk UI mobile, gunakan ukuran kecil/sedang agar tidak menutupi CTA utama.
- Untuk kiosk idle screen, maskot boleh lebih besar untuk menarik perhatian customer.
- Untuk error state, gunakan pose yang menenangkan, bukan terlalu panik.

Rekomendasi struktur Flutter:
```yaml
flutter:
  assets:
    - assets/mascot/
```

Contoh pemakaian:
```dart
Image.asset('assets/mascot/05_app_flow_registration_permissions/01_registration_welcome_waving.png')
```
