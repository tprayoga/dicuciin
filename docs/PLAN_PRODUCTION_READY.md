# Plan Perbaikan Menuju Production Ready — Aplikasi Mobile Di.Cuciin

Dasar: [Audit-Aplikasi-Mobile-2026-11-19.pdf](Audit-Aplikasi-Mobile-2026-11-19.pdf) (33 temuan: 7 kritis, 11 tinggi, 8 sedang, 7 rendah).
Kode temuan (K1, T2, dst.) mengikuti laporan audit.

## Definisi "production ready"

Aplikasi boleh dibuka untuk pelanggan bila **semua** ini terpenuhi:

1. Tidak ada jalan memakai mesin, mendapat saldo, atau menandai order lunas tanpa membayar (K1–K4, K7).
2. Customer hanya bisa membaca dan mengubah datanya sendiri (K5–K6).
3. Alur utama berjalan ujung ke ujung tanpa langkah manual: daftar (OTP) → pilih mesin → bayar (QRIS/VA/saldo) → mesin menyala → selesai otomatis.
4. Pembayaran Midtrans **Production** teruji dengan transaksi nyata nominal kecil.
5. Server siap operasi: backup, rotasi log, monitoring, dan prosedur rollback.

## Ringkasan fase

| Fase | Isi | Temuan | Estimasi* | Hasil |
|---|---|---|---|---|
| 0 | Hotfix keamanan backend | K1, K3, K4, K5, K6, K7 | 1–2 hari | Celah uang & data tertutup |
| 1 | Alur inti: mesin ↔ order ↔ pembayaran | K2, T2, T3, T4, T5, T9, T10, S1, S2 | 4–5 hari | Bayar → mesin menyala → selesai |
| 2 | Top-up lewat Midtrans & PIN wallet | K1 (fitur), S5 | 2–3 hari | Saldo hanya dari uang nyata |
| 3 | Auth & akun | T1, T6, T7, T11 | 2 hari | Sesi stabil, OTP terkirim, login konsisten |
| 4 | Kualitas alur & tampilan | T8, S3, S4, S6, S7, S8, R1–R5, R7 | 2–3 hari | Informasi akurat, menu lengkap |
| 5 | Rilis & operasional | R6 + checklist server/Midtrans | 2 hari | APK rilis, server production |

\* Estimasi untuk 1 developer full-stack. Total ±13–17 hari kerja (±3–4 minggu kalender, termasuk UAT).

**Jalur paralel review Midtrans.** Bila APK harus dikirim ke Midtrans sebelum Fase 1–4 selesai, kerjakan dulu paket kecil ini (±2 hari): T1, T4, T5, T8, R1, R2, R6. Ini bagian yang paling mungkin dicoba reviewer.

---

## Fase 0 — Hotfix keamanan backend (1–2 hari)

Tujuan: menutup celah yang bisa dieksploitasi hari ini. Perubahan kecil, terutama di backend, dan bisa dideploy segera.

| Temuan | Perubahan | File |
|---|---|---|
| K5 Ubah user mana pun | `PATCH /users/:id` → `@Roles(SUPER_ADMIN, OWNER)`. Tambah `PATCH /users/me` (DTO terbatas: `name`, `email`, `avatarUrl`). Owner tidak boleh menaikkan role di atas dirinya. | `users.controller.ts`, `users.service.ts`, DTO baru |
| K6 Data bocor | `GET /customers`, `GET /orders`, `GET /orders/summary/*` → role staf/admin. Endpoint per-id (`/customers/:id/*`, `/orders/:id`, `/wallets/customer/:id*`, `/payments/:n/status`) → cek pemilik: `customer.userId === req.user.userId` **atau** role staf. Buat helper bersama `assertCustomerAccess(user, customerId)`. | `customers.controller.ts`, `orders.controller.ts`, `wallets.controller.ts`, `payments.controller.ts` |
| K7 Status order bebas | `PATCH /orders/:id/status` → role staf. Tambah tabel transisi yang diizinkan; status `PAID` hanya dari alur pembayaran (tolak lewat endpoint ini). | `orders.controller.ts`, `orders.service.ts` |
| K1 Top-up gratis | `POST /wallets/customer/:id/topup` → `@Roles(SUPER_ADMIN, OWNER)` (top-up manual oleh admin). Di aplikasi, **sembunyikan tombol Top up** sampai Fase 2. | `wallets.controller.ts`, `home_page.dart`, `member_dashboard_page.dart` |
| K4 Bayar saldo nominal bebas | Hapus `amount` dari `PayWithWalletDto`; nominal = `order.totalAmount` dari server. Cek pemilik. (Aplikasi memakai `/transactions/checkout`; pertimbangkan menonaktifkan endpoint lama.) | `wallets.service.ts`, `dto/wallet.dto.ts` |
| K3 Refund mandiri | `POST /wallets/customer/:id/refund` → role admin saja (sudah ada `orders/:orderId/refund` untuk admin). Hapus tombol "Refund ke Saldo" di aplikasi; ganti dengan "Ajukan bantuan" (WhatsApp). | `wallets.controller.ts`, `order_page.dart` |

