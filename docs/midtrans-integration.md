# Integrasi Midtrans Di.Cuciin

Di.Cuciin memakai Midtrans Core API untuk QRIS dan Virtual Account. Credential
tidak boleh disimpan di Git; letakkan hanya di `laundry-be/.env` atau secret
manager deployment.

## Konfigurasi Sandbox

```env
PAYMENT_GATEWAY=midtrans
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_MERCHANT_ID=<merchant-id>
MIDTRANS_CLIENT_KEY=<sandbox-client-key>
MIDTRANS_SERVER_KEY=<sandbox-server-key>
MIDTRANS_SIGNATURE_KEY=<sandbox-signature-secret-key>
MIDTRANS_EXPIRY_MINUTES=15
```

Pastikan key diambil setelah memilih environment Sandbox pada Midtrans Dashboard.
Format prefix key tidak dijadikan penentu environment; tujuan API ditentukan oleh
`MIDTRANS_IS_PRODUCTION`.

### Server Key vs Signature Secret Key

Dashboard Midtrans versi baru (Settings → Access Keys) memisahkan dua key:

| Variabel | Ambil dari | Dipakai untuk |
|---|---|---|
| `MIDTRANS_SERVER_KEY` | Tabel **Server Keys** → generate key dengan izin **Core API: Write** | Autentikasi `POST /v2/charge` |
| `MIDTRANS_SIGNATURE_KEY` | **Signature Secret Key** | Verifikasi signature HTTP notification |

Jika `MIDTRANS_SIGNATURE_KEY` kosong, backend memakai `MIDTRANS_SERVER_KEY` untuk
verifikasi (perilaku dashboard lama, di mana keduanya sama). Jangan menekan
**Regenerate** pada Signature Secret Key tanpa memperbarui `.env` server — semua
notification akan ditolak (401).

Channel Core API (QRIS, VA) harus aktif untuk Merchant ID terkait. Bila charge
mengembalikan `402 Payment channel is not activated`, minta Midtrans
mengaktifkannya — toggle di halaman Snap Checkout tidak berlaku untuk Core API.

### Respons error ke aplikasi

Penolakan atau kegagalan koneksi ke Midtrans dibalas **422** dengan pesan untuk
pengguna (mis. "Metode pembayaran ini belum tersedia"), detail teknis dicatat di
log backend. Jangan memakai 5xx: Cloudflare mengganti body respons 5xx dari
origin dengan halaman errornya sendiri sehingga pesan tidak sampai ke aplikasi.

## HTTP Notification URL

Atur URL berikut di Midtrans Dashboard (sesuaikan domain API):

```text
https://api.dicuciin.com/api/v1/payments/midtrans/webhook
```

Endpoint harus dapat diakses publik melalui HTTPS, tidak memakai JWT, dan tidak
melakukan redirect. Autentisitas notification diverifikasi dengan formula resmi:

```text
SHA512(order_id + status_code + gross_amount + MIDTRANS_SIGNATURE_KEY)
```

Notification untuk transaksi yang tidak dikenal (mis. tombol **Test notification
URL** di dashboard) yang signature-nya sah dibalas 200 dan diabaikan.

Backend juga mencocokkan `gross_amount` dari Midtrans dengan nominal Payment di
database dan memproses callback secara idempoten.

## Channel yang didukung

- QRIS
- BCA Virtual Account
- BNI Virtual Account
- BRI Virtual Account
- Permata Virtual Account

Mandiri Bill, BSI, dan CIMB belum tersedia pada integrasi ini. Jangan tampilkan
channel tersebut sebelum mapping request, response, dan instruksi pembayarannya
ditambahkan.

## Menjalankan aplikasi

Tombol simulasi disembunyikan secara default. Untuk development dengan mock
gateway, aktifkan secara eksplisit:

```bash
flutter run --dart-define=ENABLE_PAYMENT_SIMULATION=true
```

Untuk build staging/production Midtrans, jangan kirim flag tersebut (atau beri
nilai `false`).

## Checklist sebelum Production

1. Rotasi key yang pernah terekspos dan gunakan Production key baru.
2. Aktifkan channel pembayaran pada Midtrans Production Dashboard.
3. Set `MIDTRANS_IS_PRODUCTION=true` dan credential Production di secret manager.
4. Pastikan Notification URL Production mendapat respons HTTP 200.
5. Uji transaksi nominal kecil dan cocokkan payment, order, poin, cashback, dan
   aktivasi mesin.
6. Pastikan endpoint `/payments/:paymentNumber/simulate` tetap ditolak pada
   `APP_ENV=production`.
