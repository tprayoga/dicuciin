# 23 — Batch 6: UX Mobile & Kelengkapan Fitur (Fase 4)

Status: **TESTED** (PostgreSQL nyata + test Flutter) · belum deploy · app di HP / iPhone **NOT_VERIFIED**.

## Ringkasan per temuan

| Temuan | Masalah (sebelum) | Perubahan | Server menegakkan? |
|---|---|---|---|
| **T8** jam operasional | Slot booking tetap 08–21 dari jam HP; setelah 21:00 tetap muncul jam lewat | `outlets.openTime/closeTime` (WIB, `OUTLET_TZ_OFFSET_MINUTES`) → daftar mesin mengirim `operatingHours`; aplikasi membuat slot per jam dari jam outlet (zona outlet, bukan zona HP); kosong → "Tidak ada slot tersisa hari ini" | **Ya** — order/booking terjadwal di luar jam → 400. Jam kosong/tidak valid = tanpa batasan (perilaku lama); `open=close` = 24 jam; lewat tengah malam didukung |
| **S3** kapasitas & layanan mesin | Aplikasi menebak harga/kapasitas dari layanan pertama yang cocok tipe; isian "Kapasitas" di admin tidak tersambung | `iot_devices.capacityKg` + `serviceId` (FK); admin Kelola Mesin mengisi kapasitas & layanan (disaring tipe mesin); daftar mesin mengirim kapasitas + layanan + harga outlet; aplikasi memakai data mesin (fallback ke tebakan lama bila belum diatur) | **Ya** — order untuk mesin berlayanan dengan layanan lain → 400; layanan pengering tidak bisa dipasang di mesin cuci (dan sebaliknya) |
| **S6** tier | Tier tertinggi menampilkan "Sedikit lagi menuju Silver" (label default) | `nextTier: null` di tier tertinggi; aplikasi menampilkan "Kamu sudah di tier tertinggi" | — |
| **S7** status & filter | Mesin OFFLINE tampil "Maintenance"; tombol Washing/Dryer di beranda sama-sama membuka lokasi tanpa filter | Status `Offline` terpisah dari `Maintenance`; tombol Washing/Dryer membuka detail outlet dengan tab tipe yang sesuai | — |
| **S8** instruksi & ulasan | Halaman sukses menampilkan jadwal tetap "11:00 s/d 11:30" & meminta ulasan sebelum mesin dipakai | Jadwal sebenarnya (dari `scheduledAt` + durasi); kartu "Langkah berikutnya" (datang → scan QR → mesin menyala → ulasan); form ulasan pindah ke **detail order SELESAI**; notifikasi "Cucian selesai — beri ulasan" | **Ya** — pelanggan hanya mengulas order miliknya yang sudah dibayar (app lama tetap bisa mengulas setelah bayar) |
| **R1** notifikasi | Halaman notifikasi berisi data contoh; titik merah selalu tampil | Tabel `notifications` + `GET /notifications/me`, tandai dibaca/semua; ditulis **di transaksi kejadian**: order lunas, cucian selesai (minta ulasan), top-up masuk; `dedupeKey` unik → webhook/scheduler ulang tidak menggandakan; titik merah hanya bila ada yang belum dibaca; ketuk → detail order | **Ya** |
| **R2** layanan pelanggan & kebijakan | Menu Hubungi Kami / Ketentuan / Privasi tanpa aksi; baris kontak tidak bisa diketuk | WhatsApp / email / telepon bisa diketuk; Ketentuan & Privasi membuka `dicuciin.com/*.html` (`WEBSITE_BASE_URL`) | — |
| **R3** tukar poin | Tidak ada tombol tukar; `redeemPointVoucher` tak terpakai; server tidak menegakkan periode/tier/segmen/batas per pengguna; kuota tidak atomik | `GET /mobile/me/rewards` (katalog + "bisa ditukar" + alasan); halaman Tukar Poin; aturan tunggal `rewardBlockers` untuk katalog **dan** penukaran; baris template dikunci saat menukar | **Ya** — tier, periode, segmen, batas per pengguna, kuota (paralel aman) |
| **R4** merek bank & merchant | "Bank Permata" tampil sebagai **"CIMBNIAGA"** di checkout; nama merchant tidak ditampilkan padahal instruksi meminta mencocokkannya | Widget `BankBrandMark` dipakai checkout, top-up, VA, detail order; "Merchant: Di.Cuciin" di QRIS, "a.n. Di.Cuciin" di VA (`MERCHANT_NAME`) | — |
| **R5** simpan QRIS | Tidak bisa menyimpan QR (pembayaran dari HP yang sama sulit) | Tombol "Simpan QR ke Galeri" (`gal` 3.0.1; Android ≤9 izin `WRITE_EXTERNAL_STORAGE maxSdk 28`; iOS `NSPhotoLibraryAddUsageDescription`); web → membuka gambar | — |
| **R7** layar & kode mati | Unggah bukti bayar (tidak dipakai), widget `LoadingView`/`SectionHeader` tak dipakai | Dihapus (service, controller, model, 2 widget) | — |

