# 16 — Laporan Uji Fase 1 Batch 2

Tanggal: 20 Nov 2026 · Branch `feat/production-readiness` · Lingkungan: Docker `postgres:16-alpine` terisolasi (`127.0.0.1:55499/dicuciin_test`). Tidak memakai DB development, DB proyek lain, server, atau transaksi nyata.

Label: **[PG]** PostgreSQL nyata · **[MOCK-GW]** gateway pembayaran tiruan (bukan Midtrans) · **[MOCK-IOT]** broker MQTT tiruan (bukan mesin fisik) · **[UNIT]** mock penuh.

## Ringkasan

| Gate | Hasil |
|---|---|
| `tsc --noEmit` | exit 0 |
| `npm run build` (backend) | sukses |
| `prisma migrate diff` skema ↔ migrasi | kosong |
| Unit backend | **262/262** (24 suite) |
| Integration PostgreSQL | **120/120** (10 suite) |
| Pengulangan suite konkurensi (payment, scheduler, reconciliation, kiosk) | 3× berturut-turut 63/63 |
| Flutter mobile: analyze / test / build web | bersih / 3 lulus / sukses |
| Flutter kiosk: analyze / test / build web | bersih / 2 lulus / sukses |
| Admin (Nuxt) `npm run build` | sukses (proyek admin tidak punya test otomatis) |
| Midtrans sandbox dengan kode Batch 2 | **NOT_VERIFIED** (belum deploy; key hanya di server) |
| Mesin IoT fisik / kiosk fisik / app di HP / UI admin di browser | **NOT_VERIFIED** |
| Redis + BullMQ nyata (penjadwalan) | **NOT_VERIFIED** (logika job diuji langsung; DI modul diuji `app-module.int-spec`) |

## Suite integration

| Suite | Test | Isi |
|---|---|---|
| `payment-lifecycle.int-spec.ts` [PG][MOCK-GW] | 18 | ganti metode, idempotensi, balapan settle, konkurensi, kedaluwarsa server, trigger DB, simulate hanya mock |
| `booking-scheduler.int-spec.ts` [PG][MOCK-GW][MOCK-IOT] | 12 | HOLD kedaluwarsa, penyelesaian, no-show, pemulihan START & pembayaran, multi-worker |
| `reconciliation.int-spec.ts` [PG] HTTP+JWT | 11 | pengajuan, otorisasi, eksekusi tepat sekali, refund langsung vs alur, EXTERNAL, top-up ditolak |
| `kiosk-compat.int-spec.ts` (regresi kiosk) | 22 | tetap lulus; helper diperbarui untuk FK rekonsiliasi |
| `mobile-compat.int-spec.ts` (regresi app lama) | 13 | 1 test diubah: saldo saat QRIS aktif kini **membatalkan QRIS** (dulu 409) |
| `booking-activation.int-spec.ts` (Batch 1) | 26 | 1 test diubah: idem + QR lama dibayar → `DUPLICATE_PAYMENT` |
| `authorization`, `legacy-reconciliation`, `sequence`, `app-module` | 11 + 4 + 2 + 1 | tetap lulus |

## Uji yang diminta

