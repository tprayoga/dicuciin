# Integrasi Asset Maskot Di.Cuciin

> Dibuat: 2026-06-23 · Sumber kebenaran: `DiCuciin_assets/DiCuciin_Mascot_Usage_Assets/asset_manifest.json`
> Lingkup: integrasi aset maskot ke **UI** Mobile (Flutter), Kiosk (Flutter), dan Admin (Nuxt).
> Tidak menyentuh backend, kontrak API, database, atau flow transaksi.

---

## 1. Ringkasan Asset

- **Total aset di manifest:** 76
- **Status validasi:** semua **76 FOUND** (tidak ada MISSING).
- **Duplicate ID (lintas pack):** 2 — `pointing_right` & `holding_laundry_basket`. Aman: di konstanta Dart diberi nama berbeda (`pointingRight` vs `pointingRightNav`, `holdingLaundryBasket` vs `holdingLaundryBasketPayment`).
- Aset disalin ke 3 platform (228 file PNG total): mobile, kiosk, dan admin.

## 2. Jumlah Asset per Pack

| Pack | Jumlah |
|---|---:|
| 01_core_pose_pack | 8 |
| 02_emotion_pack | 12 |
| 03_action_pack_navigation | 8 |
| 04_action_pack_laundry_payment | 8 |
| 05_app_flow_registration_permissions | 8 |
| 06_app_flow_home_outlet_promo_history | 8 |
| 07_app_flow_scan_machine_payment | 8 |
| 08_notification_feedback_pack | 8 |
| 09_error_kiosk_pack | 8 |
| **Total** | **76** |

> Catatan: folder `00_source_sprite_sheets` (sprite sheet sumber) **tidak** disalin ke aplikasi — hanya 9 pack siap-pakai yang dipakai.

## 3. Lokasi Asset per Platform

| Platform | Folder aset | Registrasi |
|---|---|---|
| Mobile Flutter | `laundry_mobile_flutter/assets/mascot/<pack>/` | `pubspec.yaml` per-folder (9 entri) |
| Kiosk Flutter | `laundry_kiosk_flutter/assets/mascot/<pack>/` | `pubspec.yaml` per-folder (9 entri) |
| Admin Nuxt | `laundry-admin/public/mascot/<pack>/` | otomatis (served dari `/mascot/...`) |

> Flutter tidak rekursif untuk folder aset, jadi tiap pack didaftarkan eksplisit (folder-level, bukan per-file PNG).

## 4. Asset Constants yang Dibuat

| Platform | File | Class |
|---|---|---|
| Mobile | `laundry_mobile_flutter/lib/core/assets/app_mascot_assets.dart` | `AppMascotAssets` |
| Kiosk | `laundry_kiosk_flutter/lib/src/core/assets/kiosk_mascot_assets.dart` | `KioskMascotAssets` |

- 76 konstanta `static const String` (path `assets/mascot/...`), dikelompokkan per pack, dengan doc-comment deskripsi dari manifest.
- Tersedia `static const List<String> all` untuk validasi/preview.
- **Tidak ada hardcode path di screen** — semua screen merujuk konstanta.

## 5. Widget / Component yang Dibuat

| Platform | File | Nama | Catatan |
|---|---|---|---|
| Mobile | `lib/shared/widgets/mascot_message_card.dart` | `MascotMessageCard` (+ enum `MascotMessageVariant`) | Kartu pesan + maskot, 11 varian, `compact`/`fullWidth`, CTA primer/sekunder, `errorBuilder` fallback |
| Kiosk | `lib/src/shared/widgets/kiosk_mascot_panel.dart` | `KioskMascotPanel` | Panel maskot landscape-safe, `large`/`showCard`, `errorBuilder` fallback |
| Admin | `app/components/common/MascotEmptyState.vue` | `CommonMascotEmptyState` | Empty-state ringan; gambar `onerror` disembunyikan |

Aturan desain yang diterapkan:
- Maskot = *helper*, bukan pengganti informasi/CTA. CTA tetap dominan.
- Warna mengikuti token brand (`AppColors` di mobile; konstanta brand selaras di kiosk).
- Semua gambar punya fallback (`errorBuilder` / `@error`) agar tidak crash bila aset hilang.
- Aman di layar kecil (mobile) dan landscape (kiosk) — teks membungkus, ukuran gambar terbatas.

## 6. Mapping Screen → Asset (Mobile)

