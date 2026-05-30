# Progress UI — Flutter (laundry_mobile_flutter)

> Terakhir diperbarui: 2026-05-30 · Status build: `flutter analyze lib/` → **0 issue**

---

## ✅ Sudah Selesai

### Fase 1 — Design System & Refactor Struktur
- **`lib/core/theme/`** — `app_colors.dart` (AppColors + PaymentBrandColors), `app_text_styles.dart`, `app_spacing.dart`, `app_theme.dart` (AppTheme.light)
- **`main.dart`** — pakai `AppTheme.light`, hapus ThemeData inline
- **`shared/widgets/app_buttons.dart`** — `AppPrimaryButton`, `AppOutlineButton`, `AppDisabledButton`
- **`home_screen.dart`** — 3043 baris → ~115 baris (root) + 15 `part` files di `home/`
- **0 warna hex inline** di seluruh `lib/`

### Fase 2 — Implementasi UI sesuai mockup Figma

#### Auth Flow ([auth_flow_screens.dart](lib/features/auth/auth_flow_screens.dart))
- Welcome screen: logo + ilustrasi (dengan fallback) + tombol Masuk/Daftar ✅
- Phone input screen: flag 🇮🇩 + kode +62 + field nomor + terms ✅
- OTP screen: 4 kotak digit + countdown resend + "Verifikasi" ✅
- Complete profile: nama, email, tanggal lahir, jenis kelamin ✅
- Upload photo: avatar besar + tombol Simpan ✅
- Semua warna lokal → `AppColors.*`; fallback asset bila file belum ada

#### Home ([home/home_page.dart](lib/features/customer/home/home_page.dart))
- Dark blue header: avatar (buka akun), logo "dicuciin", call + bell ✅
- Greeting "Selamat Datang, {nama nyata}" — dari `AuthController.user` ✅
- Wallet card: saldo + mata + Top up ✅
- Banner promo horizontal scroll ✅
- 2 service tile (Washing machine, Dryer machine) ✅
- Semua `Image.asset` punya `errorBuilder` fallback

#### Account ([home/account_page.dart](lib/features/customer/home/account_page.dart))
- Nama nyata dari `AuthController.user` ✅
- Tahun bergabung dari `DateTime.now().year` ✅
- Menu: Hubungi Kami, Ketentuan, Kebijakan, Keluar (sign out) ✅

#### Promo ([home/promo_page.dart](lib/features/customer/home/promo_page.dart))
- Header "Promo" dark blue ✅
- "Cuci Lebih Hemat Setiap Hari" + subtitle ✅
- Kartu promo: banner image + judul + deskripsi + periode ✅

#### Lokasi ([home/location_page.dart](lib/features/customer/home/location_page.dart) + [location_detail_page.dart](lib/features/customer/home/location_detail_page.dart))
- List lokasi: nama, alamat, chip mesin tersedia, chip Buka/Tutup, "Tutup Pukul 21:00 WIB", thumbnail ✅
- Detail lokasi: hero image + gradient overlay + nama + alamat + chip ✅
- Tabs Mesin Cuci | Mesin Pengering ✅
- Machine card: nama, kapasitas, estimasi, status chip (Tersedia/Digunakan/Maintenance), harga, tombol aksi ✅
- Time picker bottom sheet: header dark blue, grid waktu, "Booking Sekarang" ✅

#### Checkout & Pembayaran
- **Checkout** ([home/order_checkout_page.dart](lib/features/customer/home/order_checkout_page.dart)):
  - Summary card (mesin, detail, harga, total hijau) ✅
  - Voucher input ✅
  - Metode pembayaran: Saldo, QRIS, Virtual Account (expandable) ✅
  - VA bank list: BCA/BRI/BNI/Mandiri/BSI/CIMB — toggle expand/collapse, arrow direction benar ✅
  - Bank terpilih diteruskan ke VA page ✅
- **QRIS** ([home/payment_qris_page.dart](lib/features/customer/home/payment_qris_page.dart)):
  - Total, countdown live (5 menit), jatuh tempo ✅
  - QR placeholder + tombol "Simpan Kode QR" (nonaktif saat expired) ✅
  - Petunjuk pembayaran QRIS ✅
