# Wallet Ledger Unification — Design & Migration Proposal

> **Status:** PROPOSAL (belum diimplementasikan — menunggu review)
> **Tanggal:** 2026-07-09
> **Sifat:** Refactor arsitektur finansial. Wajib menjaga integritas data + audit trail.
> **Prasyarat sudah selesai:** rename `WalletService` → `WalletLedgerService` (menghilangkan tabrakan nama). Dokumen ini adalah langkah lanjutan: menyatukan pencatatan mutasi saldo ke satu ledger resmi.

---

## A. Current Architecture (hasil audit codebase)

### A.1 Model data saldo (schema Prisma nyata)

`Wallet` menyimpan **tiga saldo cache**:

| Field | Tipe | Makna | Ledger "sumber" saat ini |
|---|---|---|---|
| `balance` | `Decimal(14,2)` | MAIN_BALANCE (top-up, refundable) | `wallet_transactions` **dan** `wallet_ledgers` |
| `bonusBalance` | `Decimal(14,2)` | BONUS (cashback, non-withdrawable) | `wallet_ledgers` saja |
| `pointBalance` | `Int` | Poin loyalty | `point_ledgers` |

Ada **tiga tabel histori** yang berbeda bentuk:

| Tabel | Model | Bentuk amount | Penanda arah | Referensi | Idempotency |
|---|---|---|---|---|---|
| `wallet_transactions` | `WalletTransaction` | **signed** (mis. `-amount` untuk PAYMENT) | `transactionType` enum | `orderId` saja | `idempotencyKey @unique` |
| `wallet_ledgers` | `WalletLedger` | **magnitudo positif** | `direction` (DEBIT/CREDIT) + `walletType` | `referenceType`+`referenceId`+`orderId` | `idempotencyKey @unique` |
| `point_ledgers` | `PointLedger` | poin (Int, positif) | `direction` + `sourceType`/`sourceId` | `orderId` | `idempotencyKey @unique`, `expiresAt` |

### A.2 Semua jalur yang MENGUBAH saldo (write paths)