| Platform | Screen | State | Asset ID | File | Status |
|---|---|---|---|---|---|
| Mobile | Promo Tersedia | empty promo | promo_empty_waiting | 06_.../08_promo_empty_waiting.png | DONE |
| Mobile | Payment Success / Order Success | success | payment_success_basket_confetti | 08_.../01_payment_success_basket_confetti.png | DONE |
| Mobile | Onboarding / Register | welcome | registration_welcome_waving | 05_.../01_registration_welcome_waving.png | AVAILABLE |
| Mobile | OTP Verification | input OTP | otp_verification_phone | 05_.../03_otp_verification_phone.png | AVAILABLE |
| Mobile | OTP Error | wrong OTP | otp_wrong_confused_phone | 05_.../04_otp_wrong_confused_phone.png | AVAILABLE |
| Mobile | Home Dashboard | first-time guide | homepage_scan_guide | 06_.../01_homepage_scan_guide.png | AVAILABLE |
| Mobile | Wallet | balance helper | wallet_balance_helper | 06_.../02_wallet_balance_helper.png | AVAILABLE |
| Mobile | Wallet | saldo rendah | holding_wallet | 04_.../01_holding_wallet.png | AVAILABLE |
| Mobile | Voucher Saya | empty voucher | promo_empty_waiting | 06_.../08_promo_empty_waiting.png | AVAILABLE |
| Mobile | History | empty transaction | empty_history_sitting | 06_.../03_empty_history_sitting.png | AVAILABLE |
| Mobile | Scan QR | start scan | scan_qr_start | 07_.../01_scan_qr_start.png | AVAILABLE |
| Mobile | Scan QR | unreadable QR | scan_qr_unreadable | 07_.../02_scan_qr_unreadable.png | AVAILABLE |
| Mobile | Machine Detail | ready | machine_ready_thumbs_up | 07_.../04_machine_ready_thumbs_up.png | AVAILABLE |
| Mobile | Machine Detail | offline | machine_offline_cable | 07_.../03_machine_offline_cable.png | AVAILABLE |
| Mobile | Machine Detail | running | machine_running_waiting | 07_.../05_machine_running_waiting.png | AVAILABLE |
| Mobile | Checkout | payment processing | payment_processing_terminal | 07_.../07_payment_processing_terminal.png | AVAILABLE |
| Mobile | Payment Failed | failed | payment_failed_receipt | 07_.../08_payment_failed_receipt.png | AVAILABLE |
| Mobile | No Internet | offline | error_no_internet | 09_.../01_error_no_internet.png | AVAILABLE |
| Mobile | Server Error | maintenance | error_server_maintenance | 09_.../02_error_server_maintenance.png | AVAILABLE |
| Mobile | Empty Page | empty state | empty_page_sweeping | 09_.../03_empty_page_sweeping.png | AVAILABLE |

## 7. Mapping Screen → Asset (Kiosk)

| Platform | Screen | State | Asset ID | File | Status |
|---|---|---|---|---|---|
| Kiosk | Welcome / Idle | idle | kiosk_idle_cleaning | 09_.../05_kiosk_idle_cleaning.png | DONE |
| Kiosk | Payment Success | success | payment_success_basket_confetti | 08_.../01_payment_success_basket_confetti.png | DONE |
| Kiosk | Kiosk Tutup (Closed) | closed | sleeping | 02_.../06_sleeping.png | DONE |
| Kiosk | Fast Login | scan QR member | kiosk_fast_login_qr | 09_.../06_kiosk_fast_login_qr.png | AVAILABLE |
| Kiosk | Guest Checkout | guest mode | kiosk_guest_checkout | 09_.../07_kiosk_guest_checkout.png | AVAILABLE |
| Kiosk | PIN Confirmation | security | kiosk_pin_confirmation_security | 09_.../08_kiosk_pin_confirmation_security.png | AVAILABLE |
| Kiosk | Machine Selection | ready | machine_ready_thumbs_up | 07_.../04_machine_ready_thumbs_up.png | AVAILABLE |
| Kiosk | Machine Selection | offline | machine_offline_cable | 07_.../03_machine_offline_cable.png | AVAILABLE |
| Kiosk | Checkout Summary | payment guide | payment_processing_terminal | 07_.../07_payment_processing_terminal.png | AVAILABLE |
| Kiosk | Payment Waiting | waiting | waiting | 02_.../07_waiting.png | AVAILABLE |
| Kiosk | Payment Failed | failed | payment_failed_receipt | 07_.../08_payment_failed_receipt.png | AVAILABLE |
| Kiosk | No Internet | offline | error_no_internet | 09_.../01_error_no_internet.png | AVAILABLE |
| Kiosk | Server Maintenance | maintenance | error_server_maintenance | 09_.../02_error_server_maintenance.png | AVAILABLE |

## 8. Mapping Screen → Asset (Admin)