- **Virtual Account** ([home/payment_va_page.dart](lib/features/customer/home/payment_va_page.dart)):
  - Bank name + warna brand dinamis dari parameter ✅
  - Nomor VA + "Salin Nomor" ✅
  - Countdown live + jatuh tempo ✅
  - Petunjuk pembayaran VA ✅
- **Success** ([home/order_success_page.dart](lib/features/customer/home/order_success_page.dart)):
  - Checkmark hijau + "Pembayaran Berhasil!" ✅
  - Detail order (nomor, mesin, kapasitas, tanggal, lokasi, metode, total) ✅
  - Info jadwal penggunaan mesin + info otomatis berhenti ✅

#### Order ([home/order_page.dart](lib/features/customer/home/order_page.dart))
- Tab "Order Hari ini" | "Riwayat Order" ✅
- Kartu aktif: notifikasi + countdown sisa waktu + status "Berjalan" (orange) + Detail Order → `_OrderSuccessPage` ✅
- Kartu riwayat: status "Selesai" (hijau) + Detail Order ✅

#### Scan QR ([home/scan_qr_page.dart](lib/features/customer/home/scan_qr_page.dart))
- Latar kamera (gelap) + overlay semi-transparan ✅
- Header: back arrow + "Scan QR" ✅
- Viewfinder dengan corner marker biru ✅
- "Flash on touch" strip di bawah viewfinder ✅

#### Navigasi & Bottom Bar
- Bottom nav 5 item: Beranda · Promo · [Scan QR center FAB] · Lokasi · Order ✅
- Active item: border biru atas + icon/label biru ✅
- Scan QR: push route (bukan tab), bisa kembali ✅

### Fase 3 — Penyempurnaan UX & interaksi (sesi 2026-05-30)

#### Splash & Auth
- **Splash screen** ([shared/widgets/splash_screen.dart](lib/shared/widgets/splash_screen.dart)) — logo putih + tagline, animasi fade+slide, loading indicator. Dipasang di `main.dart` saat `AuthStatus.loading`.
- **Welcome screen** — layout dua-zona (`Expanded` scroll atas + buttons fix bawah), ilustrasi dalam frame biru muda, copyright fix di bawah, responsif semua ukuran HP.
- **Navigasi auth** — setelah login/register sukses → `pushAndRemoveUntil` ke `HomeScreen` (bug: sebelumnya tidak redirect).
- **Country picker** ([auth_flow_screens.dart](lib/features/auth/auth_flow_screens.dart)) — bottom sheet pilih negara (31 negara) + search, bendera & dial code dinamis di input nomor.
- **Persetujuan privasi** — checkbox + modal dialog "Kebijakan Privasi & Ketentuan Layanan"; tombol Lanjut aktif hanya jika nomor diisi + checkbox dicentang.
- **Validasi form lengkapi data** — validasi real-time per field (on blur + on submit): nama/email/tanggal lahir/jenis kelamin wajib, format email dicek; border + pesan error merah per field.
- **Upload foto profil** — pilih foto dari kamera/galeri (image_picker) ATAU pilih 1 dari 6 avatar warna; tombol Simpan aktif setelah ada pilihan.

#### Home
- **Greeting hierarki** — "Selamat Datang," kecil + nama user **24px bold** (anchor).
- **Header responsif** — gambar mesin 140px + gradient overlay, teks wrap natural + `maxLines`/ellipsis (aman di layar sempit Galaxy Note20).
- **Promo carousel berfungsi** — `PageView` + dots indicator interaktif (tracking posisi, bisa diklik, animasi).
- **Tidak scroll** — home pakai `ClampingScrollPhysics` + padding bawah dirampingkan; terasa fixed, tidak bounce.
- **Bottom bar konsisten** — tombol Scan QR jadi bagian internal `_MainBottomBar` (Stack), posisi identik di semua device (sebelumnya `centerDocked` FAB melayang beda-beda per device).
- **Aksi Notifikasi** ([home/notification_page.dart](lib/features/customer/home/notification_page.dart)) — list notif mock (order/promo/wallet), item unread ditandai.
- **Aksi Top Up** ([home/topup_page.dart](lib/features/customer/home/topup_page.dart)) — grid nominal + metode bayar + konfirmasi dialog → snackbar sukses.
- **Hubungi Kami** — bottom sheet kontak (WhatsApp/Email/Call Center) dari ikon telepon.

