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