| Kategori | Test | Hasil |
|---|---|---|
| Ganti metode | QRIS → VA BCA → VA BNI (nomor unik, lama CANCELLED + dibatalkan di gateway, riwayat 3 baris); metode sama dipakai ulang; ganti saat tagihan lama sudah dibayar → 409 tanpa tagihan baru; QRIS → saldo | ✅ |
| Kedaluwarsa | dalam toleransi tetap PENDING; lewat batas + provider PENDING → EXPIRED + `canRetry` + percobaan baru; lewat batas + provider PAID → PAID; error gateway → tetap PENDING | ✅ |
| Webhook ganda | 5 webhook PAID paralel → 1 pelunasan, 1 log | ✅ |
| Pembayaran konkuren | 8 permintaan ganti metode paralel → tepat 1 percobaan aktif; 2 tagihan berbeda dibayar paralel → 1 lunas + `DUPLICATE_PAYMENT` | ✅ |
| Batal vs pelunasan | 8× paralel → PAID tanpa rekonsiliasi ATAU CANCELLED + `PAID_AFTER_CANCEL` + booking batal | ✅ |
| Saldo vs QRIS | 10× paralel → order lunas sekali, saldo terpotong ≤ 1×, setiap pembayaran lunas lain → rekonsiliasi | ✅ |
| HOLD kedaluwarsa | expire + order batal + tagihan di-expire; tagihan aktif dilewati; order PAID dilewati; dana terlambat → `PAID_AFTER_CANCEL`, 0 START | ✅ |
| Penyelesaian booking | event COMPLETED → DONE + order COMPLETED; fallback durasi + audit; mesin masih RUNNING → tidak diselesaikan, ditandai macet sekali | ✅ |
| Multi-worker | 4 worker × 15 HOLD → 15 sekali; 3 worker penyelesaian → 1 log; 3 worker no-show → 1 rekonsiliasi; 4 worker publikasi ulang → 1 MQTT; 3 worker sinkron pembayaran → 1 pelunasan | ✅ |
| Rekonsiliasi | pembuatan otomatis 4 alasan; pengajuan customer; daftar per outlet | ✅ |
| Otorisasi refund | customer/kasir/admin outlet tidak bisa menyetujui/eksekusi (403); kasir tidak melihat daftar; eksekusi tanpa persetujuan 409; ditolak tidak bisa dieksekusi | ✅ |
| Refund tepat sekali | 5 eksekusi paralel → 1 sukses, 1 ledger; refund langsung lalu eksekusi → 409, tanpa kredit ganda | ✅ |
| Regresi app lama | 13/13 (satu perilaku berubah sesuai T4) | ✅ |
| Regresi kiosk | 22/22 + jalur tagihan kiosk memakai `requestGatewayCharge` | ✅ |
| Invarian DB | trigger: CANCELLED → PAID ditolak walau SQL langsung; `paidPaymentId` milik order lain ditolak | ✅ |

## Unit test baru

| Area | Test |
|---|---|
| Adaptor Midtrans [UNIT] | `order_id` = nomor percobaan; expire → EXPIRED; expire ditolak (412) → status → PAID; status 404/pending/deny |
| IoT [UNIT] | klaim atomik kalah → tidak publish; COMPLETED → order COMPLETED; RUNNING terlambat untuk TIMEOUT diterima |
| Flutter mobile | parsing `secondsRemaining`/`canRetry`, respons lama tetap aman |
| Flutter kiosk | `isEnded` hanya dari status server (hitung mundur 0 ≠ kedaluwarsa) |

## Uji mutasi

| Pengaman dibatalkan sementara | Hasil |
|---|---|
| Cek "order sudah dilunasi" di settlement | test gagal ✅ |
| Klaim atomik sebelum publish MQTT | 2 test gagal ✅ |
| Lewati HOLD yang tagihannya masih aktif | test gagal ✅ |
| Verifikasi provider sebelum EXPIRED | 2 test gagal ✅ |
| Cek status REFUNDED saat eksekusi | test tetap lulus — pengaman **berlapis** (status APPROVED, pembayaran PAID, update bersyarat, idempotencyKey ledger); satu lapis saja tidak cukup untuk menimbulkan kredit ganda |

## Perubahan test lama (bukan pelemahan)

| Test | Sebelum | Sesudah | Alasan |
|---|---|---|---|
| booking-activation: saldo saat QRIS aktif | 409 | QRIS CANCELLED, saldo terpotong sekali, QR lama dibayar → `DUPLICATE_PAYMENT` | T4: pelanggan boleh berganti ke saldo |
| mobile-compat: idem lewat rute lama | 409 | QRIS CANCELLED, saldo sekali | idem |
| Unit mock (iot, payments, wallets, orders) | — | mock ditambah `updateMany`/`$transaction`/`findUniqueOrThrow` | mengikuti implementasi baru |

## NOT_VERIFIED

| Item | Alasan / langkah |
|---|---|
| Midtrans `expire`/`status` sandbox (QRIS GoPay & VA) | Kode belum di server. Setelah deploy (izin): ganti metode QRIS→VA, cek di dashboard sandbox tagihan lama `expire`; bayar QR lama via simulator → harus muncul `DUPLICATE_PAYMENT` |
| BullMQ + Redis production | Setelah deploy: log `Ops scheduler terdaftar`, kunci `bull:ops-scheduler:*` di Redis |
| Mesin fisik (TIMEOUT/late RUNNING/COMPLETED) | butuh perangkat |
| UI admin di browser, app di HP, kiosk fisik | hanya build/analyze/test |
