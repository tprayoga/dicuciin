# 10 — Kompatibilitas Kiosk (Fase 1 Batch 1.5)

Status: **TESTED** (PostgreSQL nyata, HTTP + JWT asli + token perangkat asli) · belum deploy.
Bukti: `laundry-be/test/integration/kiosk-compat.int-spec.ts` (22 test), `src/modules/kiosks/kiosks.service.spec.ts`.

## Model autentikasi kiosk (dipertahankan)

Kiosk **tidak** memakai JWT. Saat enrollment (kode 6 digit dari admin, berlaku 10 menit) kiosk menerima token acak 32 byte; server hanya menyimpan hash SHA-256 (`kiosks.deviceTokenHash`). Token bisa dicabut admin (`tokenRevokedAt`) dan kiosk nonaktif ditolak. Batch 1.5 memusatkan verifikasinya di `src/common/auth/kiosk-device.ts` (sebelumnya hanya di `KiosksService`).

## Defect & akar masalah

| # | Gejala | Akar masalah | Perbaikan |
|---|---|---|---|
| 1 | `POST /pricing/calculate` dari kiosk → **401** | Rute dijaga `JwtAuthGuard` global; kiosk mengirim token perangkat (bukan JWT) → passport-jwt menolak. | Guard eksplisit `JwtOrKioskDeviceGuard` + dekorator `@AllowKioskDevice()` **hanya** pada `/pricing/calculate`. Token berbentuk JWT → diverifikasi passport-jwt seperti biasa; selain itu → diverifikasi sebagai token kiosk. Keduanya gagal → 401. Untuk kiosk, server **memaksa** `outletId` = outlet kiosk, `customerId`/`partnerId` dibuang, `sourcePlatform=KIOSK` (tidak bisa mengintip harga tier/partner orang lain). Guard JWT global **tidak** dimatikan. |
| 2 | Order kiosk tidak terikat mesin | Aplikasi kiosk hanya menulis mesin di `notes` ("Mesin X (KODE)"); backend tidak pernah membuat booking. | Kiosk versi baru mengirim `deviceId`. `POST /kiosks/device/orders` & `/kiosks/device/checkout` **mewajibkan** mesin (tanpa mesin → 400 *sebelum* bayar). Order + booking HOLD dibuat atomik (kunci baris mesin, cek bentrok — sama dengan mobile). Booking tamu kiosk boleh tanpa customer (`machine_bookings.customerId` kini nullable). Jadwal dari klien diabaikan (kiosk = pakai sekarang). |
| 3 | Transaksi kiosk yang dibayar tidak menyalakan mesin | Hook PAID hanya menyalakan order yang punya binding mesin; order kiosk tidak punya. Setelah Batch 1, order ber-booking menunggu scan QR — tamu kiosk tidak punya aplikasi untuk scan. | `IotMachineService.startKioskOrder`: dipanggil hook PAID (QRIS/VA webhook, saldo). Syarat **semua** wajib: `order.kioskId` ada (hanya bisa di-set rute perangkat kiosk — rute JWT membuangnya), order PAID **dan** ada baris `Payment` PAID, booking RESERVED tanpa jadwal & belum kedaluwarsa. START idempoten (`requestMachineStart`): webhook ganda / retry paralel → tetap 1 perintah. |

## Temuan keamanan tambahan (diperbaiki di batch ini)

