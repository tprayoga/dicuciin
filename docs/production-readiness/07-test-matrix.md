# 07 — Test Matrix

Label jenis uji: **[MOCK]** otomatis dengan mock · **[SANDBOX]** Midtrans sandbox · **[DEVICE]** perangkat fisik · **[PROD]** transaksi production.

## Fase 0 — Otorisasi (TESTED, [MOCK])

File: `laundry-be/src/common/auth/authorization.http.spec.ts` (HTTP, controller + RolesGuard asli) dan `phase0-service-rules.spec.ts` (service).

| Skenario | Aktor | Harapan | Hasil |
|---|---|---|---|
| PATCH /users/:id (termasuk role SUPER_ADMIN) | customer, kasir | 403 | ✅ |
| PATCH /users/:id | owner, super admin | 200 | ✅ |
| PATCH /users/me dengan role/password/avatar URL luar | customer | 400 | ✅ |
| Owner memberi/mengubah/membuat SUPER_ADMIN | owner | 403 | ✅ |
| GET /customers, /orders, ringkasan | customer | 403 | ✅ |
| 9 endpoint data milik customer B | customer A | 403 | ✅ |
| 6 endpoint data milik sendiri | customer A | 200 | ✅ |
| Laporan keuangan | kasir | 403 | ✅ |
| PATCH /orders/:id/status | customer | 403 | ✅ |
| Transisi manual ke PAID/REFUNDED/CANCELLED; DRAFT→COMPLETED | staf | 400 | ✅ |
| Buat order atas nama customer lain | customer | 403 | ✅ |
| Batal order milik orang lain / sudah dibayar | customer | 403 / 400 | ✅ |
| Top-up langsung (2 jalur) | customer | 403 | ✅ |
| Refund mandiri | customer | 403 | ✅ |
| Refund rute lama untuk order customer lain | admin outlet | 404 | ✅ |
| Bayar pakai wallet customer lain / kirim `amount` | customer | 403 / 400 | ✅ |
| Nominal bayar saldo = total order (abaikan nilai klien) | — | debit = total | ✅ |
| Bayar order CANCELLED/REFUNDED/COMPLETED | — | 400 | ✅ |
| Checkout/quote/pricing atas nama customer/partner lain | customer | 403 | ✅ |
| Checkout atas nama partner milik sendiri | pemilik partner | 201 | ✅ |
| Perintah/heartbeat mesin | customer | 403 | ✅ |
| GET IoT, kiosk, ulasan fokus | customer | 403 | ✅ |
| Upload gambar umum | customer | 403 | ✅ |
| Ulasan untuk order orang lain | customer | 403 | ✅ |
| Request tanpa identitas | — | 401 | ✅ |

Belum dijalankan: uji terhadap database nyata/server live, uji aplikasi di perangkat.

## Fase 0 — Security gate di PostgreSQL nyata (TESTED)

File: `laundry-be/test/integration/authorization.int-spec.ts` — controller + RolesGuard + ValidationPipe + **PrismaService asli** terhadap DB uji terisolasi (Docker `postgres:16-alpine`, `127.0.0.1:55499/dicuciin_test`).

| Skenario | Hasil |
|---|---|
| K5 user, K6 isolasi data (8 endpoint milik orang lain → 403, milik sendiri → 200, id tak ada → 404) | ✅ |
| K7, K11, K1/K9/K3/K4, K8 (termasuk partner milik sendiri boleh), K10/K12 | ✅ |
| Lingkup outlet: kasir hanya outlet sendiri; outlet lain/order outlet lain/ubah status → 403; tanpa outlet → 403; admin outlet = gabungan outletnya; owner global | ✅ |
| Regresi Admin: 16 endpoint yang dipakai panel × (owner, super admin) tidak ditolak | ✅ |
| Regresi Kiosk: `/kiosks/device/*` (@Public) tetap terjangkau tanpa JWT | ✅ |

## Fase 1 Batch 1 — Booking, pembayaran, aktivasi (TESTED, PostgreSQL nyata)

File: `test/integration/booking-activation.int-spec.ts`, `sequence.int-spec.ts`, `app-module.int-spec.ts`. Service asli (Orders, Bookings, Iot, IotMachine, Payments, WalletLedger); di-mock: broker MQTT, gateway Midtrans, modul loyalty.

| Skenario | Hasil |
|---|---|
| Order + booking HOLD atomik, relasi FK nyata, harga dari server | ✅ |
| Bentrok mesin → 409 tanpa order yatim (rollback) | ✅ |
| **Konkurensi**: 8 pelanggan, slot sama, paralel → tepat 1 sukses, sisanya 409 | ✅ |
| Slot berbeda pada mesin sama → keduanya sukses; mesin outlet lain ditolak | ✅ |
| HOLD lama (POST /bookings) dipakai ulang saat order dibuat — tanpa booking ganda | ✅ |
| **Scan sebelum bayar** → ditolak, 0 perintah START | ✅ |
| Alur lama "Booking & Pakai" → ditolak | ✅ |
| Bayar saldo order yang sama → PAID, RESERVED, saldo terpotong sesuai total, belum START | ✅ |
| Scan pemilik → START dipublikasikan **sekali**; scan ulang + 5 scan paralel → tetap 1 | ✅ |
| Pelanggan lain scan mesin yang dibayar orang lain → 403 | ✅ |
| Order PAID mesin A dipakai di mesin B (scan & START langsung) → ditolak | ✅ |
| Order "PAID" tanpa Payment PAID (manipulasi data) → ditolak | ✅ |
| Booking terjadwal: scan terlalu awal → ditolak | ✅ |
| IN_USE hanya setelah event RUNNING; scan berikutnya "sudah aktif" | ✅ |
| START FAILED → coba ulang ≤ 3 | ✅ |
| Hook PAID tidak menyalakan mesin order booking | ✅ |
| QRIS + webhook PAID → RESERVED pada order sama; webhook ganda tanpa efek ganda | ✅ |
| Bayar saldo paralel 4× → 1 pembayaran, saldo terpotong sekali | ✅ |
| Bayar saldo ditolak selama tagihan QRIS/VA aktif | ✅ |
| Bayar order orang lain → 403; saldo kurang → gagal tanpa efek | ✅ |
| Batal order → booking dilepas → mesin bisa dipesan lagi | ✅ |
| Batal booking belum dibayar → order ikut batal; sudah dibayar → ditolak | ✅ |
| HOLD kedaluwarsa tidak memblokir; bayar terlambat atas slot terambil → booking CANCELLED, tidak bisa dipakai | ✅ |
| Saldo + voucher (`/transactions/checkout`) dengan mesin → PAID + RESERVED atomik, START hanya lewat scan (PricingService di-mock) | ✅ |
| Saldo + voucher pada mesin terpakai → 409 tanpa order & tanpa potongan saldo | ✅ |
| Nomor order: 30 paralel → 30 unik; melanjutkan nomor lama | ✅ |
| `AppModule` terakit (DI) | ✅ |

## NOT_VERIFIED

| Item | Alasan |
|---|---|
| E2E Midtrans sandbox dengan kode Batch 1 | Kode belum dideploy ke server; key sandbox Core API hanya ada di server. E2E sandbox terakhir (19 Nov) berjalan pada kode lama. |
| Aktivasi mesin fisik / event IoT nyata | Belum ada perangkat IoT; event diuji dengan pemanggilan `handleDeviceEvent` |
| Aplikasi Flutter di perangkat | Diverifikasi lewat `flutter analyze` + `flutter build web`; test Flutter hanya placeholder |
| Panel admin di browser | Diuji di level API (16 endpoint); UI tidak dijalankan |