#### Promo
- Banner pakai `AspectRatio(2:1)` tetap, card reusable via parameter (title/description/period), padding & font diselaraskan.

#### Lokasi ([home/location_page.dart](lib/features/customer/home/location_page.dart))
- Padding bawah 120→24 + `ClampingScrollPhysics`, judul w700, subtitle wrap natural.
- `_LocationCard` diparameterkan (name/address/machineCount/closeTime/isOpen) + `maxLines`/ellipsis.
- 4 lokasi mock berbeda (Sudirman/Kemang/Menteng/BSD); lokasi tutup di-disable (opacity, tidak tappable).

#### Order ([home/order_page.dart](lib/features/customer/home/order_page.dart))
- Padding bawah 120→24 + `ClampingScrollPhysics`.
- `_OrderHistoryCard` diparameterkan (machineName/date); 3 riwayat mock berbeda.
- **Empty state** untuk kedua tab (Order Hari ini & Riwayat) saat list kosong — siap-backend.

#### Wallet card (home)
- **Fix bug tap**: tombol Top up sebelumnya tidak bisa diklik karena card `Positioned(bottom:-52)` keluar batas `Stack` (hit-test terpotong). Diperbaiki dengan sizing box (Stack tinggi 302) + card `bottom: 0` → seluruh card tappable.

#### Lokasi — Lanjutan polish (sesi 2026-05-30)
- **List lokasi dirapikan** ([home/location_page.dart](lib/features/customer/home/location_page.dart)) — sorting outlet buka dulu (lalu mesin terbanyak), ringkasan `x/y Buka`, info urutan outlet, spacing/typing lebih rapi.
- **`_LocationCard` redesign** ([home/home_widgets.dart](lib/features/customer/home/home_widgets.dart)) — dari fixed-height ke layout fleksibel (`IntrinsicHeight`), chip pakai `Wrap`, jam tutup + ikon jam, `Material + InkWell` untuk touch feedback.
- **Detail lokasi dirombak** ([home/location_detail_page.dart](lib/features/customer/home/location_detail_page.dart)) — header hero jadi `AspectRatio 16:9` + overlay lebih kuat, card ringkasan (mesin aktif/tutup/status), tab mesin style kapsul konsisten.
- **Machine card visual polish** ([home/home_widgets.dart](lib/features/customer/home/home_widgets.dart)) — status chip pindah ke header card, detail mesin dipisah ke panel info, hierarki harga/aksi diperjelas.
- **State mesin siap-backend** ([home/location_detail_page.dart](lib/features/customer/home/location_detail_page.dart)) — `loading` (skeleton), `error` (retry), `empty` (empty state + reload), `loaded` (list mesin).
- **Booking antrian berfungsi** ([home/home_widgets.dart](lib/features/customer/home/home_widgets.dart), [home/location_detail_page.dart](lib/features/customer/home/location_detail_page.dart)) — `_BookingSheet` jadi stateful: slot waktu bisa dipilih (slot penuh di-disable), tombol `Booking Sekarang` nonaktif sampai ada slot terpilih. Setelah konfirmasi → dialog "Antrian Dibooking" (nama mesin + slot). `_TimeButton` kini tappable (InkWell). Sebelumnya tombol booking hanya menutup sheet tanpa aksi.

#### Checkout & Payment — Lanjutan polish (sesi 2026-05-30)
- **Checkout layout** ([home/order_checkout_page.dart](lib/features/customer/home/order_checkout_page.dart)) — section title + subtitle, sticky bottom pay bar (`Total Bayar` + `Bayar Sekarang`), payment rows lebih informatif.
- **Form promo disesuaikan** ([home/order_checkout_page.dart](lib/features/customer/home/order_checkout_page.dart)) — input kode promo (uppercase), tombol `Terapkan/Ubah`, badge `Aktif: <kode>`, opsi `Hapus voucher`, status sinkron saat isi diubah.
- **Perbaikan alur metode bayar** — jika metode **Saldo**, bayar langsung ke success (tidak redirect ke QRIS). VA tetap ke halaman VA, QRIS tetap ke halaman QRIS.
- **Halaman QRIS refresh** ([home/payment_qris_page.dart](lib/features/customer/home/payment_qris_page.dart)) — summary + countdown chip, QR card, aksi `Simpan Kode QR`/`Muat Ulang Kode` saat expired, bottom bar aksi (`Ganti Metode` + `Saya Sudah Bayar`).
- **Halaman VA refresh** ([home/payment_va_page.dart](lib/features/customer/home/payment_va_page.dart)) — summary + countdown chip, card nomor VA terstruktur, tombol `Salin Nomor` (clipboard + snackbar), bottom bar aksi seragam.
- **Order success refresh** ([home/order_success_page.dart](lib/features/customer/home/order_success_page.dart)) — 2 card terpisah (ringkasan pembayaran + jadwal penggunaan), total hijau, sticky bottom action (`Lihat Order` / `Selesai`).
- **Segmented control upgrade** ([home/home_widgets.dart](lib/features/customer/home/home_widgets.dart), [home/order_page.dart](lib/features/customer/home/order_page.dart), [home/location_detail_page.dart](lib/features/customer/home/location_detail_page.dart)) — active state pill + animasi halus, visual konsisten di Order & Detail Lokasi.

