# Security Hotfix — Eskalasi Hak Akses & Otorisasi Keuangan (2026-11-21)

Branch: `hotfix/auth-privilege-escalation` — dibuat dari **`70dedee`** (= `main` = `origin/main`, commit yang diambil `deploy/scripts/deploy-update.sh`). Tidak ada migrasi database, tidak ada perubahan fitur, tidak ada perubahan aplikasi mobile/kiosk/admin.

Status: **siap deploy, MENUNGGU PERSETUJUAN OWNER.** Belum di-push, belum dideploy, audit production belum dijalankan.

## 1. Kerentanan

Semua terkonfirmasi pada kode `70dedee` dengan test HTTP terhadap PostgreSQL berskema production (lihat §3 — test gagal pada kode lama, lulus pada hotfix).

| ID | Tingkat | Lokasi | Masalah | Dampak |
|---|---|---|---|---|
| **V1** | **KRITIS** | `auth.controller.ts` `POST /auth/register` (`@Public`) → `RegisterDto.role` (`@IsEnum(UserRole)`, opsional) → `AuthService.register` | `role` dari klien dipakai apa adanya; verifikasi OTP hanya `if (role === CUSTOMER)`; email saja cukup | Siapa pun di internet bisa membuat **SUPER_ADMIN/OWNER/staf** dan langsung menerima token |
| **V2** | **KRITIS** | `users.controller.ts` `PATCH /users/:id` (tanpa `@Roles`; `RolesGuard` meloloskan rute tanpa metadata) → `UsersService.update` | Field `role`, `password`, `isActive` diterapkan tanpa cek pemanggil | Pelanggan mana pun bisa menjadikan dirinya SUPER_ADMIN, **mengganti password admin (ambil alih akun)**, atau menonaktifkan akun |
| V3 | Tinggi | `GET /users/:id` (tanpa `@Roles`) | — | Data pribadi user mana pun terbaca |
| V4 | Sedang | `POST /users`, `PATCH /users/:id` | OWNER bisa membuat/mengubah SUPER_ADMIN | Eskalasi OWNER → SUPER_ADMIN |
| K1 | **KRITIS** | `POST /wallets/customer/:id/topup` (tanpa `@Roles`) | Kredit saldo tanpa pembayaran | Pelanggan menambah saldo sendiri gratis |
| K9 | **KRITIS** | `POST /transactions/topup` (tanpa `@Roles`) | Sama | Sama |
| K3 | Tinggi | `POST /wallets/customer/:id/refund` (tanpa `@Roles`) | Refund mandiri ke saldo | Pelanggan me-refund order sendiri |
| K4 | **KRITIS** | `WalletsService.pay` | Nominal debit = `amount` dari klien (`@Min(0)`) | Order lunas dengan Rp0 (mesin/layanan gratis) |
| K6 | Tinggi | `GET/POST /wallets/customer/:id/*` | Tanpa cek pemilik | Melihat & **memakai saldo pelanggan lain** |
| K10 | Tinggi | `POST /iot/devices/:id/commands`, `/heartbeat` (tanpa `@Roles`) | — | Pelanggan mengirim perintah ke mesin |

Endpoint publik lain yang diaudit (`@Public` di `70dedee`): `otp/request`, `otp/verify`, `login`, `refresh`, `password/reset` — tidak membuat akun berhak istimewa (reset password wajib token OTP nomor yang sama). `POST /customers` hanya staf, membuat role CUSTOMER. `POST /partners` hanya SUPER_ADMIN/OWNER. Endpoint kiosk `device/*` memakai token perangkat — di luar cakupan hotfix (diperbaiki di branch production-readiness, Batch 1.5).

## 2. Perbaikan (minimal)