**Pengujian wajib:** test e2e otorisasi (matriks role × endpoint). Minimal: token customer A **ditolak** (403/404) saat mengakses data customer B, daftar customer, ubah status order, top-up, dan ubah user lain. Token admin tetap berhasil.

**Rilis:** deploy backend + rilis aplikasi (tombol top-up/refund disembunyikan). Cek panel admin tetap berfungsi, karena panel admin memakai endpoint yang sama.

---

## Fase 1 — Alur inti: mesin ↔ order ↔ pembayaran (4–5 hari)

Tujuan: satu alur yang konsisten. Order selalu terikat mesin, mesin hanya terbuka bila order lunas, dan booking selesai otomatis.

### Alur baru

```
Pilih mesin + layanan + jumlah siklus + waktu
  → POST /orders { deviceId, scheduledAt, items }
      server: hitung harga final (PricingService: voucher, happy hour),
              buat Order DRAFT + MachineBooking HOLD (orderId terisi, kedaluwarsa 10 menit)
  → Bayar (QRIS / VA / Saldo) untuk order yang SAMA
  → PAID (webhook Midtrans atau saldo)
      server: booking HOLD → RESERVED (berlaku sampai scheduledAt + 30 menit)
  → Di outlet: scan QR mesin → verify
      server: wajib booking milik user + order PAID → UNLOCK / START, booking IN_USE
  → Scheduler: IN_USE lewat estimasi durasi + buffer → COMPLETED, mesin AVAILABLE
  → Scheduler: HOLD tidak dibayar 10 menit → CANCELLED, order DRAFT → EXPIRED
```

### Pekerjaan

| Temuan | Perubahan |
|---|---|
| T2, T3 | `CreateOrderDto` menerima `deviceId` + `scheduledAt`. `OrdersService.create` membuat booking dengan `orderId` dalam satu transaksi (reuse logika cek bentrok dari `BookingsService.reserve`). Aplikasi: hapus panggilan `reserveMachine` sebelum checkout (`booking_machines_page.dart:98`). Tombol "pakai" di halaman Lokasi (`location_detail_page.dart:533`) diarahkan ke alur yang sama (pilih waktu "Sekarang"). |
| K2 | `verifyByDeviceCode`: hanya UNLOCK bila booking punya `orderId` dengan order `PAID`. Hapus alur "Booking & Pakai" tanpa bayar di `scan_qr_page.dart:96`; ganti dengan "Mesin tersedia → Pesan & bayar" yang membuka checkout untuk mesin itu. |
| T9 | Job BullMQ (tiap 1 menit): booking `IN_USE` dengan `startedAt + estimateMinutes × qty + 10 menit` < sekarang → `COMPLETED`, `endedAt` diisi, order → `COMPLETED`. Event mesin dari IoT (bila nanti ada) tetap diutamakan. |
| S2 | Status booking `HOLD` (enum baru, atau `RESERVED` dengan `expiresAt` 10 menit sebelum bayar). Job yang sama membatalkan HOLD kedaluwarsa. Kartu booking di halaman Order diberi tombol **Batalkan**. |
| T4 | `issueChargeForOrder`: bila tagihan lama `PENDING` tetapi metode/bank berbeda **atau** sudah kedaluwarsa → batalkan di Midtrans (`POST /v2/{order_id}/cancel`, tambahkan `cancelCharge` di `PaymentGateway`), tandai lama `CANCELLED`, buat tagihan baru dengan `paymentNumber` bersufiks (`PG-ORD-…-2`). Webhook mencocokkan via `paymentNumber`/`externalId` (sudah). |
| T5 | Halaman QRIS/VA: hitung mundur dari `expiresAt`; status `EXPIRED`/`FAILED` → hentikan polling, tampilkan "Tagihan kedaluwarsa" + tombol **Buat tagihan baru**. Polling berhenti saat halaman ditutup (sudah) dan setelah kedaluwarsa. |
| T10 | Hapus pemaksaan ke Saldo (`order_checkout_page.dart:982-995`). Karena harga final sudah dihitung di server saat membuat order (lihat T2), voucher dan happy hour berlaku untuk QRIS/VA juga. Pemakaian voucher dicatat saat PAID (pola `commitUsage` yang ada). |
| S1 | Satu order dipakai untuk semua metode: checkout saldo membayar order yang sudah ada (`/transactions/checkout` menerima `orderId`), bukan membuat order baru. Riwayat menyembunyikan order `EXPIRED`. Aktifkan kembali halaman detail order (`order_detail_screen.dart`) dengan aksi **Lanjutkan pembayaran** / **Batalkan** untuk DRAFT; hapus tombol "Upload Bukti Bayar". |
| S4 | Pilihan jumlah siklus (1–3) untuk dryer; harga dan durasi dikali di server. |

