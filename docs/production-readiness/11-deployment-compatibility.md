# 11 — Kompatibilitas Deployment & Rencana Rilis Terkoordinasi (Fase 0 → Batch 1.5)

Status: audit selesai, kompatibilitas mundur yang aman **diimplementasikan & diuji** · belum deploy.
Bukti: `test/integration/mobile-compat.int-spec.ts` (payload persis app lama dari branch `main`), `kiosk-compat.int-spec.ts`, `authorization.int-spec.ts` (regresi admin).

## Komponen & versi

| Komponen | "Lama" | "Baru" |
|---|---|---|
| Backend | yang berjalan di server sekarang (`main`) | `feat/production-readiness` (Fase 0 + Batch 1 + 1.5) |
| Mobile Flutter | APK yang sudah dibagikan (tester, Midtrans) — build dari `main` | build dari branch ini |
| Kiosk Flutter | build dari `main` | build dari branch ini |
| Admin (Nuxt) | `main` | **tidak berubah** di branch ini |
| IoT | firmware/broker MQTT saat ini | tidak berubah (format perintah sama) |

## Matriks kompatibilitas

✅ berfungsi · ⚠️ berfungsi dengan batasan · ⛔ ditolak (disengaja, alasan keamanan) · ❌ rusak

### Mobile LAMA × Backend BARU

| Fitur app lama | Hasil | Catatan |
|---|---|---|
| Login, OTP, register, profil (lihat), outlet, harga, promo, ulasan, poin, voucher, riwayat order | ✅ | |
| Edit profil (`PATCH /users/:id` `{name,email,phone}`) | ✅ | **Dipulihkan di 1.5** (Fase 0 sempat 403). Hanya nama/email; nomor HP harus sama (400 bila diubah); field istimewa → 403 |
| Upload foto profil | ✅ | Hanya untuk diri sendiri |
| Booking: reserve → order → bayar → scan | ⚠️ | **Dipulihkan di 1.5** lewat pengikatan HOLD lama ke order (aturan ketat, lihat bawah). Order harus dibuat ≤ `BOOKING_HOLD_MINUTES` (10) menit setelah reserve; reservasi ganda sejenis di outlet sama → tidak diikat |
| Bayar saldo (`/wallets/customer/:id/pay` + `amount`) | ✅ | **Dipulihkan di 1.5**: `amount` diterima tapi diabaikan (nominal = total order); kini jalur tunggal — kunci order, cegah bayar dobel dengan QRIS aktif, booking → RESERVED |
| Bayar QRIS/VA (`/payments/gateway`) | ✅ | |
| Saldo + voucher (`/transactions/checkout`) | ✅ | HOLD lama juga diikat |
| "Booking & Pakai" di halaman scan (reserve lalu langsung scan tanpa bayar) | ⛔ | K2 — "Selesaikan pembayaran dulu…" |
| Tombol Top-up | ⛔ | K1 — 403 (top-up Midtrans = Fase 2) |
| Refund mandiri | ⛔ | K3 — 403 (refund lewat admin) |

### Mobile BARU × Backend

| | Backend LAMA | Backend BARU |
|---|---|---|
| Buat order dengan mesin (`deviceId`, `scheduledAt`) | ❌ 400 (field tidak dikenal) | ✅ |
| Bayar saldo `POST /payments/wallet` | ❌ 404 | ✅ |
| Edit profil `PATCH /users/me` | ❌ 404 | ✅ |

→ **Backend harus dideploy sebelum app mobile baru dirilis.**

### Kiosk

| | Backend LAMA | Backend BARU |
|---|---|---|
| Kiosk LAMA | (kondisi sekarang) harga 401, mesin tidak menyala | ⚠️ harga ✅; order/checkout **ditolak sebelum bayar** ("perbarui aplikasi kiosk") |
| Kiosk BARU | ❌ order ditolak (`deviceId`) | ✅ |

→ **Kiosk diperbarui segera setelah backend** (jendela tanpa penjualan kiosk = durasi update kiosk).

### Admin

| Area | Hasil |
|---|---|
| Login, dashboard, order, member, mesin, kiosk, voucher, promo, laporan (owner/super admin) | ✅ (API diuji 16 endpoint × 2 role; build Nuxt sukses) |
| Kasir/admin outlet | ⚠️ hanya outlet yang ditugaskan; **tanpa penugasan → 403** (gagal aman) |
| Ubah status order ke PAID/REFUNDED/CANCELLED manual | ⛔ (Fase 0 — status keuangan hanya dari sistem) |
| UI di browser | NOT_VERIFIED |

### IoT

| Area | Hasil |
|---|---|
| Format perintah `START_MACHINE` via MQTT | ✅ tidak berubah |
| Order mobile | START hanya saat scan QR pemilik (Batch 1) |
| Order kiosk | **Baru**: START otomatis setelah pembayaran terverifikasi (sebelumnya tidak pernah) |
| Event RUNNING/COMPLETED/FAILED | ✅ tidak berubah |
| Perangkat fisik | NOT_VERIFIED |

## Daftar breaking change (lengkap)

