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
MIDTRANS_EXPIRY_MINUTES=15
```

Pastikan key diambil setelah memilih environment Sandbox pada Midtrans Dashboard.
Format prefix key tidak dijadikan penentu environment; tujuan API ditentukan oleh
`MIDTRANS_IS_PRODUCTION`.

## HTTP Notification URL

Atur URL berikut di Midtrans Dashboard (sesuaikan domain API):

```text
https://api.dicuciin.com/api/v1/payments/midtrans/webhook
```

Endpoint harus dapat diakses publik melalui HTTPS, tidak memakai JWT, dan tidak
melakukan redirect. Autentisitas notification diverifikasi dengan formula resmi:

```text
SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
```

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
