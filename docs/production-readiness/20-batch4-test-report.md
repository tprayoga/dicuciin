# 20 — Laporan Uji Batch 4 (Top-up Midtrans & Keamanan PIN)

Tanggal: 20 Nov 2026 · Branch `feat/production-readiness` · Lingkungan: Docker `postgres:16-alpine` terisolasi (`127.0.0.1:55499/dicuciin_test`). Tidak memakai DB development (55432), DB HWMS (5432), server, Midtrans nyata, atau mesin fisik.

Label: **[PG]** PostgreSQL nyata · **[MOCK-GW]** gateway tiruan (bukan Midtrans) · **[UNIT]** mock penuh.

## Ringkasan gate

| Gate | Hasil |
|---|---|
| Integration PostgreSQL nyata, **20 run berurutan suite penuh** | **20/20 valid & lulus, 184/184 tiap run** (0 tumpang tindih, 0 tidur host, 0 error koneksi, sidik jari kode sama `1e8f6051adbe319e`) |
| Unit backend | **264/264** (24 suite) |
| `tsc --noEmit` · `npm run build` · `prisma migrate diff` (migrasi ↔ skema) | exit 0 · sukses · *No difference detected* |
| Flutter mobile: analyze / test / build web | bersih / **8/8** / sukses |
| Flutter kiosk: analyze / test / build web | bersih / **2/2** / sukses |
| Admin (Nuxt) `npm run build` | sukses (tanpa test otomatis) |
| Pemindaian rahasia pada diff | bersih |
| Midtrans sandbox, Redis/BullMQ nyata, perangkat fisik | **NOT_VERIFIED** |

## Suite integration (184 test, 14 suite)

| Suite | Test | Isi |
|---|---|---|
| `wallet-topup.int-spec.ts` [PG][MOCK-GW] HTTP+JWT | 22 | nominal server, pakai ulang/ganti tagihan, webhook ganda paralel, gagal/kedaluwarsa, verifikasi provider, kepemilikan, simulate hanya mock, **top-up terlambat: 1 kredit + rekonsiliasi + refund eksternal dengan debit kompensasi, saldo terpakai → 409, eksekusi paralel → 1 debit, webhook setelah refund → no-op** |
| `wallet-pin.int-spec.ts` [PG] HTTP+JWT | 17 | penguncian, 20 tebakan paralel, ganti PIN, gerbang debit, **bukti sekali pakai terikat customer & sesi, kedaluwarsa, atomik (6 bayar paralel → 1 debit), dibatalkan saat kunci/ganti PIN**, redaksi |
| `refund-voucher-policy.int-spec.ts` [PG] | 6 | voucher kembali hanya bila layanan belum dikonsumsi & masih berlaku; idempoten; diaudit |
| `payment-lifecycle.int-spec.ts` [PG][MOCK-GW] | 19 | + regresi "order PAID tetap menahan mesin" |
| `mobile-compat.int-spec.ts` [PG] HTTP | 14 | app lama: verifikasi PIN via API lalu bayar tanpa PIN (bukti) |
| `kiosk-compat` 22 · `booking-activation` 26 · `checkout-pricing` 17 · `booking-scheduler` 12 · `authorization` 11 · `reconciliation` 11 · `legacy-reconciliation` 4 · `sequence` 2 · `app-module` 1 | 106 | regresi Batch 0–3 |

## Verifikasi akhir: 20 run berurutan suite integration PENUH

Skrip: `acceptance-loop.sh` (scratchpad sesi). Setiap run: `jest --config test/jest-integration.json --runInBand --forceExit` pada satu DB uji, log per run disimpan. Setiap baris mencatat:

- jumlah proses jest lain **sebelum dan sesudah** run (≠ 0 → `INVALID:OVERLAP`);
- `kern.sleeptime`/`kern.waketime` sebelum & sesudah (berubah → `INVALID:HOST_SLEEP`);
- jumlah `ECONNRESET`/`socket hang up` di log;
- sidik jari kode (SHA-256 dari `git diff HEAD` + file baru) — harus sama di semua run (kode tidak berubah selama loop).

