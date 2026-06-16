# Roadmap Penutupan Gap Fitur — DiCuciin

> Dibuat: 2026-06-02 · Basis: list fitur owner + hasil cek codebase.
> Lihat juga: [ANALISIS.md](ANALISIS.md), [PROGRESS_INTEGRASI_AUTH.md](PROGRESS_INTEGRASI_AUTH.md).

## Status awal tiap item (ringkas)
- ✅ Sudah: PIN wallet, T&C/PDP register (UI), tombol customer service home.
- ⚠️ Mock/hardcoded (tinggal sambung): balance home, bayar saldo, voucher bayar,
  halaman promo, promo&campaign→mobile, member dashboard.
- ❌ Belum ada: occupancy, promo review Google, pop-up masuk, verifikasi booking
  mesin, staff input kiosk, review/feedback (+kurasi admin), manajemen ads/carousel.

## Keputusan owner (2026-06-02)
- Urutan eksekusi: **Fase 0 → 1 → 2 → 3 → 5 → 4**.
- Member dashboard (item 14) isi: **saldo & riwayat transaksi**, **voucher/promo milik
  member**, **riwayat order & statistik**. (Tanpa poin/tier loyalty.)

---

## 🟢 Fase 0 — Sambung mock → API  ✅ SELESAI & TERVERIFIKASI (2026-06-02)
1. **Balance home + bayar saldo nyata** (item 7, 9) ✅
   - Mobile: `WalletController` kini real — `getWalletBalance`/`payOrder`/`topUp` via `AuthService`
     (`GET /wallets/customer/:id`, `POST .../pay`, `/topup`); saldo dimuat saat `syncFromAuth`.
   - BE (P3+P2): `wallet.pay()` 1 transaksi → `Payment` WALLET/PAID + `Order.status=PAID` +
     `OrderStatusLog`; potong saldo atomik (`updateMany balance>=amount`); double-pay ditolak
     via `paymentNumber=PAY-{orderNumber}` unik + guard status.
   - **Order flow home jadi NYATA**: `location_page` muat outlet API; `location_detail_page`
     muat ServicePrice → kartu mesin (machineType/capacityKg/estimateMinutes); checkout
     `createOrder` nyata; mesin membawa `serviceId`+`outletId`.
2. **Promo UI dari API** (item 8, 15) ✅: `home_page` carousel + `promo_page` pakai
   `CustomerController.promos`; `loadDashboard` dipanggil di `HomeScreen.initState`.
   `_PromoData`/`_promos`/`_vouchers` hardcoded dihapus.
3. **Voucher bayar nyata** (item 10) ✅: `_onApplyVoucher` → `POST /promos/validate`
   (CustomerService/Controller.validatePromo); `promoCode` dikirim ke `/orders` (diskon
   dihitung server, total final dari `CreatedOrder.totalAmount`).

> Verifikasi curl (member.1): saldo 350k → order 57k → bayar → saldo 293k, Payment WALLET/PAID,
> Order PAID; double-pay 409; voucher WELCOME20 diskon 20% (order 57k→diskon 11.4k→45.6k);
> kode ngawur 404; saldo kurang 400. BE `tsc` clean, mobile `flutter analyze` clean.
>
> Sisa (di luar Fase 0): bayar QRIS/VA masih halaman mock (hanya saldo yang nyata);
> status ketersediaan per-mesin masih kosmetik (semua "tersedia") → jadi nyata di Fase 4.

## 🟢 Fase 1 — Occupancy (item 3)  ✅ SELESAI (2026-06-02)
Keputusan owner: **keduanya** (field register + section persona di home).
- BE: `Customer.occupation String?` + migration `add_customer_occupation`; `RegisterDto`
  `@IsIn(['Pekerja','Anak Kos','Ibu Rumah Tangga','Laundry Kiloan'])`; disimpan di register;
  `/auth/me` mengekspos `customer.occupation` (terverifikasi).
- Mobile: dropdown "Kategori (opsional)" di step Lengkapi Data (`_OccupationDropdown`),
  threading `RegistrationDraft.occupation` → `completeRegistration` → `register`;
  `CustomerProfile.occupation` di-parse; **section persona di home** (`_PersonaTile`,
  4 kategori, highlight sesuai `customer.occupation`, ketuk → tab Lokasi).