**Commit 1 — eskalasi akun (V1–V4)** — wajib.
- `AuthService.register`: role ≠ CUSTOMER (termasuk `null`) → **403**; OTP selalu wajib; user selalu dibuat sebagai CUSTOMER (+ customer + wallet). Field `role` tetap diterima di DTO agar klien yang mengirim `role: CUSTOMER` tidak gagal.
- `PATCH /users/:id`: SUPER_ADMIN/OWNER saja; pengguna lain hanya **dirinya sendiri**, hanya nama/email (kompatibel app mobile yang mengirim `{name, email, phone}`; nomor harus sama); `role/password/isActive/outletId/shiftName` → 403.
- `GET /users/:id`: admin atau diri sendiri.
- OWNER tidak boleh membuat/mengubah/menetapkan SUPER_ADMIN.

**Commit 2 — otorisasi keuangan & mesin (K1, K3, K4, K6, K9, K10)** — sangat disarankan (bisa dideploy bersama atau ditunda).
- `@Roles` pada top-up manual (SUPER_ADMIN/OWNER), refund ke saldo (admin), perintah/heartbeat mesin (admin/teknisi).
- Pelanggan hanya dompetnya sendiri (baca, riwayat, bayar); staf tetap seperti sebelumnya.
- Bayar saldo: nominal = **total order dari server**; hanya order DRAFT/WAITING_PAYMENT.

**Dampak ke app yang sedang beredar** (commit 2): tombol **Top Up** dan **Refund ke Saldo** di app mobile versi production akan mendapat pesan 403 ("Insufficient permissions"). Itu memang fitur gratis yang tidak sah. Profil, login, registrasi, pembayaran saldo order sendiri, kiosk (staf), dan admin tetap berjalan.

Bukan bagian hotfix (tetap ada di production sampai branch production-readiness dideploy): K5-sisa, K7 (status order bebas oleh staf), K8 (checkout atas nama orang lain), K11, K12, celah kiosk Batch 1.5, bug A4 (login & register pada detik yang sama → 500).

## 3. Bukti uji

Lingkungan: Docker `postgres:16-alpine` lokal (`127.0.0.1:55499/dicuciin_hotfix_test`) dengan **24 migrasi production `70dedee` saja**. Tidak memakai DB production, DB development, atau DB HWMS. Gateway, WhatsApp, IoT ditiru.

| Gate | Hasil |
|---|---|
| Test keamanan (`npm`: `SECURITY_TEST_DATABASE_URL=… npx jest --config test/jest-security.json --runInBand`) | **47/47**, 5 run berurutan 5/5 (0 error koneksi, 0 proses tumpang tindih) |
| Test keamanan pada kode `70dedee` TANPA hotfix | **29 dari 44 gagal** (eskalasi akun 20/33, keuangan 9/11) → kerentanan terbukti |
| Unit test production + baru | **178/178** |
| `tsc --noEmit`, `npm run build` | exit 0 / sukses |
| `prisma migrate diff` (migrasi ↔ skema) | tidak ada perbedaan; skema **tidak berubah** dari `70dedee` |
| Uji mutasi (9 kontrol) | 8 tertangkap; 1 setara (pemaksaan `role: CUSTOMER` saat create adalah lapis kedua di belakang cek 403) |

Isi test:
- `auth-escalation.int-spec.ts` (33): 6 role istimewa tanpa OTP → 403; 6 role istimewa DENGAN OTP sah → 403; nilai role tak terduga (null, huruf kecil, array, objek, angka, spasi); field tambahan (`isActive`, `passwordHash`, …) → 400; CUSTOMER tanpa nomor/token/token nomor lain/token palsu; alur sah tetap 201 (role CUSTOMER, customer + wallet, login); **20 percobaan paralel** → 0 akun; pelanggan menaikkan role sendiri, mengganti password/isActive, mengambil alih akun admin (5 role pelaku × 4 payload) → 403, password admin utuh; kompatibilitas profil app; OWNER vs SUPER_ADMIN; fungsi admin tetap jalan; GET user lain → 403.
- `financial-authz.int-spec.ts` (11): K1/K9 top-up mandiri → 403 (admin tetap bisa); K3; K6 baca/bayar dompet orang lain; K4 "bayar Rp0" memotong total order, saldo kurang ditolak, order batal ditolak, **6 bayar paralel → 1 debit**; K10.
- `audit-script.int-spec.ts` (3): skrip audit menemukan semua jejak & **jumlah baris serta hash tabel users tidak berubah**; filter `--since`; transaksi READ ONLY menolak penulisan.

