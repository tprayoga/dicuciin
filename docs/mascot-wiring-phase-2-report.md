# Laporan Wiring Maskot — Lanjutan (Phase 1–4)

> Dibuat: 2026-06-23 · Lanjutan dari [mascot-asset-integration.md](mascot-asset-integration.md) & [mascot-integration-report.md](mascot-integration-report.md)
> Batasan dipatuhi: tanpa perubahan backend, kontrak API, database, atau business logic transaksi.
> Prinsip: pakai constants (`AppMascotAssets`/`KioskMascotAssets`) + reusable component, maksimal 1 maskot per screen/state, CTA tetap dominan, semua gambar ada fallback.

---

## 1. Summary Pekerjaan

Melanjutkan integrasi maskot dari status **AVAILABLE → DONE** secara bertahap dan aman di Mobile, Kiosk, dan Admin. Setiap platform diverifikasi (analyze/test/build) sebelum lanjut. Screen yang tidak punya state nyata, bersifat transient (snackbar/dialog), atau akan merusak UX (overlay kamera, layar padat) **sengaja dilewati** dan didokumentasikan — bukan diklaim selesai.

## 2. Screen yang Berhasil Di-wire

### Mobile (Phase 1 — critical)
| Screen / State | Asset (constant) | Component | File |
|---|---|---|---|
| Top Up Saldo — balance helper | `walletBalanceHelper` | MascotMessageCard (compact, wallet) | `home/topup_page.dart` |
| Member Dashboard — Voucher Saya kosong | `promoEmptyWaiting` | MascotMessageCard (compact, voucher) | `home/member_dashboard_page.dart` |
| Pembayaran QRIS — error/gagal | `paymentFailedReceipt` | MascotMessageCard (error) | `home/payment_qris_page.dart` |
| Pembayaran VA — error/gagal | `paymentFailedReceipt` | MascotMessageCard (error) | `home/payment_va_page.dart` |
| Order — Riwayat Order kosong | `emptyHistorySitting` | MascotMessageCard (empty) | `home/order_page.dart` |

### Mobile (Phase 2 — onboarding/operational)
| Screen / State | Asset (constant) | Pola | File |
|---|---|---|---|
| Welcome / Onboarding | `registrationWelcomeWaving` | Image.asset (ilustrasi sentral) + errorBuilder | `auth/auth_flow_screens.dart` |
| OTP — verifikasi & salah OTP (state-aware) | `otpVerificationPhone` / `otpWrongConfusedPhone` | Image.asset reflektif state + fallback | `auth/auth_flow_screens.dart` |
| Machine list — error/offline | `machineOfflineCable` | MascotMessageCard (machine) | `home/location_detail_page.dart` |

### Kiosk (Phase 3)
| Screen / State | Asset (constant) | Component | File |
|---|---|---|---|
| Machine list kosong/error (`RefreshableEmpty`) | `machineOfflineCable` | KioskMascotPanel | `src/kiosk_app.dart` |

> Kiosk sebelumnya sudah DONE: Idle/Welcome, Payment Success, Closed.

### Admin (Phase 4 — empty states)
| Halaman | Asset (file public) | Komponen | File |
|---|---|---|---|
| Orders kosong | `09_.../03_empty_page_sweeping.png` | CommonMascotEmptyState (slot `#empty` UTable) | `pages/orders/index.vue` |
| Marketing / Promo kosong | `06_.../08_promo_empty_waiting.png` | CommonMascotEmptyState | `components/PromoManager.vue` |
| Promotion-Loyalty / Voucher kosong | `06_.../08_promo_empty_waiting.png` | CommonMascotEmptyState | `pages/promotion-loyalty/index.vue` |
| Reports / Finance no data | `06_.../03_empty_history_sitting.png` | CommonMascotEmptyState | `pages/reports/finance.vue` |
| Dashboard no data | `06_.../03_empty_history_sitting.png` | CommonMascotEmptyState | `pages/dashboard.vue` |

## 3. Screen yang Dilewati & Alasan

