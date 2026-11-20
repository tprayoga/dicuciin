# 06 — Checklist Deployment (Fase 0 + Fase 1 Batch 1–3 + Fase 2 Batch 4)

> Belum dideploy. Setiap langkah yang mengubah server/production **menunggu persetujuan eksplisit owner**.
> Urutan rilis & matriks kompatibilitas: **11-deployment-compatibility.md**.

## Sebelum deploy

- [ ] Review commit di branch `feat/production-readiness` (`git log --oneline main..feat/production-readiness`).
- [ ] Jalankan di mesin developer:
  - `cd laundry-be && npx jest` — harus **264/264**.
  - `TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55499/dicuciin_test npm run test:integration` — harus **137/137**.
  - `npm run build`.
  - `cd laundry_mobile_flutter && flutter analyze && flutter build apk --release --dart-define=API_BASE_URL=https://api.dicuciin.com/api/v1`.
  - `cd laundry_kiosk_flutter && flutter analyze && flutter test && flutter build <target> --release --dart-define=API_BASE_URL=https://api.dicuciin.com/api/v1`.
- [ ] (Izin) Laporan baca-saja di server: `npm run audit:staff-outlets -- --out staff.json` → owner menugaskan outlet untuk semua `NO_OUTLET` yang masih aktif.
- [ ] Keputusan owner: kebijakan refund; `BOOKING_HOLD_MINUTES` masa transisi (usul 15).
- [ ] (Batch 4) Keputusan owner: batas & biaya top-up (`TOPUP_MIN_AMOUNT`, `TOPUP_MAX_AMOUNT`, `TOPUP_ADMIN_FEE`), kebijakan voucher saat refund (`REFUND_RESTORE_VOUCHER`), parameter PIN (`WALLET_PIN_MAX_ATTEMPTS`, `WALLET_PIN_LOCK_MINUTES`, `WALLET_PIN_PROOF_SECONDS`).
- [ ] (Batch 4) Build app dengan `--dart-define=ENABLE_WALLET_TOPUP=true` HANYA setelah backend Batch 4 aktif & sandbox top-up terverifikasi.
- [ ] Jendela deploy saat outlet sepi (kiosk tidak bisa menjual sampai aplikasi kiosk diperbarui).

- [ ] (Batch 2) Redis tersedia untuk worker (sudah dipakai scheduler loyalty). Env opsional: lihat 14 §Konfigurasi. Untuk instance API tambahan tanpa worker: `OPS_SCHEDULER_ENABLED=false`.
- [ ] (Batch 2) Pastikan `PAYMENT_GATEWAY=midtrans` di server; endpoint `simulate`/`/payments/webhook` otomatis tidak berfungsi.

## Deploy (setelah disetujui)

1. Backend: `cd /opt/dicuciin/dicuciin && bash deploy/scripts/deploy-update.sh` (backup DB → build → migrate 4 migrasi aditif → reload).
2. Health: `curl https://api.dicuciin.com/api/v1/health`.
3. Kiosk: pasang build baru di setiap kiosk **segera** setelah backend.
4. (Izin) Rekonsiliasi: `npx ts-node scripts/reconcile-legacy-bookings.ts --out legacy.json` → owner meninjau → `--apply --actor "<nama>"` bila disetujui.
5. Rilis APK mobile baru (app lama tetap berfungsi untuk alur utama; top-up/refund/"Booking & Pakai" ditolak).

## Smoke test setelah deploy (baca-saja kecuali disebut)

- [ ] Customer: `GET /customers` → 403; `GET /customers/<milik sendiri>/wallet` → 200.
- [ ] Customer: `POST /wallets/customer/<id>/topup` → 403.
- [ ] Admin: login panel, buka Dashboard, Order, Laporan Keuangan, Member, Mesin, Kiosk.
- [ ] Kasir (outlet A): laporan → hanya outlet A; `?outletId=<outlet B>` → 403.
- [ ] Kiosk: layar checkout menampilkan harga (dulu gagal 401).
- [ ] (Izin, sandbox/nominal kecil) Kiosk: pilih mesin → QRIS → bayar → layar sukses "sudah menyala" → mesin fisik berputar.
- [ ] (Izin) Kiosk saldo: PIN salah → ditolak; PIN benar → mesin menyala.
- [ ] (Izin, sandbox) Mobile baru: order mesin → bayar QRIS → booking RESERVED → scan QR → START; scan sebelum bayar → ditolak.
- [ ] (Izin) Mobile lama: reserve → bayar saldo → scan → START.
- [ ] (Izin, sandbox) Ganti metode QRIS → VA: tagihan QRIS lama `expire` di dashboard sandbox; bayar VA → order PAID.
- [ ] (Izin, sandbox) Bayar QR lama setelah ganti metode → admin melihat `DUPLICATE_PAYMENT` di menu Rekonsiliasi & Refund.
- [ ] Log: `Ops scheduler terdaftar`; job `expire-holds` berjalan tiap menit.
- [ ] (Batch 3) Order dengan voucher → bayar QRIS sandbox: nominal = harga setelah voucher; voucher berstatus USED.
- [ ] (Batch 3) Dryer 2 siklus: harga & estimasi ×2 di app dan di detail order.
- [ ] (Izin, sandbox) Top-up QRIS Rp10.000 → bayar di simulator → saldo +10.000 sekali; webhook ulang dari dashboard → saldo tetap.
- [ ] (Izin, sandbox) Top-up VA BCA → biarkan kedaluwarsa → status EXPIRED, saldo tetap.
- [ ] PIN: 5× salah di app → pesan terkunci; bayar saldo tanpa PIN lewat API → 403.
- [ ] Log 24 jam pertama: cari `PERLU REFUND MANUAL`, `slot terambil`, `Aktivasi mesin order kiosk`.

## Rollback

`deploy-update.sh` untuk commit sebelumnya; **sebelum** rollback kode tutup booking tamu kiosk (lihat 08-migration-rollback.md §`kiosk_booking_pin_lockout`). Kiosk & app harus ikut kembali ke versi lama (kiosk baru tidak jalan di backend lama).
