# Promo & Loyalty Config

> Status: 2026-06-18 (Phase D). Mendeskripsikan `LoyaltyConfigService`
> (`src/modules/loyalty-config/`) — wrapper konfigurasi loyalty terpusat.

## 1. Current Config Source

Konfigurasi loyalty dibaca dari **environment variable** melalui satu wrapper
`LoyaltyConfigService` (`@Global` via `LoyaltyConfigModule`). Sebelumnya `process.env`
dibaca langsung di beberapa tempat (mis. point rate di `pricing.service.ts` dan
`payments.service.ts`); kini semua membaca lewat wrapper agar konsisten & mudah dipindah
ke tabel DB nanti tanpa mengubah pemanggil.

Belum ada tabel `LoyaltyConfig` di database — sengaja, agar perubahan minimal & backward
compatible (lihat §5).

## 2. Supported Config

| Env | Default | Purpose | Used By |
|-----|---------|---------|---------|
| `LOYALTY_POINT_RATE` | `1000` | Rupiah per 1 poin saat earn (`floor(spending / rate) * tierMultiplier`). | `pricing.service.ts` (quote/checkout), `payments.service.ts` (settle gateway) |
| `LOYALTY_POINT_EXPIRY_DAYS` | `365` | Masa berlaku poin (hari). **Disediakan untuk job point-expiry (Phase E)**; belum diterapkan otomatis ke earn. | (belum dipakai — calon `PointService`/scheduler) |
| `LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND` | `false` | Saat refund, debit balik cashback bonus tier yang sempat dikreditkan. | `transaction.service.ts` (`refund`) |

Getter pada `LoyaltyConfigService`:
- `pointEarnRate: number` — angka invalid / `<= 0` jatuh ke default `1000`.
- `pointExpiryDays: number` — invalid / `<= 0` → default `365`.
- `reverseTierCashbackOnRefund: boolean` — `true` hanya untuk nilai truthy eksplisit
  (`1|true|yes|on`); selain itu `false`.

## 3. Backward Compatibility

- Tanpa env apa pun, perilaku **identik** dengan sebelum Phase D: rate poin = 1000,
  cashback refund tidak dibalik.
- `pointExpiryDays` tidak mengubah perilaku apa pun saat ini — earn **tidak** menyetel
  `PointLedger.expiresAt`. Jadi tidak ada poin yang tiba-tiba kedaluwarsa.
- Kalkulasi harga & poin existing tidak berubah (terbukti: 122 unit test + 15 skenario
  smoke tetap hijau).

## 4. Cashback Refund Policy

Cashback **tier** dikreditkan ke BONUS saat order PAID sebagai
`WalletLedger(BONUS_BALANCE, CREDIT, referenceType='TIER_CASHBACK', orderId=...)` →
**dapat dilacak** dan aman dibalik.

- **`LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND=false` (default):**
  Perilaku lama. Refund mengembalikan saldo yang dipakai membayar (per bucket dari ledger
  DEBIT), poin, voucher, dan tier — **tetapi cashback bonus tier TIDAK ditarik balik**.
- **`...=true`:**
  Refund **juga** men-debit balik cashback tier: cari `WalletLedger` CREDIT BONUS dengan
  `referenceType='TIER_CASHBACK'` untuk order tsb, lalu debit **di-clamp** ke saldo bonus
  tersisa (agar tak minus), idempoten via `idempotencyKey='refund-cashback-<orderId>-<ledgerId>'`.

**Catatan/known limitation:** clamp ke saldo bonus berarti bila cashback sudah terpakai
(bonus sudah habis dibelanjakan), bagian yang sudah terpakai **tidak** ditarik (tidak
memaksa saldo minus). Ini keputusan aman & ber-evidence; bila kebijakan bisnis menuntut
"klawback penuh", perlu desain tambahan (mis. tagihan negatif) — di luar scope Phase D.

## 5. Future Option

Bila perlu konfigurasi runtime / per-tenant:
- Tambah tabel `LoyaltyConfig (key, valueNumeric, valueText, ...)` (aditif, non-destruktif).
- Ubah getter `LoyaltyConfigService` untuk membaca tabel dengan fallback ke env lalu default.
- Pemanggil (`pricing`, `payments`, `transactions`) **tidak perlu berubah** karena sudah
  lewat wrapper.
