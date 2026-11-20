# 19 — Keamanan PIN Wallet (Batch 4 — temuan S5)

Status: **TESTED** (PostgreSQL nyata, termasuk konkuren) · belum deploy.

## Temuan audit (sebelum Batch 4)

| # | Celah | Dampak |
|---|---|---|
| 1 | Ganti PIN (`/wallets/customer/:id/pin/set`) tanpa PIN lama | Siapa pun yang memegang sesi (token dicuri / HP dipinjam) bisa mengganti PIN lalu memakai saldo |
| 2 | `/pin/verify` mobile tanpa penguncian | Tebakan PIN 6 digit tak terbatas (hanya dibatasi throttler global) |
| 3 | Pembayaran saldo mobile (`/payments/wallet`, rute lama `/wallets/customer/:id/pay`, `/transactions/checkout`) **tidak memeriksa PIN di server** | PIN hanya di UI; API bisa dipanggil langsung tanpa PIN |
| 4 | Penguncian kiosk (Batch 1.5) bisa dilewati dengan request **paralel** | Semua request membaca "belum terkunci" sebelum penghitung bertambah → banjir tebakan dievaluasi semua |
| 5 | Hash PIN ikut terkirim di respons yang memakai `customer: true` (mis. `GET /wallets/customer/:id`) | Kebocoran hash bcrypt + penghitung |
| 6 | PIN salah dibalas 401 | Klien bisa salah mengira sesi habis |

## Desain sekarang (`src/common/auth/wallet-pin.ts`, satu modul untuk mobile, kiosk, rute lama)

- **Hash** bcrypt cost 10; PIN tidak pernah dicatat (body tidak di-log) dan tidak pernah dikembalikan.
- **Verifikasi terserialisasi**: `SELECT … FROM customers … FOR UPDATE` dalam transaksi → percobaan paralel dievaluasi satu per satu. Penghitung salah di-commit SEBELUM error dilempar.
- **Penguncian**: 5× salah berturut-turut → 15 menit (`WALLET_PIN_MAX_ATTEMPTS`, `WALLET_PIN_LOCK_MINUTES`). Selama terkunci, PIN benar pun ditolak (403). Sukses → penghitung reset.
- **Ganti PIN**: bila PIN sudah ada, `currentPin` wajib dan ikut terkena penguncian.
- **Gerbang debit saldo** `requireWalletAuthorization(customerId, pin?)` di SEMUA jalur JWT yang mendebit saldo customer:
  - PIN dikirim → diverifikasi (penguncian);
  - tanpa PIN → wajib **bukti PIN sekali pakai** dari `/pin/verify` yang sukses ≤ `WALLET_PIN_PROOF_SECONDS` (120 dtk) sebelumnya.
  - Bukti disimpan di tabel `wallet_pin_proofs` (customerId, **sessionHash** = SHA-256 access token, expiresAt, consumedAt). Token mentah tidak pernah disimpan.
  - Konsumsi atomik: `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED) RETURNING` → tepat satu permintaan memakai satu bukti, walau paralel.
  - Hanya berlaku untuk customer yang sama **dan** sesi (access token) yang sama; tidak bisa diputar ulang (consumedAt); kedaluwarsa singkat; dibatalkan saat PIN terkunci atau diganti; tidak bisa dipakai selama terkunci. Baris tidak dihapus (jejak audit).
  - Ini menjaga kompatibilitas app lama (yang memverifikasi PIN via API lalu membayar tanpa PIN) **tanpa** melemahkan server.
- **Kiosk**: tetap wajib PIN pada checkout saldo (modul yang sama, kini aman paralel).
- **Redaksi global**: `TransformInterceptor` membuang `walletPinHash`, `walletPinFailedAttempts`, `sessionHash`, `passwordHash`, `deviceTokenHash`, `enrollmentCodeHash`, `tokenHash`, `codeHash` dari SEMUA respons.
- **Kode status**: PIN salah 400, terkunci 403, belum diatur 400, tanpa PIN/bukti 403 (tidak pernah 401).

## Endpoint