- Catatan: occupation OPSIONAL (tidak memblok registrasi); label home & nilai BE harus sama persis.

## 🟡 Fase 2 — Konten dikelola admin  ✅ SELESAI & TERVERIFIKASI (2026-06-02)
4. **Pop-up ads & carousel** (item 6, 16) ✅
   - BE: model `AppBanner` (enum `BannerPlacement` HOME_POPUP/HOME_CAROUSEL, imageUrl, linkUrl,
     ctaLabel, sortOrder, isActive, startDate/endDate) + migration `add_app_banner`; module
     `banners` — `GET /banners/active?placement=` (publik, filter aktif+periode), CRUD admin
     (Roles SUPER_ADMIN/OWNER).
   - Admin Nuxt: halaman **Banner & Pop-up Ads** (`app/pages/banners/index.vue`) + nav; tipe
     `AppBanner`/`BannerPlacement`; class `.dc-pill`.
   - Mobile: `CustomerService.getBanners`; `CustomerController` muat carousel+popup di
     `loadDashboard`; **pop-up sekali/sesi** saat masuk (`_BannerPopupDialog`, `markPopupShown`);
     **carousel home** dari HOME_CAROUSEL (fallback ke promo bila kosong); `url_launcher` untuk
     buka link/CTA.
5. **Promo review Google** (item 4) ✅: direalisasikan via **HOME_POPUP berlink** — admin buat
   pop-up dengan `linkUrl` ke ulasan Google + `ctaLabel` (mis. "Beri Ulasan"); tombol CTA di
   pop-up membuka link. Tidak butuh mekanisme terpisah.

> Verifikasi curl (owner+member.1): create carousel/popup/inactive; `active?placement=HOME_CAROUSEL`
> →1 (inactive tersaring), `HOME_POPUP`→popup Google review (link+cta); customer create banner 403.
> BE tsc clean; mobile flutter analyze clean; admin nuxi typecheck: halaman banner 0 error
> (error lain pre-existing). Catatan: banner uji tertinggal di DB dev (sengaja, untuk demo).

## 🟠 Fase 3 — Review/Feedback (item 13, 17)  ✅ SELESAI & TERVERIFIKASI (2026-06-02)
- BE: model `Review` (orderId @unique, customerId, staffUserId?, kioskSessionId?, rating 1-5,
  comment, source APP/KIOSK, isFocused) + enum `ReviewSource` + migration `add_reviews`;
  relasi balik di User(`StaffReviews`)/Customer/Order. Module `reviews`: `POST /reviews`
  (auth, customerId dari user login, 1 ulasan/order), `GET /reviews` (admin, filter
  rating/isFocused/source), `GET /reviews/focused` (publik), `GET /reviews/stats` (admin),
  `GET /reviews/order/:id`, `PATCH /reviews/:id/focus` (admin, kurasi = item 17).
- Mobile: form ulasan di akhir bayar (`_ReviewCard` di order_success_page — bintang 1-5 +
  komentar → `POST /reviews`; state "terima kasih"); orderId diteruskan dari jalur bayar saldo.
- Admin Nuxt: halaman **Ulasan & Feedback** (`pages/reviews`) — stats (avg/total/distribusi),
  filter rating + "hanya difokuskan", toggle Fokuskan/Lepas + nav.
- Catatan: `staffUserId` masih null (binding staff shift menyusul di Fase 5). source KIOSK
  didukung endpoint tapi UI kiosk di luar repo mobile ini.

> Verifikasi curl: submit review (rating 5 → order), double-review 409, customer akses admin 403,
> stats avg 5/dist{5:1}, toggle focus true, GET focused → 1. BE tsc + flutter analyze clean;
> admin typecheck halaman reviews/banners 0 error.

## 🟠 Fase 5 — Staff kiosk & member dashboard  ✅ SELESAI & TERVERIFIKASI (2026-06-02)
6. **Staff kiosk / atribusi staff** (item 12) ✅
   - BE: `KioskSession.staffUserId` + `Order.staffUserId` (+relasi User, migration
     `add_staff_attribution`); session start & createOrder terima `staffUserId`; **review
     auto-derive `staffUserId`** dari `order.staffUserId` atau sesi kiosk (menutup loop Fase 3);
     `GET /reports/staff` agregasi penjualan (count+revenue) & ulasan (avg+count) per staff.
   - Admin Nuxt: halaman **Kinerja Staff** (`pages/staff-performance`) + nav.
   - Catatan: kiosk frontend di luar repo; atribusi via field `staffUserId` pada order/sesi.