## 4. Prasyarat deploy (semua butuh persetujuan owner)

1. **Konfirmasi commit production** (baca-saja): `cd /opt/dicuciin/dicuciin && git rev-parse HEAD && git status --porcelain` → harus `70dedee…` dan bersih. Bila berbeda/ada perubahan lokal → STOP, hotfix perlu di-rebase.
2. **Push** branch `hotfix/auth-privilege-escalation` ke origin, lalu **fast-forward `main`** ke commit hotfix (branch dibuat langsung di atas `70dedee`, jadi tanpa merge commit). `deploy-update.sh` default `BRANCH=main` tetap dipakai.
3. Jendela deploy: kapan saja (tidak ada migrasi; `pm2 reload` tanpa downtime). Disarankan saat outlet sepi.
4. Keputusan: deploy commit 1 saja, atau commit 1 + 2 (disarankan). Siapkan pesan untuk pelanggan bila tombol Top Up/Refund di app lama menampilkan error.
5. Kredensial server tersedia untuk operator yang ditunjuk owner.

## 5. Prosedur

### 5.1 Backup (sebelum deploy)
```bash
cd /opt/dicuciin/dicuciin
mkdir -p backups
docker exec -t laundry-postgres pg_dump -U "${POSTGRES_USER:-laundry}" "${POSTGRES_DB:-laundry_db}" \
  | gzip > backups/pre-hotfix-auth_$(date +%Y%m%d_%H%M%S).sql.gz
ls -lh backups | tail -3        # pastikan ukuran wajar (bukan 0)
git rev-parse HEAD > backups/pre-hotfix-auth.commit
```
(`deploy-update.sh` juga membuat backup sebelum `migrate`, tetapi backup manual di atas memastikan ada titik pulih walau skrip gagal lebih awal.)

### 5.2 Deploy
```bash
cd /opt/dicuciin/dicuciin && bash deploy/scripts/deploy-update.sh
```
Skrip: `git pull --ff-only` main → `npm ci` → `prisma generate` → build → backup → `prisma migrate deploy` (**tidak ada migrasi baru**, no-op) → build admin (tidak berubah) → `pm2 reload`.

### 5.3 Smoke test (tanpa transaksi nyata, tanpa membuat data permanen)
> Jangan jalankan langkah 2 terhadap server yang BELUM dihotfix — di versi lama permintaan itu benar-benar membuat SUPER_ADMIN.

| # | Langkah | Harapan |
|---|---|---|
| 1 | `curl -fsS https://api.dicuciin.com/api/v1/health` | 200 |
| 2 | `curl -s -o /dev/null -w '%{http_code}' -X POST https://api.dicuciin.com/api/v1/auth/register -H 'Content-Type: application/json' -d '{"name":"smoke","email":"smoke-hotfix@invalid.test","password":"SmokeTest123","role":"SUPER_ADMIN"}'` | **403** (tidak ada user dibuat) |
| 3 | Login akun pelanggan uji milik owner → `PATCH /users/<id-sendiri>` body `{"role":"SUPER_ADMIN"}` | **403** |
| 4 | Akun yang sama → `PATCH /users/<id-sendiri>` body `{"name":"<nama sama>"}` | 200 |
| 5 | (commit 2) akun yang sama → `POST /wallets/customer/<customerId-sendiri>/topup` body `{"amount":1}` | **403**, saldo tidak berubah |
| 6 | (commit 2) `POST /iot/devices/<id-sembarang>/commands` body `{"command":"PING"}` dengan token pelanggan | **403** |
| 7 | Admin web: login OWNER → halaman Users tampil; ubah nama satu staf uji → tersimpan | 200 |
| 8 | App mobile: login, buka profil, edit nama → tersimpan | OK |
| 9 | `pm2 logs laundry-be --lines 200` | tanpa error baru |

