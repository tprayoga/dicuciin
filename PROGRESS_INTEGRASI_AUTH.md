# Progres Integrasi Mobile ↔ Backend — Auth + PIN Wallet

Terakhir diperbarui: 2026-05-30 (update: lengkapi register + percantik login)

Dokumen ini mencatat status integrasi aplikasi mobile (Flutter) ke backend
(NestJS) untuk fitur **login, register (OTP WhatsApp), dan PIN wallet**.

## Model yang dipakai
- **Register:** HP → OTP via **WhatsApp** (verifikasi nomor) → lengkapi data **+ password**
  → buat **PIN wallet** 6 digit.
- **Login:** identifier (HP/email) + **password** (`/auth/login`).
- OTP hanya untuk verifikasi nomor saat register. PIN wallet khusus pembayaran.
- `User.passwordHash` tetap wajib (tidak diubah).

## Parameter terkunci
- OTP: 4 digit, berlaku 5 menit, maks 3 request/jam/nomor, maks 5x salah → hangus.
- PIN wallet: 6 digit, hash bcrypt, disimpan di `Customer.walletPinHash`.
- Verifikasi register: OTP-verify mengembalikan verification token (JWT 15 menit,
  secret terpisah `JWT_OTP_SECRET`, fallback `JWT_ACCESS_SECRET + "_otp"`).

---

## ✅ SELESAI (sudah diuji end-to-end di BE, mobile lolos `flutter analyze`)

### Backend
- [x] Prisma: tabel `otp_codes`, enum `OtpPurpose`, `User.phoneVerifiedAt`,
      `Customer.walletPinHash` + `pinSetAt`. Migration `add_otp_and_wallet_pin` applied.
- [x] `WhatsappService` (Fonnte) + **dev-fallback** (log OTP bila `WA_API_KEY` kosong).
      File: `laundry-be/src/modules/notifications/whatsapp.service.ts`
- [x] `OtpService`: `requestOtp` / `verifyOtp` + rate limit (DB-based) + verification token.
      File: `laundry-be/src/modules/auth/otp.service.ts`
- [x] Endpoint: `POST /auth/otp/request`, `POST /auth/otp/verify`.
- [x] `POST /auth/register` wajib `verificationToken` untuk role CUSTOMER; set `phoneVerifiedAt`.
- [x] PIN wallet: `POST /wallets/customer/:id/pin/set` & `/pin/verify` (ada cek kepemilikan
      customer vs user login). File: `wallets.service.ts` / `wallets.controller.ts`.
- [x] `GET /auth/me` mengekspos `customer.hasWalletPin`, **tidak** membocorkan `walletPinHash`.
- [x] Env: `WA_PROVIDER`, `WA_API_KEY`, `WA_SENDER`, `JWT_OTP_SECRET` (di `.env` & `.env.example`).

### Mobile (Flutter)
- [x] `AuthService`: `requestOtp`, `verifyOtp`, `register` (+ verificationToken & password),
      `setWalletPin`, `verifyWalletPin`.
- [x] `AuthController`: `requestOtp`, `verifyOtp`, `completeRegistration` (register + set PIN +
      refresh profil). `signInPreview` dummy tidak lagi dipakai di flow nyata.
- [x] UI `auth_flow_screens.dart`: kirim OTP asli saat "Lanjut", verifikasi + "Kirim Ulang",
      **field Password** di Lengkapi Data, CreatePin → register asli. Nomor dinormalisasi ke `62…`.
      Tombol "Masuk" → `LoginScreen` (password). Helper `RegistrationDraft` untuk threading data.
- [x] `WalletController` di-wire via `ChangeNotifierProxyProvider<AuthController, WalletController>`;
      `setPin`/`verifyPin` ke BE; `hasPin` dari server (`customer.hasWalletPin`).
- [x] PIN in-app (sheet bayar + halaman setting PIN) verifikasi ke BE (async).
- [x] `CustomerProfile.hasWalletPin` ditambahkan.
- [x] Hapus `register_screen.dart` (yatim & tidak kompatibel).
- [x] AndroidManifest: izin `INTERNET` + `usesCleartextTraffic="true"` (dev).

### Verifikasi yang sudah dijalankan (BE, via curl)
- request OTP → kode muncul di log; verify → verificationToken; register → user+token,
  `phoneVerifiedAt` terisi; login password OK; set PIN OK; verify PIN benar `valid:true`,
  salah `401`; register tanpa token `400`; OTP nomor terdaftar `409`;
  `getMe` → `hasWalletPin:true` tanpa `walletPinHash`.