| # | Perubahan | Dampak ke klien lama | Penanganan |
|---|---|---|---|
| B1 | Scan QR wajib order PAID milik sendiri (K2) | "Booking & Pakai" app lama ditolak | Disengaja |
| B2 | Booking terikat order (T2) | Alur reserve→order app lama | Kompatibilitas: pengikatan HOLD lama |
| B3 | Top-up langsung ditutup (K1) | Tombol top-up app lama gagal | Disengaja; app baru menyembunyikan tombol |
| B4 | Refund mandiri ditutup (K3) | Tombol refund app lama gagal | Disengaja |
| B5 | `amount` dihapus dari bayar saldo (K4) | App lama 400 | **Kompatibilitas**: diterima & diabaikan |
| B6 | `PATCH /users/:id` hanya admin (K5) | Edit profil app lama 403 | **Kompatibilitas**: diri sendiri (nama/email) |
| B7 | Laporan/daftar order dibatasi outlet | Staf tanpa outlet 403 | Penugasan outlet sebelum deploy (bawah) |
| B8 | Order kiosk wajib mesin | Kiosk lama tidak bisa menjual | Update kiosk |
| B9 | Checkout saldo kiosk wajib PIN | Kiosk lama gagal bayar saldo; customer tanpa PIN tidak bisa bayar saldo di kiosk | Disengaja (keamanan); customer atur PIN di app |
| B10 | Status order keuangan tidak bisa diubah manual (K7) | Admin tidak bisa "tandai PAID" | Disengaja |
| B11 | `machine_bookings.customerId` nullable (booking tamu kiosk) | Kode lama saat **rollback** | Lihat 08 §Rollback |

## Pengikatan HOLD lama (detail keamanan)

Order dari pemanggil JWT (bukan kiosk) tanpa `deviceId` akan mengikat HOLD lama **hanya bila**: milik customer yang sama, tanpa order, status HOLD, belum kedaluwarsa, mesin di outlet order, jenis mesin cocok dengan `machineType` item/layanan, dan **tepat satu** kandidat. Setelah terikat, semua aturan Batch 1 berlaku (RESERVED hanya saat PAID; START hanya lewat scan pemilik). Tidak ada jalur aktivasi tanpa bayar yang dibuka kembali (diuji: "Booking & Pakai" tetap 0 START).

## Prioritas 4 — Penugasan outlet staf

Aturan (sudah berlaku sejak Batch 1, diverifikasi ulang):

| Role | Akses laporan/daftar order/dashboard |
|---|---|
| SUPER_ADMIN, OWNER | Global (boleh filter outlet mana pun) |
| ADMIN_OUTLET, CASHIER, OPERATOR, TECHNICIAN | Hanya outlet di `outlet_users`; outlet lain → 403; **tanpa penugasan → 403** |

Audit baca-saja: `npx ts-node scripts/audit-staff-outlets.ts --out staff-outlets.json` (`npm run audit:staff-outlets`). Menandai:

| Temuan | Dampak |
|---|---|
| `NO_OUTLET` | 403 di daftar order, dashboard, laporan; tidak bisa membuka kiosk staf |
| `MULTI_OUTLET_KIOSK_STAFF` | Laporan = gabungan outlet; mode kiosk staf menolak (harus tepat 1 outlet) |
| `INACTIVE_OUTLET_ONLY` | Laporan kosong |

Tidak ada penugasan otomatis — hanya owner yang tahu penugasan yang benar. Diuji di `legacy-reconciliation.int-spec.ts` (audit tidak mengubah data). **Hasil terhadap data production: NOT_VERIFIED** (butuh izin menjalankan di server).

## Rencana rilis terkoordinasi

> Semua langkah yang menyentuh server/production menunggu persetujuan eksplisit owner.

**T-1 (persiapan, tanpa mengubah production)**
1. Owner memutuskan: kebijakan refund, penugasan outlet staf, `BOOKING_HOLD_MINUTES` masa transisi (usul 15 selama app lama masih beredar).
2. Jalankan (dengan izin) dua laporan baca-saja di server: `audit:staff-outlets` dan `reconcile:legacy-bookings` (dry-run). Owner menugaskan outlet lewat panel admin.
3. Siapkan build: APK mobile baru, build kiosk baru (`--dart-define=API_BASE_URL=…`).
4. Pilih jendela deploy saat outlet sepi/tutup (kiosk tidak bisa menjual selama transisi).

**T0 (deploy)**
1. Backend: `deploy-update.sh` (backup DB → build → `prisma migrate deploy` 4 migrasi aditif → reload). Health check.
2. Smoke test (06-production-deployment.md).
3. Kiosk: pasang build baru di semua kiosk → uji 1 transaksi QRIS sandbox/kecil dengan izin → mesin menyala.
4. Rekonsiliasi: dry-run ulang → `--apply` bila disetujui.

**T+0…T+n**
1. Rilis APK mobile baru (tidak lagi wajib bersamaan — app lama tetap berfungsi untuk alur utama).
2. Pantau log: `PERLU REFUND MANUAL`, `tidak bisa dipertahankan (slot terambil)`, `Aktivasi mesin order kiosk … gagal`.
3. Setelah mayoritas pengguna pindah: kembalikan `BOOKING_HOLD_MINUTES` ke 10; pertimbangkan menutup rute lama (`POST /bookings`, `/wallets/customer/:id/pay`, `PATCH /users/:id` self) di batch berikutnya.

Admin: tidak perlu deploy ulang (kode tidak berubah).

## Prasyarat Go

- [x] Unit 255/255, integration PostgreSQL 79/79, tsc/build OK, skema↔migrasi kosong
- [x] Flutter mobile & kiosk: analyze bersih, test lulus, build web sukses; admin build sukses
- [ ] Penugasan outlet staf (owner)
- [ ] Laporan dry-run rekonsiliasi production ditinjau (owner)
- [ ] Kebijakan refund (owner)
- [ ] E2E Midtrans sandbox dengan kode baru (setelah deploy, dengan izin)
- [ ] Uji kiosk & mesin IoT fisik