### 5.4 Rollback (bila smoke test gagal)
Tidak ada perubahan skema → rollback = kembali ke kode lama:
```bash
cd /opt/dicuciin/dicuciin
git checkout --detach "$(cat backups/pre-hotfix-auth.commit)"   # 70dedee
cd laundry-be && npm ci --legacy-peer-deps && npx prisma generate && npm run build
cd .. && pm2 reload deploy/ecosystem.config.cjs --env production --update-env
curl -fsS http://127.0.0.1:3000/api/v1/health
```
Lalu kembalikan `main` di origin ke `70dedee` (owner) agar deploy berikutnya tidak membawa hotfix tanpa sengaja. Restore database **tidak diperlukan** (hotfix tidak menulis data selain operasi normal); gunakan backup §5.1 hanya bila ada kerusakan data yang terbukti. **Ingat:** rollback membuka kembali semua celah di atas.

## 6. Audit akun production (baca-saja) — SETELAH hotfix aktif, DENGAN persetujuan owner

Skrip: `laundry-be/scripts/audit-privileged-accounts.ts`. Semua kueri dalam transaksi PostgreSQL `READ ONLY` (penulisan ditolak database). Wajib flag `--i-have-owner-approval`. Keluaran JSON berizin `600` (berisi data pribadi).

```bash
cd /opt/dicuciin/dicuciin/laundry-be
npx ts-node scripts/audit-privileged-accounts.ts --i-have-owner-approval \
  --since 2026-01-01 --out /root/audit-akun-$(date +%Y%m%d).json
```

| Bagian laporan | Arti | Tindak lanjut (keputusan owner) |
|---|---|---|
| `privilegedAccounts` severity **HIGH** (`HAS_CUSTOMER_PROFILE` / `PHONE_VERIFIED_VIA_OTP`) | akun berhak istimewa yang dulunya pelanggan → hampir pasti V2 | nonaktifkan, cabut token, periksa aktivitasnya |
| `TOP_PRIVILEGE` / `STAFF_WITHOUT_OUTLET` / `CREATED_AFTER_SINCE` | perlu dicocokkan dengan daftar staf resmi | nonaktifkan yang tidak dikenal |
| `topupCredits` | kredit TOPUP per pelanggan (admin manual ATAU K1) | cocokkan dengan catatan top-up manual admin |
| `underpaidWalletPayments` | bayar saldo < total order (K4) | tagih / koreksi |
| `refundsByCustomers` | refund dicatat akun pelanggan (K3) | koreksi saldo |
| `manualMachineCommands` | perintah mesin tanpa order (K10 atau admin) | cocokkan dengan log teknisi |

Contoh penanganan akun mencurigakan (**perubahan data — hanya dengan persetujuan tertulis owner**, setelah backup):
```sql
BEGIN;
UPDATE users SET "isActive" = false WHERE id IN ('<id1>','<id2>');
UPDATE refresh_tokens SET "revokedAt" = now() WHERE "userId" IN ('<id1>','<id2>') AND "revokedAt" IS NULL;
COMMIT;
```
Catatan: kode `70dedee` mempercayai role di dalam access token sampai token kedaluwarsa (`JWT_ACCESS_EXPIRES_IN`) dan tidak memeriksa `isActive` per request; refresh token akun nonaktif ditolak. Bila ada indikasi eksploitasi aktif, pertimbangkan rotasi `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (semua pengguna harus login ulang) — keputusan owner.

## 7. Setelah hotfix

Branch `feat/production-readiness` sudah memuat perbaikan yang sama (lebih lengkap). Saat menggabungkan `main` (berisi hotfix) ke branch itu, konflik di `auth.service.ts`, `users.*`, `wallets.*`, `transactions.controller.ts`, `iot.controller.ts` diselesaikan dengan **versi production-readiness**, lalu jalankan ulang seluruh test.