| Endpoint | Catatan |
|---|---|
| `GET /wallets/me/pin` | `{hasPin, lockedUntil}` |
| `POST /wallets/me/pin` | `{pin, currentPin?}` — `currentPin` wajib saat mengganti |
| `POST /wallets/me/pin/verify` | penguncian + menerbitkan bukti sekali pakai |
| `POST /wallets/customer/:id/pin/set` · `/pin/verify` | rute lama (app lama) — aturan sama |
| `POST /payments/wallet` | `pin` opsional (atau bukti) |
| `POST /wallets/customer/:id/pay` (lama) | `pin` opsional (atau bukti) |
| `POST /transactions/checkout` | customer: `pin` atau bukti; partner B2B: belum ada PIN (risiko) |

## Aplikasi

- Mobile: lembar PIN menampilkan pesan server (salah / terkunci); halaman Ubah PIN mengirim PIN lama; pembayaran saldo tetap memverifikasi PIN lewat server sebelum membayar (bukti dikonsumsi pembayaran).
- Kiosk: tidak berubah — sudah mengirim PIN; terkunci = 403 (bukan 401, tidak memicu enroll ulang).

## Penilaian keamanan kompatibilitas app lama

| Syarat | Status | Bukti |
|---|---|---|
| Terikat customer terautentikasi | ✅ customerId dari JWT + kepemilikan wallet | bukti A tidak mengotorisasi saldo B |
| Terikat sesi | ✅ SHA-256 access token | bukti sesi 1 ditolak di sesi 2 |
| Kedaluwarsa singkat | ✅ 120 dtk (konfigurabel) | uji 1 dtk |
| Dikonsumsi atomik | ✅ FOR UPDATE SKIP LOCKED + consumedAt | 6 pembayaran paralel, 1 bukti → 1 debit |
| Tidak bisa diputar ulang | ✅ | pembayaran kedua → 403 |
| Tidak bisa melewati via konkurensi | ✅ | idem + 20 tebakan PIN paralel → tepat 4×400 |
| Dibatalkan saat terkunci / ganti PIN | ✅ | test kedaluwarsa & pembatalan |

Sisa risiko: siapa pun yang memegang access token yang sama DAN mengetahui bahwa pemiliknya baru memasukkan PIN (≤120 dtk) dapat memakai bukti itu sekali — setara dengan memegang sesi aktif; jendela dibatasi & dikonsumsi sekali.

## Bukti (wallet-pin.int-spec, 17 test)

4× salah → 400, ke-5 → 403, PIN benar saat terkunci → 403, buka kunci → sukses & reset · **20 tebakan paralel → tepat 4×400 + 16×403** · PIN benar diselipkan di banjir tebakan → tidak lolos setelah kunci · ganti PIN tanpa/salah PIN lama ditolak, tebakan PIN lama terkena kunci · `/payments/wallet` tanpa PIN/bukti 403, PIN salah 400, PIN benar sekali debit · bukti sekali pakai & kedaluwarsa · terkunci → bayar ditolak · bukti A tidak berlaku untuk saldo B · respons tanpa hash/penghitung/bukti.

Bukti sekali pakai (6 test tambahan): terikat sesi · terikat customer · 1 bukti × 6 pembayaran paralel → 1 debit, bukti tersimpan sebagai terpakai · kedaluwarsa 1 dtk · kunci & ganti PIN membatalkan bukti · selama terkunci bukti tidak berlaku · DB hanya menyimpan hash sesi.

Uji mutasi: menghapus kunci baris, gerbang PIN, konsumsi bukti, redaksi, ikatan sesi, syarat `consumedAt IS NULL`, atau pembatalan bukti saat terkunci → test gagal.

## Risiko terbuka

- Dompet partner B2B belum memiliki PIN.
- Bukti PIN 120 dtk: dalam jendela itu satu pembayaran oleh customer yang sama tidak meminta PIN lagi (by design untuk app lama).
- Setelah app lama tidak beredar, pertimbangkan mewajibkan `pin` di body dan menghapus bukti.
