# Promo & Loyalty Ledger Source of Truth

> Status: 2026-06-18 (Phase C). Mendeskripsikan perilaku **kode aktual** di `laundry-be`.
> Tujuan: menghilangkan ambiguitas antara dua tabel ledger uang agar report tidak double
> count dan refund konsisten. **Tidak ada tabel yang dihapus/di-rename.**

## 1. Purpose

Sistem punya **dua** ledger uang yang hidup berdampingan (`wallet_transactions` lama &
`wallet_ledgers` baru) plus satu ledger poin (`point_ledgers`). Tanpa aturan yang jelas,
report bisa menjumlahkan dua ledger untuk metrik saldo yang sama → angka dobel. Dokumen ini
menetapkan **satu source of truth per jenis mutasi** dan aturan pemakaiannya di report.

## 2. Wallet Balance Source

| Field / tabel | Peran | Ditulis oleh |
|---|---|---|
| `Wallet.balance` | **Saldo MAIN saat ini** (top up, refundable). Nilai berjalan (cache otoritatif current balance). | `wallets.service.ts` (legacy topup/pay/refund) **dan** `wallet.service.ts` (loyalty checkout/refund) |
| `Wallet.bonusBalance` | **Saldo BONUS saat ini** (cashback/promo, non-withdrawable). | `wallet.service.ts` (cashback, pay-with-bonus) |
| `WalletLedger` (`wallet_ledgers`) | **Source of truth mutasi saldo modern** (audit append-only). `walletType` (MAIN/BONUS) + `direction` (CREDIT/DEBIT) + `balanceBefore/After` + `idempotencyKey`. | `wallet.service.ts` (loyalty), `transaction.service.ts` (checkout/refund) |
| `WalletTransaction` (`wallet_transactions`) | **Ledger LEGACY** untuk flow lama (saldo tunggal, tanpa `walletType`). | `wallets.service.ts` (topup/pay/refund legacy) & `promos.service.ts` `commitUsage` (cashback promo legacy → MAIN) |

**Aturan inti:** untuk mutasi saldo **modern** (loyalty engine), `WalletLedger` adalah
source of truth. `WalletTransaction` adalah jejak historis flow legacy. **Jangan
menjumlahkan keduanya** untuk metrik saldo yang sama (lihat §5).

## 3. Point Balance Source

| Field / tabel | Peran |
|---|---|
| `Wallet.pointBalance` | **Cache** saldo poin berjalan (dipakai untuk pembacaan cepat & report liability poin). |
| `PointLedger` (`point_ledgers`) | **Source of truth** semua mutasi poin (EARN/REDEEM/EXPIRE/REFUND_REVERSAL), `direction` + `balanceBefore/After` + `idempotencyKey`. |

Poin hanya dari transaksi sukses (order PAID); top up tidak menambah poin. Saat refund,
poin EARN ditarik balik via `PointService.reverseForOrder` (`REFUND_REVERSAL`).

> Catatan: saat earn, `PointLedger.expiresAt` **tidak** di-set (belum ada perilaku expiry).
> Konfigurasi `pointExpiryDays` tersedia (lihat [promo-loyalty-config.md](./promo-loyalty-config.md))
> untuk job point-expiry di Phase E; belum diaktifkan agar backward compatible.

## 4. Revenue Recognition

| Peristiwa | Perlakuan | Sumber data report |
|---|---|---|
| **Top up** | **Liability** (deferred), **bukan** revenue. | `Wallet.balance` / `WalletLedger(MAIN, CREDIT, TOPUP)` / `WalletTransaction(TOPUP)` |
| **Order PAID** | **Revenue** diakui (konsumsi saldo/pembayaran). | `Order.status ∈ PAID_STATUSES`, `Order.totalAmount` |
| **Refund** | **Reversal**: balikkan saldo (per bucket), poin, voucher, tier; turunkan revenue/spending. | `Order.status = REFUNDED`, ledger arah berlawanan |
| **Promo/voucher/discount** | **Contra-revenue / diskon**, bukan biaya tambahan ke revenue. | `Order.discountAmount`, `VoucherRedemption`, `B2BPricingRuleUsage` |
| **Cashback / point / bonus** | **Liability non-tunai** (keputusan 8); dilaporkan terpisah dari revenue. | `WalletLedger(BONUS, CREDIT)`, `PointLedger`, `Wallet.pointBalance` |

## 5. Reporting Rules

Diterapkan di `reports.service.ts` (`getPromotionLoyalty`) dan **diuji** (lihat §7):

1. **Jangan double count `WalletLedger` + `WalletTransaction`** untuk metrik saldo yang sama.
2. **Mutasi saldo modern → `WalletLedger`.** Bonus issued = `walletLedger.aggregate({ walletType: BONUS_BALANCE, direction: CREDIT })`. Report **tidak** membaca `WalletTransaction`.
3. **Poin → `PointLedger` / `Wallet.pointBalance`.** Outstanding point = `wallet.aggregate(_sum.pointBalance)`.
4. **Revenue → order/payment status PAID** (`PAID_STATUSES`), bukan dari ledger top up.
5. **Reversal → status refund** (`Order.status = REFUNDED`, `VoucherRedemption.status = REVERSED`, `PointLedger REFUND_REVERSAL`).
6. **B2B deposit bukan revenue** sampai order partner PAID; volume B2B dihitung dari `Order(partnerId, PAID)`.

## 6. Known Legacy Table — `wallet_transactions`

`WalletTransaction` **masih dipakai** dan **tidak boleh dihapus**:
- `wallets.service.ts` — endpoint legacy `/wallets/customer/:id/topup|pay|refund` (dipakai mobile/flow lama). Menulis `WalletTransaction` + meng-update `Wallet.balance`.
- `promos.service.ts` `commitUsage` — cashback promo tipe `CASHBACK` dikreditkan ke **MAIN** `Wallet.balance` + `WalletTransaction(CASHBACK)`.

Implikasi penting: cashback **promo legacy** masuk MAIN (refundable) lewat `WalletTransaction`,
sedangkan cashback **tier** (loyalty modern) masuk BONUS lewat `WalletLedger`. Karena report
bonus hanya menghitung `WalletLedger(BONUS, CREDIT)`, keduanya **tidak** tercampur/dobel.
`Wallet.balance` adalah satu nilai berjalan yang di-update kedua flow secara konsisten
(masing-masing dengan `idempotencyKey` sendiri).

> Rekomendasi forward: migrasi bertahap endpoint legacy ke `WalletService`/`WalletLedger`
> bila/ketika mobile sudah penuh memakai `/transactions/*`. Sampai itu, pertahankan legacy.

## 7. Test Coverage

`src/modules/reports/reports.service.spec.ts`:
- `bonus liability bersumber dari walletLedger (BONUS/CREDIT), bukan walletTransaction legacy`
  — memverifikasi `walletLedger.aggregate` dipakai dan `walletTransaction.aggregate/findMany`
  **tidak** pernah dipanggil (anti double-count).
- `point liability bersumber dari Wallet.pointBalance (cache poin)`.
- `revenue dari order PAID; top up (walletTransaction TOPUP) tidak dihitung sebagai revenue`.

`src/modules/transactions/transaction.service.spec.ts`:
- `refund mengembalikan saldo, poin, voucher, dan tier` (default: cashback bonus **tidak** ditarik).
- `refund men-debit balik cashback bonus tier hanya saat flag aktif` (flag-on path).

Smoke (`scripts/smoke-promo-loyalty.ts`): `F1. Refund reverses wallet/point/voucher/tier`
end-to-end terhadap DB nyata.