**Migrasi data:** booking `RESERVED`/`IN_USE` lama tanpa `orderId` diselesaikan/dibatalkan sekali jalan. Mesin yang sudah tertahan dikembalikan `AVAILABLE`.

**Pengujian:** unit test `verifyByDeviceCode` (tolak bila belum PAID), scheduler (HOLD kedaluwarsa, IN_USE selesai), `issueChargeForOrder` (ganti metode, kedaluwarsa). E2E sandbox: QRIS, VA BCA/BNI/BRI/Permata, saldo; ganti metode di tengah; biarkan kedaluwarsa lalu buat tagihan baru; scan QR sebelum dan sesudah bayar.

---

## Fase 2 — Top-up lewat Midtrans & PIN wallet (2–3 hari)

| Temuan | Perubahan |
|---|---|
| K1 (fitur) | Endpoint baru `POST /wallets/me/topup` → membuat tagihan Midtrans (QRIS/VA) dengan `paymentNumber` `TOPUP-…` (tabel `Payment` dengan `orderId` null + `walletId`, atau tabel `TopupRequest`). Webhook settlement untuk `TOPUP-…` → kredit `MAIN_BALANCE` lewat `WalletLedgerService` dengan `idempotencyKey = paymentNumber`. Cashback top-up (campaign) dipicu di titik yang sama. Aplikasi: halaman Top Up memakai halaman QRIS/VA yang sudah ada; tombol Top up ditampilkan lagi. |
| S5 | `setPin`: bila PIN sudah ada, wajib `oldPin`. Checkout saldo menerima `pin` dan memverifikasinya di server. Kunci 15 menit setelah 5x salah (kolom `pinFailedCount`, `pinLockedUntil`). Aplikasi mengirim PIN dari `wallet_pin_sheet.dart` ke endpoint checkout. |

**Pengujian:** top-up QRIS/VA sandbox sampai saldo bertambah sekali (kirim ulang notifikasi → tidak dobel); PIN salah 5x terkunci; ubah PIN tanpa PIN lama ditolak.

---

## Fase 3 — Auth & akun (2 hari)

| Temuan | Perubahan |
|---|---|
| T1 | `ApiClient`: saat respons 401 dan ada refresh token → panggil `/auth/refresh` **sekali** (antrean bersama agar request paralel tidak me-refresh berulang), simpan token baru, ulangi request. Gagal → logout lokal dan arahkan ke login dengan pesan "Sesi berakhir". |
| T6 | Fungsi `normalizePhone()` di backend (format `628…`), dipakai di login, register, OTP, reset password, dan pembuatan user/customer di admin. Login: identifier berbentuk nomor dinormalisasi sebelum dicari. Migrasi: normalisasi kolom `users.phone` (cek duplikat dulu; gabungkan atau laporkan bila bentrok). Aplikasi: login menormalisasi juga. |
| T7 | Isi `WA_API_KEY` (Fonnte) di server dan hubungkan nomor pengirim. Bila pengiriman gagal, OTP endpoint membalas error yang jelas (bukan "OTP terkirim"). Mode dev-fallback hanya aktif saat `APP_ENV != production`. |
| T11 | `ios/Runner/Info.plist`: tambah `NSCameraUsageDescription` ("Untuk memindai QR mesin laundry"). |
| R3 (profil) | Halaman edit profil dihubungkan dari menu Akun, memakai `PATCH /users/me` (Fase 0). |

---

## Fase 4 — Kualitas alur & tampilan (2–3 hari)