| Run | Waktu (WIB) | Hasil | Jest lain sebelum/sesudah | Error koneksi | Sidik jari | Status |
|---|---|---|---|---|---|---|
| 1 | 22:27:54-22:29:55 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 2 | 22:29:55-22:31:40 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 3 | 22:31:41-22:33:30 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 4 | 22:33:31-22:35:18 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 5 | 22:35:18-22:36:55 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 6 | 22:36:56-22:38:48 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 7 | 22:38:48-22:40:29 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 8 | 22:40:29-22:42:06 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 9 | 22:42:07-22:43:57 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 10 | 22:43:57-22:45:45 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 11 | 22:45:45-22:47:31 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 12 | 22:47:31-22:49:15 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 13 | 22:49:15-22:50:59 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 14 | 22:50:59-22:52:38 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 15 | 22:52:39-22:54:16 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 16 | 22:54:16-22:55:57 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 17 | 22:55:57-22:57:31 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 18 | 22:57:31-22:59:12 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 19 | 22:59:13-23:00:53 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |
| 20 | 23:00:53-23:02:21 | 184/184 | 0/0 | 0 | `1e8f6051adbe319e` | VALID |

**Hasil: 20 dari 20 run valid, 20 lulus (3.680/3.680 test), 0 gagal.** Log per run: `flaky-logs/acceptance/run-N.log` (scratchpad sesi, tidak di-commit).

Run yang tidak valid atau terputus **tidak dihitung lulus** (lihat bagian berikut).

## Tiga akar masalah test intermiten — teridentifikasi & diverifikasi

### 1. Mesin dipakai bersama antar-iterasi balapan (`payment-lifecycle` "batal vs pelunasan paralel (8×)")

- **Gejala**: sesekali 409 "mesin sedang dipakai" di iterasi berikutnya.
- **Akar**: bila pelunasan menang, booking RESERVED **dengan benar** tetap menahan mesin; iterasi berikutnya memakai mesin yang sama → 409. Bukan cacat produk, cacat test.
- **Bukti**: direproduksi deterministik dengan memaksa pelunasan menang.
- **Perbaikan**: mesin baru per iterasi + test regresi "order PAID tetap menahan mesin" (memastikan perilaku produk dipertahankan).
- **Verifikasi**: worktree terisolasi di `b84fdb3` + perbaikan → **20/20 run bersih (138/138)**, folder `round2`.

### 2. supertest menutup server bersama (ECONNRESET / socket hang up)

- **Akar**: bila server Nest belum `listen`, supertest memanggil `app.listen(0)` per request dan `end()` memanggil `server.close()` pada server **yang sama** → request paralel lain di test yang sama terputus.
- **Bukti**: suite HTTP (53 test) 15 run → run 8 & 13 gagal dengan `socket hang up` (2/15), folder `hangup`.
- **Perbaikan**: `await app.listen(0, "127.0.0.1")` sekali di `beforeAll` pada 6 suite HTTP (authorization, kiosk-compat, mobile-compat, reconciliation, wallet-pin, wallet-topup).
- **Verifikasi**: setelah perbaikan, 0 error koneksi di semua run (folder `hangup-fixed`) dan di 20 run akhir.

### 3. Listen wildcard dibayangi proses lain pada port yang sama (404 salah alamat)