7. **Member dashboard** (item 14) ✅
   - BE: `GET /customers/:id/stats` (totalOrders, completedOrders, totalSpending, favoriteService).
   - Mobile: `getMemberStats` + `CustomerController.stats` (dimuat di loadDashboard); halaman
     **Dashboard Member** (`member_dashboard_page`) — saldo+top up, statistik order, riwayat
     transaksi saldo, riwayat order, voucher/promo; entry dari halaman Akun.

> Verifikasi curl: order ber-staff → review auto-bind "Operator Washer"; `/reports/staff`
> (1 order, Rp57k, 1 ulasan, rating 4); `/customers/:id/stats` (7 order, Rp244k, favorit
> "Cuci Sepatu"). BE tsc + flutter analyze clean; admin typecheck halaman baru 0 error.

## 🔴 Fase 4 — Booking & verifikasi mesin (item 11)  ✅ SELESAI & TERVERIFIKASI (2026-06-02)
- BE: model `MachineBooking` (deviceId, customerId, bookingCode unik, status RESERVED/IN_USE/
  DONE/CANCELLED/EXPIRED, expiry 15 mnt, orderId?) + enum `BookingStatus` + migration
  `add_machine_bookings`. Module `bookings`: `POST /bookings` reserve (kunci mesin, by
  deviceId/deviceCode), **`POST /bookings/verify`** (scan QR → hanya pemesan boleh → IN_USE +
  unlock; non-pemesan ditolak), `:id/complete` (lepas kunci), `:id/cancel`, `GET /bookings/active`.
  Integrasi IoT `sendCommand` UNLOCK/LOCK (tercatat sbg IotCommand → MQTT).
- Mobile: `scan_qr_page` jadi **scanner nyata** (`mobile_scanner`, izin CAMERA) → `verifyMachine`
  ke BE; bila mesin bebas ditawarkan **booking langsung** lalu aktivasi. Model `MachineBooking`/
  `BookingVerifyResult` + service/controller. (Mesin di location_detail tetap berbasis layanan;
  booking via alur scan.)

> Verifikasi curl (member.1 vs member.2 di WS-01): reserve→RESERVED; member.2 reserve→409;
> member.2 verify→403 (bukan pemesan); member.1 verify→IN_USE "Mesin terbuka"; saat IN_USE
> member.2 verify→403; complete→DONE; setelah bebas member.2 verify→400; IoT UNLOCK+LOCK tercatat.
> BE tsc + flutter analyze clean.

---

## ✅ SEMUA FASE SELESAI (0–5 + 4) per 2026-06-02
Branch `feat/fase0-wallet-order-integrasi`. Seluruh 17 item gap awal tertangani.
Catatan sisa (non-blocking): bayar QRIS/VA masih mock (hanya saldo nyata); ketersediaan
per-mesin di UI location_detail kosmetik (booking nyata via scan); kiosk frontend di luar repo.

---

## 🔧 Perbaikan & Integrasi Lanjutan (2026-06-02, setelah semua fase)

- **Seed dummy lengkap** (`f84db93`): occupation 5 member, atribusi staff di 12 order +
  3 kiosk session, 3 review (terikat staff, 2 difokuskan), 3 banner, 2 booking
  (WS-01 dibiarkan bebas untuk uji). `cleanTransactionalData` hapus review/banner/booking.
- **Integrasi Promo ↔ Banner** (`fbc62b7`): `AppBanner.promoId` (relasi Promo) + migration
  `link_banner_to_promo`; `/banners*` sertakan `promo {code,name,bannerUrl}`. Admin: form banner
  punya select "Promo terkait" + chip di kartu. Mobile: carousel tampil chip "Pakai kode X",
  ketuk banner ber-promo → salin kode + buka tab Promo; pop-up ber-promo → tombol "Salin Kode X".
  Loop ke checkout Fase 0 (kode dipakai di voucher).