| Temuan | Risiko | Perbaikan |
|---|---|---|
| **Bayar saldo di kiosk tanpa PIN** — `POST /kiosks/device/checkout` mendebit saldo customer mana pun yang No. HP / kode member-nya diketik. | Siapa pun di depan kiosk bisa menghabiskan saldo orang lain (Kritis). | PIN wallet 6 digit **wajib** (`verifyWalletPinWithLockout`). 5× salah → terkunci 15 menit (`WALLET_PIN_MAX_ATTEMPTS`, `WALLET_PIN_LOCK_MINUTES`). PIN belum diatur → ditolak dengan arahan atur PIN di aplikasi. Respons PIN salah = **400** (bukan 401, karena kiosk menganggap 401 = token perangkat dicabut lalu minta enroll ulang). |
| Kiosk bisa membaca status pembayaran / status mesin / simulate milik kiosk lain | Kebocoran data antar-kiosk | `devicePaymentStatus`, `simulateDevicePayment` → 404 bila bukan milik kiosk; `deviceMachineStatus` → 403. |
| Order dibatalkan lalu QRIS-nya tetap dibayar → order batal **hidup lagi** jadi PAID (berlaku juga untuk mobile) | Status order salah, mesin bisa menyala dari order yang sudah batal | `settlePaidInTx` mengunci baris order; pembayaran untuk order CANCELLED/REFUNDED **dicatat PAID** (jejak uang) tetapi order tidak dihidupkan, mesin tidak menyala, dan log "PERLU REFUND MANUAL" ditulis. `OrdersService.cancel` kini juga mengunci baris order & memeriksa ulang status di dalam transaksi (tidak bisa balapan dengan webhook). |
| Pelanggan menekan kembali di layar bayar lalu pesan lagi mesin yang sama → **409** (mesin tertahan HOLD order sendiri) | Kiosk macet 10 menit | `POST /kiosks/device/orders/:id/cancel` (hanya order kiosk sendiri yang belum dibayar; diperiksa ulang di bawah kunci). Aplikasi kiosk membatalkan order lama sebelum membuat yang baru, dan meminta konfirmasi sebelum meninggalkan layar bayar. |

## Endpoint kiosk (setelah Batch 1.5)

| Endpoint | Auth | Catatan |
|---|---|---|
| `POST /pricing/calculate` | JWT **atau** token kiosk | Dulu 401 untuk kiosk |
| `POST /kiosks/device/orders` | token kiosk | **Wajib** `deviceId`/`deviceCode` |
| `POST /kiosks/device/checkout` | token kiosk | Bayar saldo: **wajib** `customerLookup` + `pin` + mesin |
| `POST /kiosks/device/payments` | token kiosk | Order milik kiosk ini |
| `GET /kiosks/device/payments/:no/status` | token kiosk | Milik kiosk ini (404 bila bukan) |
| `GET /kiosks/device/orders/:id/machine-status` | token kiosk | Milik kiosk ini (403 bila bukan) |
| `POST /kiosks/device/orders/:id/machine-start` | token kiosk | **Baru** — coba nyalakan ulang (order PAID; ≤3 percobaan bila FAILED) |
| `POST /kiosks/device/orders/:id/cancel` | token kiosk | **Baru** — batalkan order belum dibayar, lepas mesin |

Token kiosk **tidak** diterima di rute JWT lain (diuji: `GET /orders`, `POST /orders` → 401).

## Aplikasi kiosk (laundry_kiosk_flutter)

- Mengirim `deviceId` mesin pada order & checkout saldo.
- Kolom **PIN wallet** saat metode Wallet.
- Membatalkan order belum dibayar saat kembali/ganti pesanan; dialog konfirmasi sebelum meninggalkan layar bayar.
- Layar sukses menampilkan status mesin **dari server** (Menyalakan… / sudah menyala / gagal) — tidak lagi langsung menulis "sudah bisa digunakan". Tombol **Nyalakan Ulang** bila FAILED/tidak merespons.
- Verifikasi: `flutter analyze` bersih, `flutter test` lulus, `flutter build web --release` berhasil. **Belum** diuji di perangkat kiosk fisik.

## Kompatibilitas versi

| | Backend lama (production saat ini) | Backend baru |
|---|---|---|
| **Kiosk lama** | Seperti sekarang (harga 401, mesin tak menyala) | Harga OK; **order & checkout saldo ditolak** dengan pesan "Pilih mesin … aplikasi kiosk perlu diperbarui" (sebelum bayar — tidak ada uang yang tertahan) |
| **Kiosk baru** | **Gagal** (backend lama menolak `deviceId`) | OK |

→ Kiosk **wajib** diperbarui segera setelah backend (lihat 11-deployment-compatibility.md). Mengurai mesin dari `notes` kiosk lama sengaja **tidak** dilakukan (rapuh, dan identitas mesin tidak terverifikasi).

## Sisa risiko

- Perangkat IoT fisik belum diuji; "START dipublikasikan" di test = perintah tercatat + dikirim ke broker MQTT tiruan.
- Guest kiosk dengan `customerLookup` pada QRIS: order diatribusikan ke customer itu tanpa PIN (poin/loyalty masuk ke customer tersebut). Tidak ada uang customer yang terpakai; dicatat untuk Batch 2.
- Pembayaran setelah batal butuh **refund manual** (kebijakan refund owner masih tertunda); laporan ada di skrip rekonsiliasi (`paidOnClosedOrders`).