| Platform | Screen / State target | Alasan dilewati |
|---|---|---|
| Mobile | Saldo rendah (low balance) | Bukan screen — hanya SnackBar transient di checkout (`'Saldo tidak cukup...'`). Menambah maskot butuh membuat flow baru. |
| Mobile | Checkout processing | Bukan screen — hanya state tombol (`_processing`) yang menonaktifkan tombol. |
| Mobile | Scan QR start / unreadable | Layar kamera live; maskot akan menutupi viewfinder. "Unreadable" hanya dialog hasil transient. |
| Mobile | Home first-time guide | Tidak ada state "first-time" khusus; home selalu berisi konten + persona. Menambah maskot = clutter. |
| Mobile | Machine ready / running | Status **per-kartu mesin** (chip), bukan state layar. 1 maskot/ kartu = berlebihan. |
| Kiosk | Fast login / Scan QR member | Tidak ada stage ini — kiosk murni guest (tanpa login member). |
| Kiosk | Guest checkout (terpisah) | Seluruh kiosk sudah guest; tidak ada layar "guest checkout" terpisah. |
| Kiosk | PIN confirmation | Tidak ada stage PIN di kiosk. |
| Kiosk | Machine ready / running | Status per-kartu (chip) di `MachineCard`, bukan state layar. |
| Kiosk | Checkout summary / Payment waiting / failed | Layar padat (ringkasan + QR/VA + instruksi). Maskot akan menutupi konten/CTA. Waiting hanya indikator kecil inline. |
| Kiosk / Mobile | No internet / Server maintenance (layar khusus) | Tidak ada layar offline/maintenance terdedikasi; error muncul via SnackBar / state lokal. Tidak membuat flow baru. |

## 4. File yang Diubah / Ditambah (lanjutan ini)

**Diubah:**
- `laundry_mobile_flutter/lib/features/customer/home/topup_page.dart`
- `laundry_mobile_flutter/lib/features/customer/home/member_dashboard_page.dart`
- `laundry_mobile_flutter/lib/features/customer/home/payment_qris_page.dart`
- `laundry_mobile_flutter/lib/features/customer/home/payment_va_page.dart`
- `laundry_mobile_flutter/lib/features/customer/home/order_page.dart`
- `laundry_mobile_flutter/lib/features/customer/home/location_detail_page.dart`
- `laundry_mobile_flutter/lib/features/auth/auth_flow_screens.dart` (+ import konstanta)
- `laundry_kiosk_flutter/lib/src/kiosk_app.dart` (`RefreshableEmpty`)
- `laundry-admin/app/pages/orders/index.vue`
- `laundry-admin/app/components/PromoManager.vue`
- `laundry-admin/app/pages/promotion-loyalty/index.vue`
- `laundry-admin/app/pages/reports/finance.vue`
- `laundry-admin/app/pages/dashboard.vue`

**Ditambah:**
- `docs/mascot-wiring-phase-2-report.md` (laporan ini)

> Tidak ada file constants/komponen baru — semua memakai aset, konstanta, dan komponen yang sudah ada.

## 5. Hasil Command Verification

| Command | Lokasi | Hasil |
|---|---|---|
| `flutter analyze` (setelah Phase 1) | mobile | ✅ No issues found |
| `flutter analyze` (setelah Phase 2) | mobile | ✅ No issues found |
| `flutter test` | mobile | ✅ All tests passed (1 test) |
| `flutter analyze` (setelah Phase 3) | kiosk | ✅ No issues found |
| `flutter test` | kiosk | ✅ All tests passed (1 test enrollment) |
| `npm run build` (setelah Phase 4) | admin | ✅ Build complete |

**Audit konsistensi (Phase 5):**
- Tidak ada hardcoded path `assets/mascot` di screen Flutter — semua via konstanta ✓
- Semua `Image.asset` maskot punya `errorBuilder`; komponen (MascotMessageCard/KioskMascotPanel/CommonMascotEmptyState) punya fallback internal ✓
- Kiosk landscape-safe (Center + ConstrainedBox maxWidth) ✓
- CTA tetap dominan (tombol primary full-width; maskot 64–150px) ✓

## 6. Risiko

1. **Admin pakai path string `/mascot/...`** pada prop `image` (7 tempat). Belum ada konstanta terpusat di Nuxt — bila path aset berubah, perlu update manual. (Rekomendasi: buat map konstanta TS untuk admin.)
2. **Pola inline Image.asset** (welcome & OTP) tidak memakai MascotMessageCard karena layar sudah punya judul/subjudul sendiri (memakai card akan duplikatif). Konsisten dengan pola lama (order success), tetap pakai konstanta + fallback.
3. **Ukuran bundle** bertambah (aset PNG) — tidak berubah dari sebelumnya, tetap relevan.

## 7. Next Step

- (Opsional) Sentralkan path aset admin ke konstanta TS agar tidak hardcode string.
- Wire sisa empty-state admin yang belum (mis. customers detail, kiosks, iot, reviews) bila diinginkan.
- Bila desain ingin maskot pada layar padat (kiosk payment/checkout), perlu redesign layout lebih dulu agar tidak menutupi CTA.
- Uji visual on-device (mobile portrait & kiosk landscape) untuk konfirmasi tidak ada overflow nyata.