#### Checkout — Data order mengalir ke seluruh alur (sesi 2026-05-30)
- **Model `_CheckoutData`** ([home/home_models.dart](lib/features/customer/home/home_models.dart)) — bawa data mesin terpilih (nama, tipe, kapasitas, estimasi, harga, lokasi, no order, tanggal) dari pilih mesin → checkout → pembayaran → sukses. Tidak ada lagi `Rp 20.000` hardcoded di empat halaman.
- **`_MachineData` diperkaya** — tambah `type`/`capacity`/`estimasi`/`price`; tiap mesin mock punya kapasitas & harga berbeda, tampil di machine card & ringkasan checkout.
- **Helper bersama** — `_formatRupiah(int)`, `_formatDateId(DateTime)` (tanggal Bahasa Indonesia), `_voucherDiscount(code, price)`.
- **Voucher berfungsi nyata** ([home/order_checkout_page.dart](lib/features/customer/home/order_checkout_page.dart)) — kode `HEMAT5K` (−Rp5.000), `CUCIHEMAT` (−Rp3.000), `DISKON25` (−25%); kode tak dikenal → snackbar "tidak berlaku". Diskon mengurangi total real-time di summary card + bottom pay bar.
- **Total konsisten** — total (harga − diskon) diteruskan ke QRIS/VA/Success; metode bayar tampil benar di halaman sukses (`Saldo`/`QRIS`/`Virtual Account <bank>`).
- **Detail order dari tab Order** ([home/order_page.dart](lib/features/customer/home/order_page.dart)) — kartu aktif & riwayat kirim `_CheckoutData` (nama mesin + tanggal) ke halaman sukses.

#### Order & Detail Order — halaman khusus (sesi 2026-05-30)
- **Model `_OrderItem`** ([home/home_models.dart](lib/features/customer/home/home_models.dart)) — order tunggal (no order, mesin, kategori, kapasitas, estimasi, lokasi, harga, metode, tanggal, `_OrderStatus`, jadwal, sisa waktu). `_OrderStatus` (running/done) + `.label`.
- **Tab Order data-driven** ([home/order_page.dart](lib/features/customer/home/order_page.dart)) — `_todayOrders` & `_historyOrders` jadi `List<_OrderItem>` (3 riwayat beda mesin/lokasi/metode); kartu aktif & riwayat render dari item (tidak ada lagi field hardcoded di card).
- **`_OrderActiveCard`/`_OrderHistoryCard` diparameterkan** ([home/home_widgets.dart](lib/features/customer/home/home_widgets.dart)) — terima `_OrderItem`, sisa waktu & status dari data.
- **Halaman Detail Order baru** ([home/order_detail_page.dart](lib/features/customer/home/order_detail_page.dart)) — **menggantikan reuse `_OrderSuccessPage` yang keliru** untuk detail. Isi: kartu status (Berjalan/Selesai + ikon/warna dinamis + banner sisa waktu saat berjalan), kartu rincian order lengkap (total hijau), kartu jadwal penggunaan + info auto-stop (hanya saat berjalan). Bottom bar: tombol `Kembali` (scan QR mesin sengaja tidak dipakai — aktivasi mesin nanti lewat alur backend IoT, bukan dari detail order yang sudah berjalan).