| # | Service / lokasi | Field diubah | Menulis ke | Atomic? |
|---|---|---|---|---|
| 1 | `WalletsService.topup` ([wallets.service.ts:161](../laundry-be/src/modules/wallets/wallets.service.ts#L161)) | `balance` | `wallet_transactions` | ✅ `increment` atomik |
| 2 | `WalletsService.pay` ([wallets.service.ts:200](../laundry-be/src/modules/wallets/wallets.service.ts#L200)) | `balance` | `wallet_transactions` | ✅ `updateMany` guard `balance gte` |
| 3 | `WalletsService.processRefund` ([wallets.service.ts:365](../laundry-be/src/modules/wallets/wallets.service.ts#L365)) | `balance` | `wallet_transactions` | ✅ `increment` atomik |
| 4 | `WalletLedgerService.mutateMoney` ([wallet-ledger.service.ts:68](../laundry-be/src/modules/wallets/wallet-ledger.service.ts#L68)) | `balance` / `bonusBalance` | `wallet_ledgers` | ❌ **read → compute → update (race condition)** |
| 5 | `PromosService.commitUsage` cashback ([promos.service.ts:290](../laundry-be/src/modules/promos/promos.service.ts#L290)) | `balance` | `wallet_transactions` | ⚠️ read → compute → update |
| 6 | `PointService` ([point.service.ts:107](../laundry-be/src/modules/points/point.service.ts#L107)) | `pointBalance` | `point_ledgers` | ✅ credit `increment`, debit `updateMany` guard |

Konsumen `WalletLedgerService` (jalur #4): `payments.service`, `transactions/transaction.service`, `campaigns/campaign.service`, `pricing/pricing-calculation.service`.

### A.3 Semua jalur yang MEMBACA histori (read paths)

| Konsumen | Membaca | Dampak |
|---|---|---|
| `GET /wallets/customer/:id/transactions` ([wallets.controller.ts:44](../laundry-be/src/modules/wallets/wallets.controller.ts#L44)) → `WalletsService.getTransactions` | `wallet_transactions` | Histori app hanya melihat mutasi via jalur #1/#2/#3/#5 |
| `transaction.service` refund/history | `wallet_ledgers` | Hanya melihat mutasi via jalur #4 |
| `reports.service` (`bonusIssued`, `walletLedgers`) ([reports.service.ts:172](../laundry-be/src/modules/reports/reports.service.ts#L172)) | `wallet_ledgers` | **Laporan bonus/loyalty tidak menghitung** cashback promo (jalur #5) & topup/pay app (jalur #1/#2) |
| `mobile-member.service` | `point_ledgers` + cache | Poin |

### A.4 Diagram alur (saat ini — FRAGMENTED)

```
                         ┌───────────────────────────┐
   HTTP/mobile  ───────► │ WalletsService            │──► balance ─┐
   (topup/pay/refund)    │ (#1,#2,#3)                │             │
                         └───────────────────────────┘             ├─► wallet_transactions
   PromosService.commitUsage (cashback #5) ─────────► balance ─────┘        (histori A)

   payments / transactions /                ┌──────────────────────┐
   campaigns / pricing        ────────────► │ WalletLedgerService  │──► balance / bonusBalance
                                            │ (#4, NOT atomic)     │──► wallet_ledgers  (histori B)
                                            └──────────────────────┘

   PointService (#6) ───────────────────────► pointBalance ──────────► point_ledgers (histori C)

   Wallet.balance = SATU angka, tapi ditulis 3 jalur berbeda → histori terpecah A vs B.
```

---

## B. Gap Analysis (diurut berdasar risiko)

| # | Masalah | Bukti | Risiko | Dampak |
|---|---|---|---|---|
| G1 | ✅ **RESOLVED (T3/T4/T6/T7)** — Seluruh mutasi saldo kini via `WalletLedgerService` → `wallet_ledgers`; histori lama sudah di-backfill; **reads** (`getTransactions`, reports) baca `wallet_ledgers`. `wallet_transactions` tinggal tulisan kompatibel (belum dibaca) → dihapus di T9. | A.2 | 🔴 Critical | ~~Histori terpecah~~ (SSoT tercapai) |
| G2 | **Race condition di `WalletLedgerService.mutateMoney`**: `findUnique` → hitung `balanceAfter` → `update` tanpa guard atomik/`FOR UPDATE`. Dua debit paralel → lost update / saldo minus. | [wallet-ledger.service.ts:80-96](../laundry-be/src/modules/wallets/wallet-ledger.service.ts#L80) | 🔴 Critical | Uang hilang/dobel; `balanceAfter` di ledger bisa salah |
| G3 | **Laporan tidak konsisten**: `reports.service` agregasi `wallet_ledgers` saja → melewatkan cashback promo & topup app. | reports.service.ts:172 | 🟠 High | Angka finansial/loyalty salah |
| G4 | ✅ **RESOLVED (T4)** — ~~Semantik cashback ganda: promo cashback → MAIN; engine cashback → BONUS~~. Kini keduanya via `WalletLedgerService.creditCashback` → BONUS + `wallet_ledgers`. | promos.service.ts | 🟠 High | ~~Bonus non-withdrawable bocor jadi withdrawable~~ (teratasi) |
| G5 | ✅ **RESOLVED (T8)** — Trigger `wallet_ledgers_immutable` menolak UPDATE (append-only). DELETE hanya via cascade hapus akun. | migrasi `20260709120000` | 🟠 High | ~~Audit trail bisa dimanipulasi~~ (terkunci) |
| G6 | ✅ **RESOLVED (T6)** — `getTransactions` & `reports.service` sama-sama baca `wallet_ledgers` (satu histori). | A.3 | 🟡 Medium | ~~Response tak konsisten~~ (teratasi) |
| G7 | **`balanceBefore/After` di jalur non-atomik bisa tidak monotonik** saat konkuren. | G2 | 🟡 Medium | Debugging/audit menyesatkan |
| G8 | **Tidak ada `status`, `performedBy`, `reversalOf`, `metadata`** di ledger → reversal & atribusi aktor lemah. | schema WalletLedger | 🟡 Medium | Sulit lacak koreksi manual |
| G9 | **Poin di tabel terpisah** (`point_ledgers`, Int + expiry). Bukan bug, tetapi perlu keputusan sadar apakah ikut disatukan. | schema | 🟢 Low | Lihat keputusan D.0 |

---

## C. Refactor Design (target)

### C.0 Prinsip

1. **`wallet_ledgers` = satu-satunya sumber kebenaran** untuk mutasi saldo **uang** (MAIN + BONUS).
2. `Wallet.balance` & `Wallet.bonusBalance` = **cached running balance** (bukan `SUM(ledger)` saat runtime; tetapi harus **selalu == ledger.balanceAfter terbaru**).
3. Semua mutasi lewat **satu pintu**: `WalletLedgerService`. Tidak ada `wallet.update` balance langsung di service lain.
4. Setiap mutasi = **atomic transaction**: guard saldo di DB, turunkan `balanceBefore/After` dari hasil update atomik, tulis ledger — semua dalam satu `$transaction`.
5. Ledger **immutable**: tak ada UPDATE/DELETE amount/balance. Koreksi = **REVERSAL / ADJUSTMENT** (record baru).
6. **Tidak ada breaking change** pada API publik: response histori dipetakan dari `wallet_ledgers` ke bentuk lama.

### C.0.1 Keputusan: poin tetap di `point_ledgers`

Poin punya karakter berbeda (satuan **Int**, **`expiresAt`**, lifecycle expiry job). Menyatukannya ke `wallet_ledgers` (Decimal, tanpa expiry) menambah kompleksitas tanpa manfaat audit uang. **Rekomendasi:** poin tetap di `point_ledgers` sebagai *specialized ledger* yang sudah atomik & ber-idempotency, dan didokumentasikan sebagai pengecualian sadar. Scope unifikasi = **`wallet_transactions` → `wallet_ledgers`**.

### C.1 Skema `WalletLedger` yang diusulkan (aditif, backward-compatible)

Field baru (nullable → tanpa breaking migration):

```prisma
model WalletLedger {
  // ... field lama tetap ...
  status        LedgerStatus  @default(POSTED)   // POSTED | REVERSED
  transactionType String?     // TOPUP|PAYMENT|CASHBACK|REFUND|ADJUSTMENT|VOUCHER|TRANSFER (alias analitik)
  performedBy   String?       // userId aktor (admin/customer/system)
  reversalOfId  String?       // self-relation → ledger yang dibalik
  metadata      Json?         // konteks tambahan (mis. gateway ref)
  reversalOf    WalletLedger?  @relation("LedgerReversal", fields: [reversalOfId], references: [id])
  reversals     WalletLedger[] @relation("LedgerReversal")
}
enum LedgerStatus { POSTED  REVERSED }
```

Field lama sudah memenuhi requirement 4–7: `direction` (bukan angka negatif ✔), `balanceBefore/After` ✔, `referenceType/Id` ✔, `idempotencyKey @unique` ✔.

### C.2 Pola mutasi atomik (mengadopsi pola aman yang sudah terbukti di `WalletsService`)

```
$transaction:
  # DEBIT (bayar/withdraw):
  updated = wallet.updateMany(
      where: { id, <field> >= amount },     # guard: saldo cukup (atomik)
      data:  { <field>: decrement amount })
  if updated.count == 0: throw 'Saldo tidak cukup'
  fresh = wallet.findUniqueOrThrow(id)      # balanceAfter dari DB
  balanceBefore = fresh.<field> + amount
  ledger.create({ direction: DEBIT, amount, balanceBefore, balanceAfter: fresh.<field>, ... })

  # CREDIT (topup/cashback/refund):
  updated = wallet.update(where:{id}, data:{ <field>: increment amount })
  balanceAfter = updated.<field>; balanceBefore = balanceAfter - amount
  ledger.create({ direction: CREDIT, ... })
```

Menghapus `findUnique→compute→update` (G2). Alternatif kuat: `SELECT … FOR UPDATE` via `$queryRaw` bila butuh lock eksplisit; pola `updateMany` guard sudah cukup & sudah dipakai di produksi (jalur #2).

### C.3 Sequence — pembayaran order dari wallet (target)

```
Client → WalletsService.pay(orderId, amount)
  └─ $transaction:
       ├─ validasi order (owner, status != PAID)
       ├─ WalletLedgerService.payWithWallet(tx, {walletId, amount})   # BONUS dulu, sisa MAIN
       │     ├─ (atomik) debit bonusBalance  → WalletLedger CREDIT/DEBIT
       │     └─ (atomik) debit balance       → WalletLedger DEBIT
       ├─ payment.create(PAID)
       ├─ order.update(PAID) + orderStatusLog
       └─ promos.commitUsage(tx)   # cashback → WalletLedgerService.creditCashback → WalletLedger (BUKAN wallet_transactions)
```

### C.4 Transfer (net-new; `WalletLedger` mendukung 2 owner: customer & B2B partner)

```
transfer(fromWalletId, toWalletId, amount, ref):
  $transaction:
    ledgerOut = debit(from, amount, referenceType:'TRANSFER', referenceId: ref)
    ledgerIn  = credit(to,  amount, referenceType:'TRANSFER', referenceId: ref)   # ref sama → rekonsiliasi
```

### C.5 Tanggung jawab service (target)

| Service | Tanggung jawab |
|---|---|
| `WalletLedgerService` | **Satu-satunya** penulis `wallet_ledgers` + mutasi `balance`/`bonusBalance`. Primitives: credit/debit/topUp/creditCashback/withdraw/payWithWallet/**transfer**/**reverse**/**adjust**. Semua atomik. |
| `WalletsService` | Orkestrasi fitur app (PIN, validasi order/owner) → **mendelegasikan mutasi uang ke `WalletLedgerService`**. Tidak lagi menulis `wallet_transactions`. |
| `PromosService` | Cashback → panggil `WalletLedgerService.creditCashback` (hapus tulis langsung `wallet_transactions`). |
| `PointService` | Tetap; sumber kebenaran poin (`point_ledgers`). |
| Read/History | Satu pemetaan `wallet_ledgers → DTO histori` dipakai semua endpoint. |

---

## D. Database Migration Plan

### Phase 1 — Unify writes (non-destruktif)
- Tambah kolom baru `WalletLedger` (semua nullable + default) → migrasi aman, tanpa lock berat.
- Refactor jalur #1,#2,#3,#5 agar menulis `wallet_ledgers` (via `WalletLedgerService`), **berhenti menulis** `wallet_transactions`.
- `wallet_transactions` menjadi **read-only** (masih dibaca endpoint histori app sementara).
- **Rollback:** revert commit; kolom baru boleh tetap ada (nullable, tak mengganggu).

### Phase 2 — Backfill histori lama
- Script idempoten `wallet_transactions → wallet_ledgers`:
  - `amount<0` → `DEBIT |amount|`; `amount>=0` → `CREDIT`.
  - `transactionType` → `referenceType` + `transactionType`.
  - `walletType = MAIN_BALANCE` (semua WalletTransaction historis = MAIN).
  - Pertahankan `createdAt`, `balanceBefore/After`, `orderId`.
  - `idempotencyKey = 'migrated-wt-' + id` (hindari bentrok unique dgn ledger existing).
  - `metadata = { migratedFrom: 'wallet_transactions', originalId }`.
- **Validasi:** untuk tiap wallet, `SUM(CREDIT)-SUM(DEBIT)` MAIN pada ledger == `wallet.balance`. Report selisih → nol sebelum lanjut.
- **Rollback:** `DELETE FROM wallet_ledgers WHERE metadata->>'migratedFrom'='wallet_transactions'` (aman & terisolasi).

### Phase 3 — Switch reads
- `WalletsService.getTransactions` & reports membaca `wallet_ledgers`, dipetakan ke DTO lama (lihat E.Task 7).
- **Backward compat:** response JSON identik (field `transactionType`, `amount` signed, `balanceBefore/After`, `description`, `createdAt`).
- **Rollback:** revert read layer ke `wallet_transactions` (data masih ada).

### Phase 4 — Cleanup (setelah bake + semua test hijau)
- Hentikan model `WalletTransaction` di kode; tandai tabel deprecated (jangan drop dulu — arsipkan ≥1 rilis).
- Hapus dead code, DTO, mapping lama.
- Immutability guard: tambah Postgres rule/trigger `BEFORE UPDATE/DELETE ON wallet_ledgers → RAISE EXCEPTION` (kecuali kolom `status` untuk reversal, atau lewat kolom whitelist).

---

## E. Implementation Plan (commit kecil, berurutan)

| Task | Deskripsi | Kompleksitas | Dependency |
|---|---|---|---|
| T1 | Migrasi schema: kolom baru `WalletLedger` + enum `LedgerStatus` + self-relation | S | — |
| T2 | ✅ **SELESAI** — Perkuat `WalletLedgerService`: mutasi atomik (hapus race **G2**) via `updateMany` guard + increment/decrement; `balanceBefore/After` dari hasil update; spec store-backed + 2 test konkuren. (`reverse/adjust/transfer` menyusul) | **L** | T1 |
| T3 | ✅ **SELESAI (pendekatan expand/contract)** — `WalletsService.topup/pay/refund` mendelegasikan mutasi saldo ke `WalletLedgerService` (MAIN_BALANCE, **perilaku sama**). `wallet_transactions` **tetap ditulis** sebagai histori kompatibel (bukan di-stop), agar endpoint histori lama tak kosong sampai read dialihkan (T6) + backfill (T7). Reversible. | **L** | T2 |
| T4 | ✅ **SELESAI** — Cashback promo (`PromosService.commitUsage`) dialihkan ke `WalletLedgerService.creditCashback` → **BONUS** (bukan MAIN), tulis `wallet_ledgers`; **G4 tertutup** + jalur mutasi saldo langsung ketiga dihapus. `WalletLedgerService` diekstrak ke `WalletLedgerModule` untuk memutus potensi dependency melingkar (Wallets↔Promos). Boot terverifikasi tanpa error DI. | M | T2 |
| T5 | ✅ **SELESAI** — `wallet-history.mapper.ts` (pure, teruji): `mapLedgerToTransaction` + `walletTransactionToLedgerInput` (round-trip test). | M | — |
| T6 | ✅ **SELESAI** — `getTransactions` kini baca `wallet_ledgers` → dipetakan ke bentuk lama (kontrak mobile tak berubah; **read parity** terverifikasi pada data nyata). `reports.service` sudah baca `wallet_ledgers` (tak perlu diubah). | M | T5, T7 |
| T7 | ✅ **SELESAI & DIJALANKAN** — `scripts/backfill-wallet-transactions-to-ledger.ts` (idempoten, dedup twin, `--dry`). Dijalankan di DB dev: 7 baris ter-migrasi, **5/5 wallet konsisten**, re-run = 0. `npm run backfill:wallet-ledger`. | **L** | T3,T4 |
| T8 | ✅ **SELESAI & DITERAPKAN** — Trigger DB `wallet_ledgers_immutable` (migrasi `20260709120000_wallet_ledger_immutable`) menolak **UPDATE** (append-only). DELETE sengaja diizinkan (cascade hapus akun; kode tak pernah hapus ledger langsung). Terverifikasi: UPDATE ditolak `P0001`. *Kolom audit `status`/`performedBy`/`reversalOf`/`metadata` ditunda sampai `reverse()/adjust()` dibangun.* | M | — |
| T9 | ✅ **SELESAI** — Dual-write `wallet_transactions` dihentikan (4 titik: topup/pay/refund + cashback). Respons `transaction` diturunkan dari ledger via `mapLedgerToTransaction` (kontrak lama tetap). Import mati dibersihkan. Tabel `wallet_transactions` disimpan (arsip, tidak di-drop). Boot & 161 test hijau. | S | T6,T7 |

Kompleksitas: S=kecil, M=sedang, L=besar.

---

## F. Testing Plan

| Area | Test |
|---|---|
| Balance consistency | Setelah tiap operasi, `wallet.balance == ledger terbaru balanceAfter` (MAIN) & sama utk BONUS |
| Concurrent debit | N debit paralel pada saldo terbatas → tepat yang cukup saldo sukses, tak ada saldo minus, tak ada lost update (regresi G2) |
| Transfer | A→B: 2 ledger, `referenceId` sama, jumlah nol-sum, kedua saldo benar |
| Refund / reversal | Refund menghasilkan record baru (CREDIT), ledger asal `status=REVERSED` + `reversalOfId`, tidak meng-UPDATE amount lama |
| Adjustment | Koreksi manual tercatat `performedBy` + `referenceType='ADJUSTMENT'` |
| Immutability | UPDATE/DELETE ke `wallet_ledgers` ditolak (trigger) |
| Idempotency | Retry dengan `idempotencyKey` sama → satu ledger, saldo tak dobel |
| Audit history | Semua mutasi (topup/pay/cashback/refund) muncul di `wallet_ledgers` untuk satu wallet |
| Backward compat API | Snapshot response `GET .../transactions` sebelum vs sesudah = identik |
| Migration validation | Backfill: per-wallet `SUM(CREDIT-DEBIT)` == `balance`; hitung baris cocok; idempoten saat dijalankan ulang |
| Existing suite | 141 unit test tetap hijau di tiap phase |

---

## G. Success Criteria

- [x] Satu sumber kebenaran mutasi saldo uang = `wallet_ledgers` (T3/T4).
- [x] `Wallet.balance`/`bonusBalance` konsisten dgn ledger (backfill: **5/5 wallet**).
- [x] Tidak ada lagi tulis mutasi ke `wallet_transactions` (jalur #1,2,3,5 dialihkan — T9).
- [x] Semua mutasi dapat diaudit dari `wallet_ledgers` (termasuk cashback promo & topup app).
- [x] Semua operasi wallet atomik (race G2 hilang; test konkuren hijau — T2).
- [x] Tidak ada breaking change API publik (read-parity terverifikasi pada data nyata — T5/T6).
- [x] Ledger immutable (trigger DB aktif — T8; UPDATE ditolak `P0001`).
- [x] Unit + migration test lolos (**161 test / 21 suite hijau**; backfill dijalankan & idempoten). *Integration/e2e HTTP menyusul (di luar cakupan tugas ini).*

### Sisa (tidak menghalangi SSoT — pengayaan)
- `reverse()` / `adjust()` / `transfer()` di `WalletLedgerService` + kolom audit
  `status` / `performedBy` / `reversalOfId` / `metadata` (T1) — dibutuhkan saat fitur
  koreksi/transfer dibangun.
- Opsi "belanja BONUS dulu" saat bayar (keputusan produk, sengaja ditunda).
- Drop tabel `wallet_transactions` setelah masa arsip (≥1 rilis).

---

## Catatan lingkup vs template task
Task menyebut domain generik (Salary, Payroll, Project Cost, Reimbursement) yang **tidak ada** di codebase ini. Yang nyata: **TOPUP, PAYMENT, CASHBACK, REFUND, ADJUSTMENT, VOUCHER redemption, POINT**, dan (net-new) **TRANSFER** antar wallet (customer/B2B partner). Desain di atas dipetakan ke transaksi nyata tersebut, bukan domain fiktif.