- **Gejala**: `hangup-fixed` run 4 → 14 test gagal dengan 404 dari rute yang ada.
- **Akar**: di macOS, server yang listen di alamat wildcard (`::`/`0.0.0.0`) dapat berbagi port dengan proses lain yang bind `127.0.0.1` pada port yang sama (SO_REUSEADDR); koneksi ke `127.0.0.1` diarahkan ke proses lain → 404. Hanya terjadi bila dua proses uji berjalan **bersamaan** (run 4 tumpang tindih dengan proses jest lain).
- **Bukti**: `portrepro.js` — listener wildcard dibayangi; dengan bind loopback eksplisit proses kedua mendapat `EADDRINUSE` (tidak bisa dibayangi).
- **Perbaikan**: bind loopback eksplisit (`127.0.0.1`) di semua suite HTTP; loop akhir mencatat & menandai tumpang tindih.
- **Verifikasi**: 20 run akhir: 0 tumpang tindih tercatat, 0 respons 404 salah alamat. Server uji kini bind `127.0.0.1` secara eksplisit di keenam suite HTTP (diperiksa: `grep -l 'listen(0, "127.0.0.1")'` → 6 file).

Kegagalan intermiten Batch 3 (satu test, log tidak tersimpan) konsisten dengan akar #1/#2 (suite gabungan yang sama), tetapi karena lognya hilang **tidak dapat dibuktikan** test mana yang gagal — dicatat sebagai "kemungkinan besar #1/#2".

## Run tidak valid / terputus (tidak dihitung)

| Folder | Run | Alasan | Bukti |
|---|---|---|---|
| loop pertama | 4 | `prisma generate` dijalankan di working tree saat loop berjalan (kontaminasi) | log |
| `invalid-sleep` | 9–19 | host tidur (Clamshell Sleep 13:41:39 +0700, lalu DarkWake) → timeout | `pmset -g log` |
| `hangup-fixed` | 4 | tumpang tindih dengan proses jest lain → 404 (akar #3) | log |
| `hangup-fixed` | 9 | host tidur 22:02:11–22:08:31 di tengah run (run 22:02:06–22:09:01) → timeout 60 dtk | `kern.sleeptime/waketime` |
| `hangup-fixed` | 11 | loop dihentikan (log kosong) | — |
| `final-superseded-precode` | 1–2 | lulus 173/173 tetapi kode berubah sesudahnya (test PIN-proof & top-up terlambat ditambah) | — |
| `acceptance-aborted-detector` | 1–2 | detektor tidur salah (`grep " Wake "` cocok dengan assertion "Video Wake Lock" Chrome) menandai run 1 (184/184) sebagai tidak valid; loop dihentikan, detektor diganti `kern.sleeptime/waketime`, 20 run diulang dari awal | `pmset -g log` |

## Uji mutasi (kode sengaja dirusak → test harus gagal)

| Mutasi | Tertangkap |
|---|---|
| Hapus `FOR UPDATE` verifikasi PIN | ✅ (20 tebakan paralel) |
| Hapus gerbang PIN pembayaran saldo | ✅ |
| Bukti tidak dikonsumsi / tanpa syarat `consumedAt IS NULL` | ✅ (replay, 6 paralel) |
| Abaikan `sessionHash` | ✅ |
| Tidak membatalkan bukti saat terkunci | ✅ |
| Hapus redaksi respons | ✅ |
| Settle top-up tanpa cek status PAID | ✅ (webhook ganda) |
| Hapus batas nominal top-up | ✅ |
| Kebijakan voucher tanpa cek konsumsi layanan | ✅ |
| Refund top-up tanpa cek saldo terpakai | ✅ (409) |
| Settle top-up REFUNDED tidak no-op | ✅ (500 → ditemukan & diperbaiki sebagai bug nyata) |

## NOT_VERIFIED

| Item | Alasan |
|---|---|
| Midtrans sandbox untuk top-up (`TOP-…`) & PIN | Tidak dijalankan (belum deploy; tanpa transaksi nyata) |
| Redis + BullMQ nyata | logika job diuji langsung |
| App mobile/kiosk di perangkat, admin di browser | hanya analyze/test/build |
| Mesin IoT fisik | ditunda owner |

## Kesimpulan

Semua gate lokal wajib lulus → **Batch 4 ACCEPTED (gate lokal)**. Penerimaan produksi tetap menunggu: deploy, uji Midtrans sandbox untuk top-up `TOP-…`, dan uji aplikasi di perangkat.
