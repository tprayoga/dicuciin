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

## 🟠 Fase 3 — Review/Feedback (item 13, 17)
- BE: model `Review` (orderId, customerId, staffUserId?, kioskSessionId?, rating, comment, isFocused, source APP/KIOSK) + endpoints.
- Mobile & Kiosk: form review di akhir bayar.
- Admin: kurasi review + toggle "fokuskan".

## 🟠 Fase 5 — Staff kiosk & member dashboard
6. **Staff kiosk** (item 12): `KioskSession.staffUserId` + login/PIN staff + laporan penjualan/review per staff.
7. **Member dashboard** (item 14): endpoint ringkasan (saldo+transaksi, voucher member, riwayat & statistik order) + halaman mobile.

## 🔴 Fase 4 — Booking & verifikasi mesin (item 11)
- BE: model `MachineBooking` (iotDeviceId, customerId, kode/QR, status RESERVED→IN_USE→DONE, expiry) + lock mesin.
- IoT: command lock/unlock via MQTT.
- Mobile: `scan_qr_page` jadi scanner nyata → cocokkan QR mesin dgn booking user.
