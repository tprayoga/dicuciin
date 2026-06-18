# Promo & Loyalty Scheduler

> Status: 2026-06-18 (Phase E). Mendeskripsikan scheduler BullMQ untuk kampanye terjadwal
> dan kedaluwarsa poin. Verifikasi runtime: `npm run verify:redis-scheduler`.

## 1. Purpose

Beberapa proses loyalty harus berjalan **terjadwal & berulang** (bukan saat request):
menerbitkan reward ulang tahun/anniversary, menyapa pelanggan lama (long-time-no-see),
benefit tier bulanan, dan **kedaluwarsa poin**. Scheduler memakai BullMQ repeatable jobs
di atas Redis, mengikuti infrastruktur queue yang sudah ada (`QueuesModule`).

## 2. Redis/BullMQ Setup

- Koneksi Redis dikonfigurasi global di `modules/queues/queues.module.ts`
  (`BullModule.forRootAsync`) dari env:
  - `REDIS_HOST` (default `localhost`)
  - `REDIS_PORT` (default `6379`)
- Hidupkan Redis lokal: `npm run docker:up` (atau `docker compose up -d redis`).
- Repeatable job **didaftarkan saat aplikasi NestJS booting** (`OnModuleInit`) dengan
  `jobId` tetap → tidak menumpuk duplikat saat restart.

## 3. Jobs

| Job | Queue | Frequency | Purpose | Idempotency Key | Risk |
|-----|-------|-----------|---------|-----------------|------|
| `point-expiry` | `loyalty-scheduler` | harian, `LOYALTY_EXPIRY_CRON` (default `30 1 * * *`) | Debit poin yang `expiresAt <= now` | `point-expiry-<creditLedgerId>` | Rendah (clamp ke saldo; tidak negatif) |
| `daily` → birthday | `campaign-scheduler` | harian, `CAMPAIGN_CRON` (default `0 1 * * *`) | Terbitkan voucher/point ulang tahun | `birthday:<campaignId>:<customerId>:<year>` | Rendah (1x/tahun) |
| `daily` → anniversary | `campaign-scheduler` | harian | Reward anniversary membership | `anniversary:<campaignId>:<customerId>:<year>` | Rendah |
| `daily` → long-time-no-see | `campaign-scheduler` | harian | Sapa pelanggan tidak aktif | `CampaignIssuance` + cooldown check | Rendah |
| `daily` → monthly-tier | `campaign-scheduler` | harian (eksekusi hanya tgl 1) | Benefit tier bulanan | `CampaignIssuance.idempotencyKey` | Rendah |
| referral qualification | (inline saat checkout, bukan scheduled) | — | Reward saat transaksi pertama referee | `CampaignIssuance` | Rendah |
| topup cashback | (inline saat top up, bukan scheduled) | — | Cashback top up → BONUS | `CampaignIssuance` + ledger `idempotencyKey` | Rendah |

> Referral & topup cashback **bukan** job terjadwal — dipicu langsung di flow transaksi
> (`transaction.service`), tetap idempoten via `CampaignIssuance`.

## 4. Point Expiry Policy

- **Saat earn** (`PointService.earn`): bila pemanggil tidak menyetel `expiresAt`, di-set
  `now + LoyaltyConfigService.pointExpiryDays` (default **365** hari). `pointExpiryDays`
  selalu `> 0` (di-clamp di config) → poin earn baru selalu punya `expiresAt`.
- **Poin lama (historis)**: `expiresAt = null` → **non-expiring** (backward compatible;
  job hanya menyentuh baris dengan `expiresAt` terisi & lewat).
- **Job `expireDuePoints`** (`point_ledgers` CREDIT, `expiresAt <= now`):
  - Tulis `PointLedger` DEBIT `sourceType=EXPIRY`, debit `Wallet.pointBalance`.
  - **Tidak boleh negatif**: jumlah expire per credit = `min(credit.points, saldo poin saat itu)`,
    dijaga juga oleh guard `updateMany(pointBalance >= n)`.
  - **Idempoten**: `idempotencyKey = point-expiry-<creditLedgerId>`. Run ulang tidak double-debit.
  - **Dry-run**: `expireDuePoints(now, { dryRun: true })` hanya menghitung (dipakai verify script).
- **LIMITATION (didokumentasikan):** tidak ada tracking "sisa terpakai" per credit ledger,
  sehingga **bukan FIFO-exact**. Poin bersifat fungible; total yang di-expire selalu di-clamp
  ke saldo agar aman. Penyempurnaan FIFO-exact adalah opsi fase berikutnya.
- **Menonaktifkan expiry**: set `LOYALTY_POINT_EXPIRY_DAYS` ke nilai sangat besar
  (poin praktis non-expiring). Poin yang sudah ter-set `expiresAt` tetap mengikuti nilai lamanya.

## 5. Campaign Issuance Policy

- Setiap penerbitan reward dicatat di `CampaignIssuance` dengan `idempotencyKey @unique`.
- Sebelum menerbitkan, service cek `campaignIssuance.findUnique({ idempotencyKey })` →
  bila sudah ada, **skip** (tidak double-issue).
- Key birthday/anniversary memuat tahun (`...:<year>`) → maksimal 1x per tahun.
- Long-time-no-see memakai cooldown + cek issuance terakhir.
- Eksekusi terjadwal di-log ke `CampaignExecutionLog` (observability).

## 6. Runtime Verification

```bash
cd laundry-be
npm run verify:redis-scheduler
```

Output (READ-ONLY) menampilkan:
- `redis.reachable` — Redis terjangkau atau tidak (exit code 1 bila tidak).
- `queues.*` + `campaignScheduler.registered` / `loyaltyScheduler.registered` — repeatable
  jobs yang terdaftar (terisi setelah app pernah booting dengan Redis hidup).
- `pointExpiryDryRun` — hasil dry-run (`scanned/expiredLedgers/expiredPoints`), tanpa mutasi.

Script **tidak** menghapus queue, flush Redis, atau reset DB.

> Catatan: `loyaltyScheduler.registered=false` hingga aplikasi NestJS booting sekali dengan
> Redis hidup (`npm run start`), karena job didaftarkan di `OnModuleInit`.

## 7. Production Notes

- **Redis wajib** untuk scheduler. Tanpa Redis, boot tetap jalan (job gagal terdaftar,
  di-log error) tetapi job tidak berjalan.
- **Single registrar**: `jobId` tetap (`campaign-daily`, `loyalty-point-expiry`) mencegah
  duplikat repeatable saat multi-restart. Untuk multi-instance, idempotency
  (`CampaignIssuance` + `point-expiry-<id>`) mencegah double-effect meski worker > 1.
- **Monitoring**: pantau job failed (`removeOnFail: 100` menyimpan jejak), log processor
  (`start`/`result`/`failed` + jumlah item).
- **Retry/backoff**: default BullMQ; bisa ditambah opsi `attempts`/`backoff` per job bila perlu.
- **Timezone**: cron mengikuti TZ proses. Set `TZ=Asia/Jakarta` di environment produksi agar
  jadwal sesuai zona Indonesia (konsisten dengan happy hour `Asia/Jakarta`).
- **Jangan** menjalankan dua worker untuk queue yang sama tanpa mengandalkan idempotency
  (sudah dijaga, tetapi tetap rekomendasi: satu worker per queue + idempotency).
