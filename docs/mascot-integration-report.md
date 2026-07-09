# Laporan Integrasi Maskot Di.Cuciin

> Dibuat: 2026-06-23 · Pendamping: [mascot-asset-integration.md](mascot-asset-integration.md)
> Batasan dipatuhi: tanpa perubahan backend, kontrak API, database, atau flow transaksi.

---

## 1. File yang Dibuat

| File | Keterangan |
|---|---|
| `laundry_mobile_flutter/lib/core/assets/app_mascot_assets.dart` | Konstanta path maskot (mobile), 76 entri |
| `laundry_mobile_flutter/lib/shared/widgets/mascot_message_card.dart` | Widget `MascotMessageCard` + enum varian |
| `laundry_kiosk_flutter/lib/src/core/assets/kiosk_mascot_assets.dart` | Konstanta path maskot (kiosk), 76 entri |
| `laundry_kiosk_flutter/lib/src/shared/widgets/kiosk_mascot_panel.dart` | Widget `KioskMascotPanel` |
| `laundry-admin/app/components/common/MascotEmptyState.vue` | Komponen `CommonMascotEmptyState` |
| `docs/mascot-asset-integration.md` | Dokumentasi integrasi & mapping |
| `docs/mascot-integration-report.md` | Laporan ini |
| `*/assets/mascot/**` & `laundry-admin/public/mascot/**` | 228 file PNG aset (76 × 3 platform) |

## 2. File yang Diubah

| File | Perubahan |
|---|---|
| `laundry_mobile_flutter/pubspec.yaml` | Registrasi 9 folder pack maskot |
| `laundry_kiosk_flutter/pubspec.yaml` | Registrasi 9 folder pack maskot |
| `laundry_mobile_flutter/lib/features/customer/home_screen.dart` | Tambah import konstanta + `MascotMessageCard` |
| `laundry_mobile_flutter/lib/features/customer/home/promo_page.dart` | Empty-state promo pakai `MascotMessageCard` |
| `laundry_mobile_flutter/lib/features/customer/home/order_success_page.dart` | Maskot sukses di atas ringkasan |
| `laundry_kiosk_flutter/lib/src/kiosk_app.dart` | Import; idle (`CircleIllustration`), `SuccessScreen`, `ClosedScreen` |
| `laundry-admin/app/pages/customers/index.vue` | Baris empty-state pakai `CommonMascotEmptyState` |

> Semua perubahan bersifat **aditif/penggantian visual** pada lapisan UI; tidak ada logika bisnis, panggilan API, atau alur transaksi yang diubah/dihapus.

## 3. Asset yang Berhasil Dikenali

- **76 / 76 FOUND** dari manifest. Tidak ada yang MISSING.
- 2 duplicate ID lintas pack ditangani dengan nama konstanta unik.

## 4. Asset yang Missing

- Tidak ada.

## 5. Screen yang Sudah Menggunakan Maskot

| Platform | Screen | Asset |
|---|---|---|
| Mobile | Promo (empty) | promo_empty_waiting |
| Mobile | Order/Payment Success | payment_success_basket_confetti |
| Kiosk | Welcome / Idle | kiosk_idle_cleaning |
| Kiosk | Payment Success | payment_success_basket_confetti |
| Kiosk | Kiosk Tutup | sleeping |
| Admin | Customers (empty) | empty_page_sweeping |

## 6. Screen yang Belum Menggunakan Maskot

Lihat daftar lengkap status **AVAILABLE** di [mascot-asset-integration.md §10](mascot-asset-integration.md). Ringkas: OTP, register welcome, home guide, wallet helper/saldo rendah, voucher/history kosong, scan QR, machine detail, checkout processing, payment failed, error koneksi/server (mobile); fast login, guest checkout, PIN, machine selection, payment waiting/failed, error (kiosk); orders/promo/voucher/report/dashboard empty (admin).

## 7. Hasil Command Verification

| Command | Lokasi | Hasil |
|---|---|---|
| `flutter pub get` | laundry_mobile_flutter | ✅ Got dependencies |
| `flutter analyze` | laundry_mobile_flutter | ✅ **No issues found** |
| `flutter pub get` | laundry_kiosk_flutter | ✅ Got dependencies |
| `flutter analyze` | laundry_kiosk_flutter | ✅ **No issues found** |
| `npm run build` (nuxt build) | laundry-admin | ✅ **Build complete** (client + server + nitro) |
| `flutter test` | mobile & kiosk | ⏭️ Tidak ada test maskot khusus; tidak dijalankan |
| `npm run lint` | laundry-admin | ⏭️ Tidak tersedia script `lint` |

> Catatan: peringatan `flutter pub` "14/8 packages have newer versions" bersifat informatif (constraint), bukan error.

## 8. Risiko yang Masih Tersisa

1. **Ukuran bundle** bertambah karena PNG maskot (pertimbangkan WebP/kompresi).
2. **Aset terduplikasi** di 3 platform (perlu sinkron manual bila desain direvisi).
3. **Token warna kiosk** belum terpusat (`KioskMascotPanel` pakai konstanta lokal selaras brand).
4. **Coverage integrasi** baru sebagian; banyak screen masih status AVAILABLE (sengaja, demi keamanan flow).

## 9. Next Step

**Untuk Engineer:**
- Wire screen status AVAILABLE sesuai mapping, satu per satu, sambil uji `flutter analyze`/build.
- Saat menambah maskot, selalu pakai konstanta (`AppMascotAssets`/`KioskMascotAssets`) + `MascotMessageCard`/`KioskMascotPanel`/`CommonMascotEmptyState`, jangan hardcode path.
- Pertimbangkan menjadikan aset sebagai shared package agar tidak terduplikasi.

**Untuk Designer:**
- Sediakan varian resolusi/WebP bila ukuran jadi isu.
- Jaga `path` & `id` aset tetap stabil pada revisi agar tanpa perubahan kode.
- Tetapkan guideline pemakaian maskot (1 per layar, batas ukuran, kapan tidak dipakai — khususnya admin).

---

## 10. Update Lanjutan 2026-06-23 (Phase 1–4)

Wiring lanjutan dari status AVAILABLE → DONE. Detail lengkap & alasan skip ada di [mascot-wiring-phase-2-report.md](mascot-wiring-phase-2-report.md).

**Total screen/state DONE setelah lanjutan ini:**
- Mobile: Promo kosong, Order/Payment Success, Top Up balance helper, Voucher kosong (dashboard), Pembayaran QRIS error, Pembayaran VA error, Riwayat Order kosong, Welcome/Onboarding, OTP verifikasi & salah OTP, Machine list error/offline. (10)
- Kiosk: Idle/Welcome, Payment Success, Closed, Machine list kosong/error. (4)
- Admin: Customers kosong, Orders kosong, Promo kosong, Voucher kosong, Reports no data, Dashboard no data. (6)

**File diubah (lanjutan):** lihat §4 di laporan phase-2.

**Verifikasi terbaru:** mobile analyze ✅ + test ✅; kiosk analyze ✅ + test ✅; admin build ✅.

**Risiko baru:** path aset admin masih string `/mascot/...` (belum ada konstanta terpusat di Nuxt) — rekomendasi sentralisasi.

**Sisa belum di-wire:** state yang sengaja dilewati (snackbar/dialog transient, status per-kartu, layar padat kiosk, layar offline khusus yang tidak ada) — bukan kelalaian, melainkan keputusan UX/ketiadaan screen.
