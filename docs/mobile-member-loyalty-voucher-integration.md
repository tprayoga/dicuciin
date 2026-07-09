# Mobile Member Loyalty Voucher Integration

## Endpoint

Mobile customer app memakai endpoint backend berikut:

- `GET /mobile/me/summary`
- `GET /mobile/me/vouchers`
- `GET /mobile/me/points`

Semua endpoint memakai bearer token existing. Customer diturunkan dari JWT, bukan dari `customerId` yang dikirim client.

## Response Ringkas

`GET /mobile/me/summary` mengembalikan:

```json
{
  "customer": { "id": "...", "name": "Andi Silver", "phone": "081111111111" },
  "membership": {
    "tier": "Silver",
    "currentPoints": 120,
    "lifetimeSpending": 120000,
    "lifetimeTransactions": 3,
    "nextTier": "Gold",
    "pointsToNextTier": 130,
    "tierProgressPercent": 48
  },
  "wallet": { "balance": 50000, "bonusBalance": 0 },
  "vouchers": { "activeCount": 2, "usedCount": 0, "expiredCount": 1, "active": [] },
  "promos": { "availableCount": 5, "happyHourActive": true, "available": [] }
}
```

`GET /mobile/me/vouchers` mengembalikan:

```json
{ "active": [], "used": [], "expired": [] }
```

`GET /mobile/me/points` mengembalikan:

```json
{ "currentPoints": 120, "ledger": [], "tier": {}, "nextTier": {} }
```

## Screen Mobile

Data member ditampilkan di:

- Home Dashboard: kartu member summary berisi nama, tier, poin, saldo, voucher aktif, dan progress tier.
- Dashboard Member: saldo, tier progress, point card, riwayat saldo, voucher, promo.
- Promo Page: voucher dipisah menjadi Voucher Bisa Dipakai, Voucher Terpakai, dan Voucher Kedaluwarsa.

## State Handling

- Loading: kartu member menampilkan spinner singkat.
- Success: kartu menampilkan poin, tier, saldo, voucher, dan progress.
- Empty voucher: memakai `MascotMessageCard` existing.
- No point: copy menampilkan bahwa poin akan bertambah setelah transaksi berhasil.
- Error API: kartu fallback menampilkan `Data member belum bisa dimuat. Coba lagi nanti.`

## Model Flutter

Model baru/terkait:

- `MemberSummary`
- `MembershipInfo`
- `WalletSummary`
- `MemberVoucherSummary`
- `MemberVoucherGroups`
- `MemberPointLedger`
- `MemberPoints`

Parsing dibuat null-safe dan memakai default value aman.

## TODO Production

- Tambahkan policy tier final jika aturan naik tier berubah dari spending ke kombinasi spending dan transaksi.
- Tambahkan paging untuk point ledger jika volume data besar.
- Tambahkan e2e API test saat test harness HTTP backend sudah tersedia.
