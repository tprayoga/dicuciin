# Promotion & Loyalty Engine — Development Plan (Teknis)

> **Status (2026-06-18): SEBAGIAN BESAR SUDAH DIIMPLEMENTASIKAN.** Dokumen ini awalnya
> rencana; kini menjadi catatan teknis. Fase P1–P9 mayoritas selesai (lihat kolom Status
> di tabel §6). Schema final terdokumentasi di
> [promotion-loyalty-schema.md](./promotion-loyalty-schema.md) (sudah disinkronkan dengan
> kode); API di [promotion-loyalty-api.md](./promotion-loyalty-api.md); seed & smoke di
> [testing-promo-loyalty.md](./testing-promo-loyalty.md). Beberapa nama model final berbeda
> dari sketsa awal di bawah (mis. `B2BPartner`, `UserMembershipStatus`,
> `MembershipTierConfig`, `WalletLedger`).
>
> **Prinsip: extend, jangan rewrite.** Ikuti pola modul, struktur folder, naming, dan
> style kode yang sudah ada.

## 1. Analisa struktur project saat ini

```
dicuciin/
├── laundry-be/            # Backend API (NestJS)
├── laundry-admin/         # Dashboard admin (Nuxt 4)
├── laundry_mobile_flutter/# App customer (Flutter)
├── laundry_kiosk_flutter/ # App kiosk self-service (Flutter)
├── deploy/                # Konfigurasi deploy
└── docs/                  # (baru) dokumen rancangan
```

### Backend (`laundry-be`)
- **Stack:** NestJS 10, Prisma 5 (`@prisma/client`), **PostgreSQL**, TypeScript.
- **Async/jobs:** **BullMQ 5 + Redis** (`QueuesModule`, `@Global`, processors di
  `modules/queues/processors/*`). **MQTT** untuk IoT. **`@nestjs/throttler`** rate-limit.
- **Auth:** JWT (`@nestjs/jwt` + passport-jwt), `JwtAuthGuard` + `RolesGuard` + `@Roles()`.
- **Pola modul:** `src/modules/<fitur>/` berisi `<fitur>.module.ts`, `.controller.ts`,
  `.service.ts`, `.service.spec.ts`, dan `dto/<fitur>.dto.ts` (class-validator + `@ApiProperty`).
- **Uang:** `Prisma.Decimal(14,2)` + helper `common/utils/money.util.ts` (`D`, `money`, `toNum`).
- **Response:** `TransformInterceptor` membungkus `{ success, data, meta, timestamp }` dan
  meng-konversi `Decimal → number` di boundary. Paginasi: service mengembalikan `{ data, meta }`.
- **Penomoran:** `generateDailySequence` (mis. `ORD-...`). **Audit:** model `AuditLog`.
- **Ledger pattern (acuan):** `WalletTransaction` (balanceBefore/After + `idempotencyKey`
  unik + mutasi atomik `updateMany` guard) — lihat `wallets.service.ts` & `promos.commitUsage`.

### Frontend admin (`laundry-admin`)
- **Stack:** Nuxt 4, **Nuxt UI 4** (`UButton`, `UModal`, `UFormField`, `USelect`, ...),
  **Pinia**, `@vueuse/nuxt`. API via `composables/useApi` (`get/post/patch/del/upload`).
  Tipe di `~/types`. Halaman di `app/pages/<fitur>/index.vue`, komponen di `app/components/`.

### Frontend mobile/kiosk (Flutter)
- Feature-based: `lib/features/<fitur>/` dengan `*_controller.dart` (ChangeNotifier/Provider)
  + `*_service.dart` (HTTP via `ApiClient`) + model `*_models.dart`. Provider di-wire di `main.dart`.

### Status relevan yang sudah ada (reuse, jangan duplikasi)
- `Wallet` + `WalletTransaction` (saldo tunggal), `wallets.service.pay/topup/refund`.
- `Promo`/`PromoRule`/`PromoUsage` + **`PromosService.evaluatePromo` & `commitUsage`**
  (sumber kebenaran promo, pemakaian dicatat saat PAID) — fondasi voucher engine.
- `Customer.birthDate`/`createdAt` (birthday/anniversary), `memberCode`.
- Order → PAID di **dua chokepoint**: `payments.settlePaid` (gateway) & `wallets.pay` (saldo).
- `reports` module (`PAID_STATUSES`), `AppBanner` (konten promosi), `reviews`.

## 2. Identifikasi stack (ringkas)

| Lapis | Teknologi |
|------|-----------|
| Backend | NestJS 10 (TypeScript) |
| ORM | Prisma 5 |
| Database | PostgreSQL |
| Queue/Jobs | BullMQ 5 + Redis |
| Messaging IoT | MQTT |
| Auth | JWT + Passport |
| Admin | Nuxt 4 + Nuxt UI 4 + Pinia |
| Mobile/Kiosk | Flutter (Provider) |