#### Wallet PIN (sesi 2026-05-30)
- **`WalletController`** ([customer/wallet_controller.dart](lib/features/customer/wallet_controller.dart)) — state wallet in-memory (mock): saldo, PIN, `setPin`/`verifyPin`/`canPay`/`pay`/`topUp`. Didaftarkan di `MultiProvider` ([main.dart](lib/main.dart)).
- **Widget PIN reusable** ([shared/widgets/pin_pad.dart](lib/shared/widgets/pin_pad.dart)) — `PinDots` (indikator 6 titik) + `PinKeypad` (keypad numerik). Dipakai di register & pembayaran.
- **Buat PIN saat register** ([auth/auth_flow_screens.dart](lib/features/auth/auth_flow_screens.dart)) — `CreatePinScreen` jadi langkah terakhir register (setelah upload foto): input 6 digit → konfirmasi ulang → `WalletController.setPin` → `signInPreview` → Home. Validasi "PIN tidak cocok".
- **Masukkan PIN saat bayar wallet** ([home/wallet_pin_sheet.dart](lib/features/customer/home/wallet_pin_sheet.dart), [home/order_checkout_page.dart](lib/features/customer/home/order_checkout_page.dart)) — metode Saldo: cek `hasPin` + `canPay` → bottom sheet `_WalletPinSheet` verifikasi PIN → saldo dipotong (`pay`) → halaman sukses. PIN salah → error + reset.
- **Saldo nyata di UI** — kartu wallet home ([home/home_page.dart](lib/features/customer/home/home_page.dart)) & baris Saldo di checkout baca `WalletController.balance`; Top Up ([home/topup_page.dart](lib/features/customer/home/topup_page.dart)) menambah saldo betulan. Pembayaran wallet mengurangi saldo → terlihat langsung.
- **Atur/Ubah PIN dari Akun** ([home/wallet_pin_settings_page.dart](lib/features/customer/home/wallet_pin_settings_page.dart), [home/account_page.dart](lib/features/customer/home/account_page.dart)) — menu "Buat/Ubah PIN Wallet" (label dinamis sesuai `hasPin`). Belum ada PIN → buat (input + konfirmasi); sudah ada → verifikasi PIN lama → input baru → konfirmasi. Jadi user yang masuk lewat OTP login bisa set PIN sendiri.
- **Checkout tanpa PIN** — bila bayar wallet tapi belum ada PIN, muncul dialog ajakan "Buat PIN" → langsung ke halaman atur PIN.

---

## 🟡 Ditunda / Follow-up

- [ ] **Sambungkan ke backend** — semua layar masih pakai data mock/hardcoded. Perlu sambungkan ke `CustomerController` + API nyata (outlet, mesin IoT, order, promo, wallet).
- [ ] **Dedup alur order** — `_OrderCheckoutPage` (mock) vs `create_order_screen.dart` (nyata). Pilih satu dan hapus yang lain.
- [ ] **Asset nyata** — logo `assets/branding/logo_dicuciin.png`, ilustrasi, foto lokasi. Saat ini pakai fallback.
- [ ] **OTP backend** — endpoint generate/verify OTP belum ada di backend. Saat ini login via `signInPreview()` (bypass).
- [ ] **Top up & notifikasi** — `_TopUpPage._confirm()` sudah menambah saldo lokal (`WalletController.topUp`) tapi belum lewat API/pembayaran nyata; `_NotificationPage` masih data hardcoded. Sambungkan ke API wallet & notifikasi.
- [ ] **Foto profil** — file foto/avatar yang dipilih di `UploadProfileScreen` belum dikirim/disimpan ke backend.
- [ ] **PIN wallet ke backend** — PIN & saldo masih in-memory (`WalletController`), hilang saat app ditutup. Layar Atur/Ubah PIN sudah ada (Akun), tinggal sambung simpan/verifikasi PIN + saldo ke API wallet. Pertimbangkan juga lupa-PIN & batas percobaan salah.
- [ ] **`home_widgets.dart`** masih 1100+ baris — bisa dipecah lagi jadi `home_cards.dart` + `home_atoms.dart`.
- [ ] **AppTextStyles** — masih ada `TextStyle(...)` inline di part files. Bisa dirapikan bertahap.

---

## Cara verifikasi cepat
```bash
cd laundry_mobile_flutter
flutter analyze lib/   # harus: No issues found!
flutter run            # test tampilan sesuai mockup Figma
```