| Platform | Screen | State | Asset ID | File | Status |
|---|---|---|---|---|---|
| Admin | Customers | empty member | empty_page_sweeping | 09_.../03_empty_page_sweeping.png | DONE |
| Admin | Orders | empty order | empty_page_sweeping | 09_.../03_empty_page_sweeping.png | AVAILABLE |
| Admin | Marketing / Promo | empty promo | promo_empty_waiting | 06_.../08_promo_empty_waiting.png | AVAILABLE |
| Admin | Promotion-Loyalty | empty voucher | promo_empty_waiting | 06_.../08_promo_empty_waiting.png | AVAILABLE |
| Admin | Reports / Finance | no data | empty_history_sitting | 06_.../03_empty_history_sitting.png | AVAILABLE |
| Admin | Dashboard | no data | empty_history_sitting | 06_.../03_empty_history_sitting.png | AVAILABLE |

## 9. Screen yang Sudah Terintegrasi

- **Mobile:** Promo (empty state), Order/Payment Success (maskot sukses).
- **Kiosk:** Welcome/Idle (maskot idle di lingkaran ilustrasi), Success (maskot sukses), Closed (maskot tidur via `KioskMascotPanel`).
- **Admin:** Customers (empty state via `CommonMascotEmptyState`).

## 10. Screen yang Belum Terintegrasi (status AVAILABLE)

Semua aset + konstanta + komponen sudah siap, namun screen berikut **sengaja belum di-wire** untuk menjaga flow berjalan tetap aman (cukup tambahkan widget/komponen sesuai mapping di atas):
- Mobile: OTP, register welcome, home first-time guide, wallet helper/saldo rendah, voucher kosong, history kosong, scan QR (start/gagal), machine detail (ready/offline/running), checkout processing, payment failed, no internet, server error.
- Kiosk: fast login, guest checkout, PIN confirmation, machine selection (ready/offline), checkout summary, payment waiting/failed, no internet, server maintenance.
- Admin: orders/promo/voucher/report/dashboard empty states.

## 11. Risiko

- **Ukuran aset:** PNG maskot menambah ukuran bundle aplikasi (228 file lintas 3 platform). Pertimbangkan kompresi/`WebP` bila ukuran jadi isu.
- **Duplikasi penyimpanan:** aset disalin ke tiap platform (bukan shared package). Bila ada revisi desain, perlu sinkron ulang ke 3 lokasi.
- **Penamaan duplicate ID:** dua ID muncul di dua pack; pastikan engineer memakai konstanta yang benar (lihat catatan §1).
- **Konsistensi warna kiosk:** kiosk belum punya kelas token terpusat; `KioskMascotPanel` mendefinisikan konstanta brand lokal yang harus dijaga selaras bila brand berubah.

## 12. Rekomendasi untuk Designer

- Pertimbangkan menyediakan varian **@2x/@3x** atau **WebP** untuk efisiensi.
- Tetapkan panduan: 1 maskot per layar, ukuran maksimal, dan kapan maskot **tidak** dipakai (agar admin tetap profesional).
- Bila ada revisi maskot, jaga **path & id** tetap sama agar tidak perlu ubah kode (cukup ganti file PNG).
- Lengkapi aset yang mungkin perlu di masa depan: ilustrasi kosong khusus per modul admin (saat ini reuse `empty_page_sweeping`).

---

## 13. Update Wiring 2026-06-23 (lanjutan Phase 1–4)

Status berubah **AVAILABLE → DONE** (detail di [mascot-wiring-phase-2-report.md](mascot-wiring-phase-2-report.md)):

**Mobile (DONE baru):** Top Up (balance helper), Member Dashboard voucher kosong, Pembayaran QRIS error, Pembayaran VA error, Order riwayat kosong, Welcome/Onboarding, OTP (verifikasi & salah OTP state-aware), Machine list error/offline.

**Kiosk (DONE baru):** Machine list kosong/error (`RefreshableEmpty` → `KioskMascotPanel`).

**Admin (DONE baru):** Orders kosong, Marketing/Promo kosong, Promotion-Loyalty voucher kosong, Reports/Finance no data, Dashboard no data.

**Masih AVAILABLE / sengaja dilewati (alasan di laporan):** mobile saldo rendah (snackbar), checkout processing (state tombol), scan QR (layar kamera), home first-time guide (tak ada state), machine ready/running (status per-kartu); kiosk fast-login/guest-checkout/PIN (tidak ada stage), payment waiting/failed & checkout summary (layar padat); layar no-internet/server khusus (tidak ada di app).

**Verifikasi terbaru:** mobile `flutter analyze` ✅ + `flutter test` ✅; kiosk `flutter analyze` ✅ + `flutter test` ✅; admin `npm run build` ✅. Tidak ada hardcoded path aset di screen Flutter.
