# 06 — Checklist Deployment (Fase 0 + Fase 1 Batch 1)

> Belum dideploy. Setiap langkah yang mengubah server/production **menunggu persetujuan eksplisit owner**.

## Sebelum deploy

- [ ] Review commit di branch `feat/production-readiness` (lihat daftar di PROGRESS.md).
- [ ] Jalankan di mesin developer:
  - `cd laundry-be && npx jest` (unit) — harus 261/261.
  - `TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55499/dicuciin_test npm run test:integration` — harus 40/40.
  - `npm run build`.
  - `cd laundry_mobile_flutter && flutter analyze && flutter build apk --release --dart-define=API_BASE_URL=https://api.dicuciin.com/api/v1`.
- [ ] Dry-run booking lama tanpa order (lihat 08-migration-rollback.md) → keputusan owner.
- [ ] Pastikan semua akun staf yang perlu membuka laporan sudah ditugaskan ke outlet (`OutletUser`). Staf tanpa outlet akan menerima 403 di daftar order/dashboard/laporan.

## Deploy (setelah disetujui)

1. Merge/push branch → di server: `cd /opt/dicuciin/dicuciin && bash deploy/scripts/deploy-update.sh` (backup DB → build → migrate → reload).
2. Health: `curl https://api.dicuciin.com/api/v1/health`.
3. Rilis aplikasi mobile versi baru (APK). **Wajib bersamaan**: app lama memakai alur reserve→scan yang kini ditolak, serta tombol top-up/refund.

## Smoke test setelah deploy (baca-saja kecuali disebut)

- [ ] Customer: `GET /customers` → 403; `GET /customers/<milik sendiri>/wallet` → 200.
- [ ] Customer: `POST /wallets/customer/<id>/topup` → 403.
- [ ] Admin: login panel, buka Dashboard, Order, Laporan Keuangan, Member, Mesin.
- [ ] Kasir (outlet A): laporan → hanya outlet A; `?outletId=<outlet B>` → 403.
- [ ] (Butuh izin, sandbox) Order mesin → bayar QRIS sandbox → booking RESERVED → scan QR → perintah START tercatat; scan sebelum bayar → ditolak.

## Rollback

`deploy-update.sh` untuk commit sebelumnya; lihat 08-migration-rollback.md.