---

### Update lanjutan (sesi ini)
- [x] **Login dipercantik** — gaya header biru + sheet putih (`login_screen.dart`): wordmark,
      sapaan, field berikon, toggle password, link "Lupa password?" (placeholder → toast info),
      tombol Masuk, link Daftar. Setelah login sukses `popUntil(first)` agar HomeScreen tampil.
- [x] **Toast terpusat** `shared/widgets/app_toast.dart` (`success`/`error`/`info`).
      Dipakai: login berhasil, registrasi berhasil, lupa-password "segera hadir".
- [x] **ApiClient** lebih tahan banting: base URL tanpa skema otomatis diberi `http://`
      (mencegah error URL relatif di Flutter Web).
- [x] **Register dilengkapi (data tambahan):**
  - BE: `User.avatarUrl` (migration `add_user_avatar`); `RegisterDto` terima `birthDate`+`gender`
    dan disimpan ke `Customer`; endpoint `uploads/profile/:userId` kini **menyimpan avatarUrl**
    + cek kepemilikan; **static serving** `/uploads/` aktif di `main.ts`
    (+ helmet `crossOriginResourcePolicy: cross-origin` agar foto bisa dimuat lintas origin).
  - Mobile: `ApiClient.postMultipartBytes` (upload **web-safe** pakai bytes);
    `AuthService.register` kirim birthDate/gender + `uploadAvatar()`; `AppUser.avatarUrl`;
    `RegistrationDraft` bawa birthDate/gender/photoBytes; CompleteData kirim tgl lahir (ISO)
    + gender; UploadProfile pakai **bytes** (`Image.memory`, hapus `dart:io File`);
    `completeRegistration` upload foto setelah register (best-effort) lalu refresh profil.

> ⚠️ **Belum terverifikasi end-to-end:** field register baru (birthDate/gender/avatar) belum
> sempat diuji via curl karena ada **server lama nyangkut di port 3000 (EADDRINUSE)**.
> Kode sudah lolos compile (BE `tsc` clean, mobile `flutter analyze` clean).
> **Cara verifikasi:** matikan server lama lalu start bersih:
> `lsof -ti:3000 | xargs kill -9` → `npm run start:dev` → jalankan flow register, cek `GET /auth/me`
> mengembalikan `customer.birthDate`, `customer.gender`, dan `avatarUrl` (file di `/uploads/profiles/...`).

## ⏳ TODO (belum dikerjakan — tahap berikutnya)

- [ ] **Saldo & transaksi wallet ke API** — `WalletController` (balance/topUp/pay) masih MOCK.
      Endpoint BE sudah ada: `GET /wallets/customer/:id`, `/transactions`,
      `POST .../topup`, `/pay`, `/refund`. Tinggal disambungkan.
- [ ] **VERIFIKASI register baru** (birthDate/gender/avatar) via curl — lihat catatan ⚠️ di atas.
- [ ] **Lupa PIN / reset password via OTP** — enum `RESET_PASSWORD` & purpose `LOGIN` sudah
      disiapkan, endpoint/flow belum dibuat. (Link "Lupa password?" di login masih placeholder.)
- [ ] **Tampilkan avatar** di Home/Akun (data `avatarUrl` sudah tersedia dari `/auth/me`).
- [ ] **Avatar preset** (pilihan warna) belum dipersist — hanya foto asli yang diupload.
- [ ] **Produksi: pindah BE ke HTTPS** lalu hapus `usesCleartextTraffic` + ATS exception iOS.
- [ ] **iOS ATS** exception di `ios/Runner/Info.plist` bila testing di iOS dengan http.
- [ ] Isi `WA_API_KEY` (Fonnte) untuk kirim WhatsApp sungguhan (sekarang OTP hanya di log dev).

## Cara menjalankan (dev)
- BE: `cd laundry-be && npm run start:dev` (butuh Postgres; Redis opsional — hanya warning).
  Jika error `EADDRINUSE` port 3000: `lsof -ti:3000 | xargs kill -9` lalu start lagi.
- Mobile:
  - **Web**: `flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000/api/v1`
  - Emulator Android: `--dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1`
  - HP fisik: `http://<IP-LAN-laptop>:3000/api/v1`
- OTP dev: kode muncul di console BE (cari `WA dev-fallback`).