- **Fix data dashboard kosong setelah login** (akar masalah "promo/banner/saldo tidak muncul"):
  - `65678e0`: `loadDashboard` resilient — tiap fetch mandiri (`_guard`), gagal satu tak
    mengosongkan lainnya.
  - `854d912`: `AuthService.login` hydrate via `/auth/me` (respons `/auth/login` tak punya
    `customer` → sebelumnya `user.customer` null → loadDashboard berhenti di awal).
  - `9d1ad01`: `CustomerController` jadi `ChangeNotifierProxyProvider<AuthController,_>` —
    `syncFromAuth` auto-muat dashboard begitu profil customer siap (tak tergantung timing
    initState); pop-up tampil reaktif; halaman Promo punya tombol "Muat ulang".
- **Form admin promo/banner lebih efektif** (`9d1ad01`): promo — tipe Cashback, petunjuk nilai
  dinamis + suffix %/Rp, nilai non-aktif untuk Gratis Ongkir, preview banner; banner — preview
  gambar + auto-isi judul dari promo tertaut.

> Catatan uji UI: perubahan provider di `main.dart` butuh **rebuild penuh** (`flutter run`
> ulang, bukan hot reload). Pastikan BE terkini + `prisma db seed`, lalu **login ulang**.

Commit lengkap di branch: `263a0e0 F0 · ebe2831 F1 · a8445ab F2 · 5378e73 F3 · 73bd942 F5 ·
ebd1ab3 F4 · f84db93 seed · 65678e0 · fbc62b7 · 854d912 · 9d1ad01`.

---

## 🔵 Update Integrasi Operasional (2026-06-11)

### Mobile customer
- **Saldo dan top-up diperbaiki**: wallet customer lama dibuat otomatis bila belum memiliki
  row wallet; saldo home/top-up dimuat dari API dan endpoint mengarah ke
  `/wallets/customer/:customerId/topup`.
- **Menu Order memakai data backend**: order dan booking aktif/riwayat tidak lagi memakai
  data mock. Data dimuat ulang setelah booking/order dan mendukung pull-to-refresh.
- **Detail order disatukan ke menu Order** agar status, layanan, outlet, jadwal, total, dan
  tindakan refund memakai model backend yang sama.
- **Refund customer**: order berstatus PAID dapat diajukan refund ke wallet dengan alasan;
  saldo dan daftar order diperbarui setelah refund berhasil.

### Backend dan admin
- **Refund tervalidasi server**: refund hanya untuk order PAID milik customer terkait,
  idempotent terhadap refund ganda, mengubah order menjadi REFUNDED, menambah saldo secara
  atomik, dan mencatat transaksi/status log.
- **Refund admin** tersedia dari menu Transaksi/Order dan Kelola Member untuk
  SUPER_ADMIN/OWNER/ADMIN_OUTLET. ADMIN_OUTLET dibatasi ke outlet penugasannya.
- Test wallet diperluas untuk ownership, otorisasi outlet, refund ganda, dan perubahan saldo.

### Kiosk Flutter
- Aplikasi baru `laundry_kiosk_flutter` menggunakan tampilan portrait 9:16 dan alur
  self-service: welcome → pilih layanan → keranjang → konfirmasi → nomor pesanan.
- **Device enrollment menggantikan login staff**:
  - Admin membuat kode 6 digit sekali pakai dari **Kelola Outlet → Kelola Kiosk**.
  - Kode berlaku 10 menit dan menghasilkan device token yang hanya disimpan dalam bentuk hash
    di backend.
  - Android/desktop menyimpan token melalui secure storage; web memakai browser localStorage
    melalui conditional import.
  - Restart atau jadwal OFF tidak melepas enrollment.
- **Runtime kiosk**: bootstrap otomatis, heartbeat 30 detik, runtime session dibuat ulang saat
  perangkat aktif, revoke hanya dari admin, dan order kiosk memakai device token khusus.
- **Jadwal operasional per kiosk**: hari, jam buka/tutup, dan timezone dikelola dari outlet.
  Di luar jadwal kiosk menampilkan layar tutup dan aktif kembali otomatis.
- Migration: `20260611170000_add_kiosk_enrollment`.

### Verifikasi
- Backend: Prisma schema valid, production build berhasil, **38 test lulus**.
- Admin Nuxt: production build berhasil.
- Mobile Flutter: perubahan terkait lolos analyzer pada sesi implementasi.
- Kiosk Flutter: analyzer, widget test, dan web build berhasil.
- Endpoint enrollment telah diverifikasi aktif setelah migration dan restart backend:
  `/api/v1/kiosks/:id/enrollment-code`.