## 3. Modul backend baru (ikuti pola `modules/*`)

| Modul | Tanggung jawab | Endpoint inti (contoh) |
|-------|----------------|------------------------|
| `loyalty` | Point ledger (earn/redeem/expire), `LoyaltyConfig` | `GET /loyalty/points/:ownerId`, `POST /loyalty/redeem` |
| `membership` | Tier definisi + evaluasi tier retail/B2B | `GET /membership/tiers`, `GET /membership/:ownerId`, admin CRUD tier |
| `partners` | B2B partner + deposit (reuse wallet) | CRUD `/partners`, `GET /partners/:id/wallet` |
| `vouchers` | VoucherTemplate (admin) + UserVoucher + redemption | `GET /vouchers/mine`, `POST /vouchers/validate`, `POST /vouchers/redeem`, admin CRUD template, `POST /vouchers/issue` |
| `campaigns` | Campaign CRUD + Referral + issuance | CRUD `/campaigns`, `POST /referrals`, `GET /referrals/mine` |
| `happy-hour` | HappyHourRule CRUD + lookup harga aktif | CRUD `/happy-hour`, `GET /happy-hour/active` |
| `pricing` | `PricingService` (pipeline §9 schema) — dipakai orders/preview | dipanggil internal + `POST /pricing/preview` |

Modul yang **di-extend**, bukan baru:
- `wallets` — multi-saldo (MAIN/BONUS/POINT helper), owner customer/partner, refund reversal.
- `orders` — panggil `PricingService`; simpan `userVoucherId`/`partnerId`/`happyHourAdjustment`.
- `payments` & `wallets` (settle) — perluas commit saat PAID (voucher, point, cashback, tier).
- `reports` — endpoint liability/funnel/ROI/tier/B2B (§11 schema).

### Penjadwalan campaign (BullMQ repeatable — reuse infra yang ada)
Tambah queue `loyalty-scheduler` + processor di `modules/queues/processors/`:
- Job harian `birthday` → terbitkan voucher ke customer yang ultah hari ini (idempoten via `CampaignIssuance.idempotencyKey`).
- Job harian `anniversary` → 1 tahun membership.
- Job harian `long-time-no-see` → customer tanpa order PAID > `inactiveDays`.
- Job harian `point-expiry` → `PointLedger EXPIRE` untuk poin lewat `expiresAt`.
- Job `tier-recalc` (opsional, selain real-time saat PAID).

> Alternatif `@nestjs/schedule` (cron decorator) bila tak ingin BullMQ untuk ini — tapi
> **rekomendasi: BullMQ repeatable** agar konsisten dengan infrastruktur eksisting.

## 4. Integrasi titik kritis (mengikuti `commitUsage` yang sudah ada)

1. **Order create** (`orders.service.create`): ganti perhitungan diskon langsung →
   `PricingService.calculate()` (base → happy hour → voucher **atau** promo → tier).
   Validasi non-stackable (keputusan 5). Simpan field accrual yang *direncanakan*.
2. **PAID** (`payments.settlePaid` + `wallets.pay`, di dalam `$transaction`):
   urutan commit — promo (`commitUsage`, sudah ada) → voucher redemption → point earn →
   cashback ke BONUS → tier re-evaluate → campaign trigger (referral qualify).
   Semua via helper service yang menerima `tx` (pola `commitUsage(tx, orderId)`).
3. **Refund** (`wallets` refund): reversal berurutan (keputusan 10) — kembalikan
   MAIN/BONUS, tarik point (`REFUND_REVERSAL`), `VoucherRedemption REVERSED` + voucher
   ACTIVE kembali, turunkan tier bila perlu.

> Idempotensi wajib di tiap commit (pakai `idempotencyKey`: `point-earn-<orderId>`,
> `cashback-<orderId>` (sudah ada), `voucher-redeem-<orderId>`).

## 5. Frontend

### Admin (Nuxt) — halaman/komponen baru (pola `PromoManager.vue`/`pages/*/index.vue`)
- **Vouchers**: kelola template + terbitkan manual + lihat funnel.
- **Campaigns**: CRUD + builder config per tipe (birthday/LTNS/referral/topup).
- **Happy Hour**: kelola rule (hari/jam/penyesuaian harga).
- **Membership Tiers**: kelola threshold & benefit; lihat distribusi tier.
- **Partners (B2B)**: kelola partner + deposit + tier B2B.
- **Loyalty Reports**: liability, point aging, ROI campaign.
- Lengkapi `~/types` dan reuse `useApi`, `.dc-*` class & `UModal` form pattern.