| Temuan | Perubahan |
|---|---|
| T8 | `booking_machines_page.dart:495`: bila `now.hour + 1 > 21` → slot hari ini kosong + teks "Tidak ada slot tersisa hari ini". Jam operasional sebaiknya dari `outlet.openTime/closeTime`, bukan 8–21 tetap. |
| S3 | Tambah `capacityKg` + `serviceId` (atau relasi layanan) pada `IotDevice`; isian di admin (Kelola Mesin — sejalan dengan feedback tester). Endpoint daftar mesin mengembalikan harga/kapasitas per mesin; aplikasi berhenti menebak dari layanan pertama. |
| S6 | `mobile-member.service.ts:125`: `nextTier` kosong bila tidak ada tier berikutnya; aplikasi menampilkan "Tier tertinggi". |
| S7 | Status `OFFLINE` ditampilkan "Offline", bukan "Maintenance". Tombol Washing/Dryer di beranda membuka lokasi dengan filter tipe. |
| S8 | Halaman sukses: tampilkan langkah berikutnya (datang sesuai jadwal → scan QR mesin). Permintaan ulasan dipindah ke setelah booking `COMPLETED` (dari riwayat order). |
| R1 | Notifikasi: ambil dari API (bila sudah ada) atau tampilkan kosong; hapus data contoh. |
| R2 | Menu Hubungi Kami → WhatsApp; Ketentuan Layanan & Kebijakan Privasi → halaman di dicuciin.com (`url_launcher` sudah ada). |
| R3 | Tukar poin → voucher: tombol di Dashboard Member memakai `redeemPointVoucher` yang sudah ada. Hapus kode mati (`create_order_screen.dart`, upload bukti bayar). |
| R4 | Ganti logo opsi Bank Permata. |
| R5 | Tombol "Simpan QR" ke galeri di halaman QRIS. |
| R7 | Rapikan data layanan di admin (kapasitas, nama per outlet, kategori dryer). Koreksi nama merchant di dashboard Midtrans bila "Manugggal" salah ketik. |

---

## Fase 5 — Rilis & operasional (2 hari)

### Aplikasi (R6)
- [ ] Nama aplikasi "Di.Cuciin", `applicationId` resmi (mis. `com.dicuciin.app`) — **tetapkan sekali, tidak bisa diganti setelah terbit di Play Store**.
- [ ] Release keystore (simpan aman + cadangan), `signingConfig` release.
- [ ] `usesCleartextTraffic="false"`; default `API_BASE_URL` ke server production.
- [ ] Ikon, splash, versi `1.0.0+N`; build `appbundle` untuk Play Store.

### Server & Midtrans
- [ ] Midtrans **Production**: aktifkan channel Core API (QRIS, VA) untuk M509118050; buat Server Key production (izin Core API: Write); pasang `MIDTRANS_SERVER_KEY` + `MIDTRANS_SIGNATURE_KEY` production; `MIDTRANS_IS_PRODUCTION=true`; Notification URL production; uji 1 transaksi nyata nominal kecil per channel.
- [ ] `APP_ENV=production`; hapus origin localhost dari CORS; `PAYMENT_WEBHOOK_SECRET` diisi (atau matikan webhook simulasi sepenuhnya).
- [ ] `WA_API_KEY` terpasang (Fase 3).
- [ ] Rotasi log PM2 (`pm2-logrotate`) — log error saat ini ±1,2 GB per file.
- [ ] Backup database harian otomatis + uji restore.
- [ ] Monitoring: uptime `/health`, peringatan error 5xx dan kegagalan webhook.
- [ ] Bersihkan data uji (order `ORD-20261116-*`, `ORD-20261119-*`, akun `midtrans.test@…` setelah review).
- [ ] Ganti password SSH, password superadmin, dan cabut key Midtrans yang pernah tertulis di chat.
- [ ] Deploy hanya lewat `deploy/scripts/deploy-update.sh` (pernah terjadi server menjalankan build lama).

---

## Pengujian & penerimaan

1. **Otomatis (backend):** matriks otorisasi (Fase 0), alur booking/pembayaran/scheduler (Fase 1), top-up & PIN (Fase 2). Semua suite lulus sebelum deploy.
2. **E2E sandbox:** skrip uji alur aplikasi (sudah ada di laporan uji sebelumnya) diperluas: ganti metode, kedaluwarsa, saldo, top-up, scan sebelum/sesudah bayar.
3. **UAT tester:** ulangi dokumen *Di.Cuciin App Testing* untuk bagian mobile + daftar temuan audit; setiap temuan ditutup dengan bukti (screenshot/log).
4. **Uji perangkat:** minimal 1 Android lama (Android 9–10), 1 Android baru, 1 iPhone (T11).
5. **Go/No-Go:** semua Kritis & Tinggi tertutup, transaksi production nyata berhasil, backup & monitoring aktif.

## Keputusan yang perlu dari owner

1. **Refund:** cukup oleh admin, atau ada pengajuan dari pelanggan yang disetujui admin?
2. **Booking tanpa bayar:** berapa lama mesin boleh ditahan sebelum bayar (usulan 10 menit), dan berapa lama setelah jadwal (usulan 30 menit)?
3. **Jam operasional slot:** pakai jam buka/tutup per outlet?
4. **Top-up:** nominal minimum/maksimum dan apakah ada biaya admin.
5. **Package name aplikasi** untuk Play Store.
