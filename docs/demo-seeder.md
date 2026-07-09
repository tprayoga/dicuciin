# Di.Cuciin Demo Seeder

## Cara Menjalankan

```bash
cd laundry-be
npm run seed:dicuciin-demo
```

Seeder ini idempotent untuk data demo karena memakai `upsert`, kode unik, dan prefix `DEMO_`.

## Akun Demo

Password semua akun demo: `password123`.

| Role | Email |
| --- | --- |
| Admin | admin@dicuciin.local |
| Outlet Manager | outlet.manager@dicuciin.local |
| Operator | operator@dicuciin.local |
| Customer Silver | andi.silver@dicuciin.local |
| Customer Gold | budi.gold@dicuciin.local |
| Customer Platinum | citra.platinum@dicuciin.local |
| Customer Low Balance | deni.low@dicuciin.local |
| Customer No Voucher | eka.novoucher@dicuciin.local |

## Data Customer Demo

| Member | Phone | Tier | Saldo | Poin |
| --- | --- | --- | ---: | ---: |
| Andi Silver | 081111111111 | Silver | 50000 | 120 |
| Budi Gold | 082222222222 | Gold | 150000 | 850 |
| Citra Platinum | 083333333333 | Platinum | 300000 | 2400 |
| Deni Low Balance | 084444444444 | Silver | 5000 | 50 |
| Eka No Voucher | 085555555555 | Silver | 75000 | 0 |

## Data Demo

Seeder membuat:

- 3 outlet aktif: Bandung Dago, Jakarta Tebet, Bekasi Galaxy.
- 15 mesin IoT: washer dan dryer dengan status `AVAILABLE`, `RUNNING`, `OFFLINE`, `MAINTENANCE`.
- 5 layanan laundry: Cuci Reguler, Cuci Express, Drying Only, Cuci + Kering, Premium Care.
- Tier Silver, Gold, Platinum dengan spending threshold dan cashback rate.
- Wallet, wallet transaction, membership status, dan point ledger untuk setiap member.
- Promo aktif: Happy Hour Pagi, Member Baru, Gold Cashback Booster, Platinum Exclusive, Weekend Laundry.
- Voucher template: VOUCHER10K, HEMAT20, FREE_DRY, GOLD_MONTHLY, PLATINUM_SPECIAL.
- User voucher aktif, terpakai, dan kedaluwarsa sesuai skenario demo.
- 5 order dan payment demo dengan status paid, pending, processing, completed, cancelled.

## Expected Result di Mobile

Setelah login sebagai customer demo, mobile menampilkan:

- tier member dan progress menuju tier berikutnya,
- saldo wallet,
- poin saat ini,
- jumlah voucher aktif,
- daftar voucher aktif, terpakai, dan kedaluwarsa,
- promo aktif yang bisa diklaim.

## Known Limitation

- Field kota outlet belum tersedia eksplisit di schema; kota disimpan di `address`.
- Seeder tidak menghapus data non-demo.
- Seeder membutuhkan PostgreSQL sesuai `DATABASE_URL`.