---

## 🎯 Cetak Biru Loyalty & Retensi (2026-06-16, konsep owner)

> Perluasan dari keputusan awal (baris 16 "tanpa poin/tier") — owner kini ingin program
> loyalty/retensi penuh. Dokumen ini = peta arsitektur + urutan bangun, **belum** dikerjakan
> kecuali yang ditandai. Mulai dari: **selesaikan refactor promo dulu**, lalu Voucher engine.

### Daftar program & objektif
| # | Program | Objektif utama | Sekunder | Mekanisme inti |
|---|---------|------|------|------|
| 1 | Promo (kode publik) | Revenue | Retention | diskon di checkout |
| 2 | Cashback | Retention | Frequency | balik point/saldo per transaksi |
| 3 | Top Up | Retention | Frequency | bonus saldo saat isi ulang |
| 4 | Loyalty Point | Acquisition | Activation | point per transaksi → tukar voucher/undian/barang |
| 5 | Long Time No See | Retention | Frequency | voucher setelah lama tak transaksi |
| 6 | Referral | Acquisition | Frequency | voucher utk perujuk &/atau yang dirujuk |
| 7 | Birthday Reward | Retention | Revenue | voucher saat ulang tahun |
| 8 | Anniversary | Retention | Revenue | voucher saat 1 tahun jadi member |
| 9 | Happy Hour | Frequency | Revenue | harga mesin berubah di hari/jam tertentu |
| 10 | Membership Tier | Retention | Revenue | naik tier dari *earned spending* → benefit |

### Wawasan arsitektur: 3 primitive + lapisan pemicu
Bukan 10 fitur terpisah. 6 dari 10 program ujungnya "menerbitkan voucher". Sistem terurai jadi:

**Primitive (mesin inti):**
- **A. Voucher** — benefit milik 1 customer (diskon/gratis cuci/cashback). Beda dari Promo
  (kode publik yang diketik siapa saja). Keduanya berujung memberi diskon di checkout →
  **satukan lapisan kalkulasi** (lanjutan `evaluatePromo`). Sudah ada modal: `PromoUsage`.
- **B. Loyalty Point** — saldo point + buku besar (earn cashback, redeem ke voucher/undian/
  barang). Pola mirip `Wallet`/`WalletTransaction`.
- **C. Membership Tier** — status turunan dari *earned spending*/jumlah transaksi (top-up
  TIDAK dihitung = unearned). Tier: Silver(baru) → Gold(rutin) → Platinum(loyal) → Diamond(VIP).
  Tier mengatur besar benefit (voucher bulanan, multiplier cashback, voucher khusus tier).

**Pemicu (menerbitkan ke primitive di atas):**
- Birthday / Anniversary / Long-Time-No-See → cron harian cek tanggal → terbitkan voucher
  (`Customer.birthDate` & `createdAt` sudah ada).
- Referral → voucher saat yang dirujuk daftar/transaksi pertama (butuh model Referral).
- Top Up bonus & Cashback → hook saat transaksi sukses → tambah saldo/point.
- Tier benefits → voucher bulanan + multiplier cashback + voucher khusus tier.
- **Happy Hour** → jalur berbeda: pricing dinamis harga mesin per hari/jam (bukan voucher).

### Urutan bangun
1. **Refactor Promo** (in progress) — `evaluatePromo` sumber kebenaran tunggal; pakai bersama
   `/promos/validate` + order flow; tegakkan minTransaction/maxUsagePerCustomer/applicable
   services+outlets; pemakaian dicatat **saat PAID** (helper `commitUsage` di `settlePaid`
   gateway + wallet-pay); kolom `Order.promoId`; diskon service-specific dihitung dari subtotal
   item yang cocok; `UpdatePromoDto` penuh.
2. **Fase A — Voucher engine** (+ unifikasi pakai `evaluatePromo`). Membuka ~6 program.
3. **Fase B — Loyalty Point** (ledger + earn cashback + redeem).
4. **Fase C — Membership Tier** (earned spending → tier → benefit).
5. **Fase D — Pemicu otomatis** (Birthday, Anniversary, LTNS, Referral via cron/hook).
6. **Fase E — Happy Hour** (dynamic machine pricing, independen).