Tidak berubah: kiosk (regresi lulus), IoT fisik (ditunda).

## Tindakan owner (data & dashboard)

- **Kelola Mesin**: isi kapasitas & layanan untuk setiap mesin (sampai diisi, aplikasi memakai tebakan lama).
- **Kelola Outlet**: pastikan `Jam Buka/Tutup` benar ("HH:mm", WIB). Outlet tanpa jam = tanpa batasan.
- **Layanan** (R7): rapikan nama/kapasitas/kategori dryer; pastikan setiap layanan mesin punya harga aktif di outletnya (tanpa harga, aplikasi tidak menampilkan layanan mesin).
- **Midtrans dashboard**: pastikan nama merchant benar (temuan "Manugggal") dan sama dengan `MERCHANT_NAME` aplikasi.
- **Push notification** (FCM) belum ada — notifikasi hanya terlihat saat membuka aplikasi.

## Bukti

| Suite | Test | Isi |
|---|---|---|
| `batch6-features.int-spec.ts` [PG] | 16 | T8 (order & reservasi lama di luar jam 400, tanpa jam = bebas, jam di daftar mesin) · S3 (data mesin & harga outlet, layanan tanpa harga aktif → null, order layanan salah 400, layanan pengering ↛ mesin cuci) · S6 · R1 (**webhook PAID 2× paralel → 1 notifikasi**; **selesai 2× paralel → 1 notifikasi**; baca milik sendiri; order tamu kiosk tanpa notifikasi) · S8 (ulasan order belum bayar / milik orang lain ditolak) · R3 (katalog, tier/periode/batas per pengguna, **6 penukaran paralel kuota 2 → tepat 2**) |
| `wallet-topup.int-spec.ts` | +assert | webhook top-up 6× paralel → 1 notifikasi TOPUP_PAID |
| Unit `operating-hours.spec.ts` | 6 | parse, WIB, batas inklusif/eksklusif, lewat tengah malam, 24 jam, data kosong |
| Unit `reward-eligibility.spec.ts` | 10 | setiap penghalang & visibilitas |
| Flutter `batch6_test.dart` | 9 | slot dari jam outlet (20:30 → 21:00 saja; setelah tutup kosong; besok 07–21; lewat tengah malam; 24 jam; tanpa data 08–21), parsing mesin/layanan, Permata ≠ CIMB, notifikasi & katalog |

## Migrasi

`20261124090000_machine_service_notifications_account_deletion` — aditif: `iot_devices.capacityKg`, `serviceId` (FK SET NULL); tabel `notifications` (+ `dedupeKey` unik); tabel `account_deletion_requests`, enum `AccountDeletionStatus`, `users.deletedAt`, `OtpPurpose.ACCOUNT_DELETION` (lihat 22). Rollback: 08.