### Mobile (Flutter)
- **Vouchers saya**: daftar UserVoucher (ACTIVE/USED/EXPIRED), pakai di checkout
  (extend `order_checkout_page` yang sudah panggil `validatePromo`).
- **Poin & tier**: tampilkan `pointBalance` + tier badge + progress ke tier berikutnya
  (extend `member_dashboard_page`).
- **Referral**: kode referral + share.
- Wallet: tampilkan MAIN vs BONUS terpisah; top up tetap ke MAIN.

### Kiosk (Flutter)
- Terapkan harga happy hour di tampilan harga mesin; dukung pakai voucher tamu bila relevan.

## 6. Urutan implementasi (rekomendasi)

> Tiap fase: migration kecil → service + DTO + spec → controller → admin → mobile →
> verifikasi (`tsc`, `jest`, `flutter analyze`, `nuxi typecheck`). Pola "verifikasi curl"
> seperti di `ROADMAP_FITUR.md`.

| Fase | Isi | Status | Catatan |
|------|-----|--------|---------|
| **P1. Fondasi wallet & ledger** | Wallet multi-saldo (MAIN/BONUS/POINT) + `WalletLedger` (`walletType`+`direction`), refund-safe. | DONE | Ledger uang baru = tabel terpisah `WalletLedger`; `Wallet.balance` tetap = MAIN. |
| **P2. Pricing service** | `PricingService` (B2B → happy hour → voucher/promo) + `PricingCalculationLog`. | DONE | `modules/pricing` + log audit. |
| **P3. Voucher engine** | Template + UserVoucher + redemption + commit saat PAID. | DONE | Non-stackable via `VoucherRedemption.orderId @unique`. |
| **P4. Loyalty point** | PointLedger earn (PAID) + redeem ke voucher. | DONE (expiry job: belum terverifikasi) | `/points/redeem-voucher` atomik. |
| **P5. Membership tier (retail/B2B)** | Tier config + `UserMembershipStatus` + evaluasi saat PAID + reverse saat refund. | DONE | `MembershipHistory` audit belum dibuat. |
| **P6. Campaign + scheduler** | Campaign(+rules/rewards) + BullMQ jobs + referral + `CampaignExecutionLog`. | DONE (runtime scheduler butuh Redis utk dibuktikan) | `/campaigns/run/scheduled` untuk manual run. |
| **P7. Happy hour** | HappyHourRule (+ quota & `allowVoucherStack`) + integrasi `PricingService`. | DONE | — |
| **P8. B2B partner** | `B2BPartner` + deposit (reuse wallet) + tier B2B + `B2BPricingRule`(+Usage) + order partner. | DONE | Special pricing override discount tier. |
| **P9. Reporting & revenue recognition** | `GET /reports/promotion-loyalty` + pemisahan top-up vs revenue. | DONE | Hati-hati double-count 2 tabel ledger uang. |

## 7. Strategi testing
- **Unit (`*.service.spec.ts`)** mengikuti pola yang ada (mock `PrismaService`, `$transaction`
  callback): `PricingService` (pipeline & non-stackable), point earn/redeem/expire, tier
  threshold (naik/turun), refund reversal (semua ledger), campaign idempotency.
- **Integrasi** di titik PAID & refund (order → ledger lengkap konsisten).
- Pertahankan suite hijau (per 2026-06-18: **114 test, 17 suite, semua pass**) + tambah per fase.

## 8. Risiko & mitigasi
| Risiko | Mitigasi |
|--------|----------|
| Race/double-credit saat PAID bersamaan | Semua commit dalam `$transaction` + `idempotencyKey` unik (pola eksisting). |
| Konsistensi cache `pointBalance`/`bonusBalance` vs ledger | Ledger = sumber kebenaran; saldo di-update di transaksi yang sama; util rekonsiliasi. |
| Revenue recognition salah (top up dihitung revenue) | Report dari konsumsi (order PAID), bukan TOPUP; pisahkan liability (§11 schema). |
| Voucher non-stackable bocor | `VoucherRedemption.orderId @unique` (DB) + guard pricing. |
| Refund tidak membalik semua reward | Checklist reversal berurutan + test integrasi (keputusan 10). |
| Migrasi `balance`→`mainBalance` memutus kode lama | Rename (bukan drop) + update `wallets`/`payments` di fase yang sama + test. |
| Tier turun saat refund mengejutkan user | Kebijakan downgrade didokumentasikan + `MembershipHistory` audit. |

## 9. Definisi selesai (per fase)
- Migration + Prisma generate sukses; `tsc` & `jest` hijau.
- Endpoint terverifikasi (curl) + admin/mobile yang relevan jalan.
- Semua mutasi menulis ledger/audit (keputusan 9); refund membalik (keputusan 10).
- `ROADMAP_FITUR.md` diperbarui dengan ringkas per fase (gaya yang ada).
