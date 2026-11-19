# 02 — Arsitektur Booking ↔ Order ↔ Pembayaran ↔ Aktivasi (Fase 1 Batch 1: K2, T2)

Status: **TESTED** (lokal + PostgreSQL nyata) · Belum dideploy · 19 Nov 2026

## Akar masalah

| Temuan | Akar masalah (kode sebelum perbaikan) |
|---|---|
| **K2** Mesin bisa dipakai tanpa bayar | `BookingsService.verifyByDeviceCode` membuka mesin bila ada booking `RESERVED` milik customer — **tanpa memeriksa order maupun pembayaran**. `POST /bookings` membuat `RESERVED` tanpa order. Aplikasi menawarkan "Booking & Pakai" (reserve → verify) dari layar scan. |
| **T2** Booking & order tidak tersambung | `MachineBooking.orderId` hanya kolom teks tanpa FK dan **tidak pernah diisi** (app memesan sebelum order dibuat, tanpa orderId). `IotMachineService.resolveDevice` mencari mesin lewat `booking.orderId` → selalu kosong → START setelah PAID selalu dilewati. |
| Turunan | (a) Cek bentrok + tulis booking tanpa transaksi/lock → double booking paralel. (b) Cek bentrok mengabaikan jadwal. (c) Hook PAID mengirim START seketika — setelah T2 diperbaiki, booking besok akan menyalakan mesin sekarang. (d) `generateDailySequence` melepas lock sebelum order disisipkan → nomor order ganda saat paralel (ditemukan oleh test konkurensi PostgreSQL). (e) Event `RUNNING` mengubah booking berstatus apa pun (termasuk CANCELLED) menjadi IN_USE. (f) START yang FAILED tidak bisa dicoba ulang (kunci idempotensi tunggal). |

## Sebelum

```
App: pilih mesin → POST /bookings (RESERVED, tanpa order) → checkout → POST /orders (tanpa mesin) → bayar
     scan QR → POST /bookings/verify → booking RESERVED? → UNLOCK (hanya baris DB, tidak terkirim) — tanpa cek bayar
     saldo: /transactions/checkout → order BARU (order QRIS/VA sebelumnya tertinggal DRAFT)
PAID → activateMachineForOrder → cari booking.orderId (selalu null) → dilewati
```

## Sesudah

```
Pilih mesin+layanan+jadwal ─► POST /orders {deviceId, scheduledAt}
                               TX: order DRAFT + booking HOLD (lock baris mesin, cek bentrok slot) — atomik
Bayar:
  QRIS/VA  ─► POST /payments/gateway → webhook settlement ─┐
  Saldo    ─► POST /payments/wallet {orderId}  (order SAMA) ┤  TX settlePaidInTx: payment PAID, order PAID,
  Saldo+voucher ─► POST /transactions/checkout {deviceId…}  ┘  promo/loyalty, booking HOLD → RESERVED
                   (order lama DRAFT dibatalkan dulu oleh app)
  (tidak ada START saat PAID untuk order booking)
Scan QR ─► POST /bookings/verify
           TX (lock mesin): booking milik customer, mesin ini, RESERVED, dalam jendela waktu,
                            order milik customer & PAID, Payment PAID tercatat
           ─► requestMachineStart: START_MACHINE idempoten per order (publish MQTT sekali)
Mesin lapor RUNNING ─► booking IN_USE   ·   COMPLETED ─► DONE   ·   FAILED ─► boleh scan ulang (≤3)
```

## Parameter (env, default = usulan plan)

| Env | Default | Arti |
|---|---|---|
| `BOOKING_HOLD_MINUTES` | 10 | HOLD menunggu pembayaran |
| `BOOKING_GRACE_MINUTES` | 30 | toleransi setelah jadwal untuk scan |
| `BOOKING_SLOT_MINUTES` | 60 | panjang slot untuk cek bentrok |
| `BOOKING_SCAN_EARLY_MINUTES` | 15 | scan diterima sebelum jadwal |
| `BOOKING_MAX_START_ATTEMPTS` | 3 | percobaan START bila FAILED |

## Verifikasi seluruh jalur aktivasi mesin

Satu-satunya kode yang mempublikasikan perintah ke broker: `IotMachineService.markPublished`.

| Jalur | Bisa menyalakan mesin? | Validasi |
|---|---|---|
| `POST /bookings/verify` (scan QR) | Ya — via `requestMachineStart` | customer login, mesin dikenal & tipe mesin, booking milik customer untuk mesin ini, RESERVED & dalam jendela, order milik customer & PAID, Payment PAID ada; lock mesin; START idempoten (anti replay/paralel) |
| Hook PAID (`settlePaid`, `/payments/wallet`, `/transactions/checkout`) → `activateMachineForOrder` | Tidak untuk order booking (ditunda ke scan). Order tanpa mesin → tidak ada perangkat | `createStartMachineCommand` juga mensyaratkan order PAID & mesin = mesin booking |
| `POST /iot/devices/:id/commands` | Tidak — hanya menulis baris PENDING (tidak dipublikasikan) | Role admin/teknisi (Fase 0, K10) |
| `POST /iot/devices/:id/heartbeat` | Tidak (status) | Role admin/teknisi |
| `POST /bookings/:id/complete` | Tidak (LOCK, baris DB) | pemilik booking |
| Antrean BullMQ `iot-command` | Tidak — processor stub tanpa produsen | — |
| Endpoint kiosk `/kiosks/device/*` | Tidak memanggil aktivasi | token perangkat |
| `POST /payments/:n/simulate` | Tidak langsung (settle → RESERVED, tetap butuh scan) | ditolak saat `APP_ENV=production` |
| Event MQTT masuk | Tidak (hanya transisi status) | device code dikenal; **kepercayaan bergantung ACL broker** |

## Kebijakan role & outlet

`resolveOutletScope(user, outletId?)`: SUPER_ADMIN/OWNER → global; staf lain → hanya outlet yang ditugaskan (`OutletUser`), outlet lain 403, belum ditugaskan 403. Diterapkan pada `GET /orders`, `/orders/summary/dashboard`, `/orders/summary/finance` (staf non-global: gabungan outlet yang ditugaskan, tidak pernah global) dan pada operasi per order (`GET /orders/:id`, ubah status, batal).
