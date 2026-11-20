# 06 — Checklist Deployment (Fase 0 + Fase 1 Batch 1 + Batch 1.5)

> Belum dideploy. Setiap langkah yang mengubah server/production **menunggu persetujuan eksplisit owner**.
> Urutan rilis & matriks kompatibilitas: **11-deployment-compatibility.md**.

## Sebelum deploy

- [ ] Review commit di branch `feat/production-readiness` (`git log --oneline main..feat/production-readiness`).
- [ ] Jalankan di mesin developer:
  - `cd laundry-be && npx jest` — harus **255/255**.
  - `TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55499/dicuciin_test npm run test:integration` — harus **79/79**.
  - `npm run build`.
  - `cd laundry_mobile_flutter && flutter analyze && flutter build apk --release --dart-define=API_BASE_URL=https://api.dicuciin.com/api/v1`.
  - `cd laundry_kiosk_flutter && flutter analyze && flutter test && flutter build <target> --release --dart-define=API_BASE_URL=https://api.dicuciin.com/api/v1`.
- [ ] (Izin) Laporan baca-saja di server: `npm run audit:staff-outlets -- --out staff.json` → owner menugaskan outlet untuk semua `NO_OUTLET` yang masih aktif.
- [ ] Keputusan owner: kebijakan refund; `BOOKING_HOLD_MINUTES` masa transisi (usul 15).
- [ ] Jendela deploy saat outlet sepi (kiosk tidak bisa menjual sampai aplikasi kiosk diperbarui).

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
- [ ] Log 24 jam pertama: cari `PERLU REFUND MANUAL`, `slot terambil`, `Aktivasi mesin order kiosk`.

## Rollback

`deploy-update.sh` untuk commit sebelumnya; **sebelum** rollback kode tutup booking tamu kiosk (lihat 08-migration-rollback.md §`kiosk_booking_pin_lockout`). Kiosk & app harus ikut kembali ke versi lama (kiosk baru tidak jalan di backend lama).
