# Kiosk — Login sebagai Member (UI-only)

> Dibuat: 2026-06-23 · Platform: Kiosk Flutter App
> Scope: **UI saja**. Belum ada login backend nyata.

---

## 1. Summary Fitur

Menambahkan alur **"Login sebagai Member"** di kiosk sebagai opsi selain guest. Customer di layar Welcome bisa memilih **Login Member** (CTA utama) atau **Lanjut sebagai Guest** (sekunder). Layar login member menyediakan 3 metode (Scan QR, Nomor HP+OTP, Member ID+PIN) lengkap dengan state success & error — semuanya UI-only dengan simulasi lokal.

## 2. Scope UI-only

- ✅ UI + navigasi antar state (lokal).
- ✅ Dummy data member (lokal).
- ❌ Tidak ada panggilan API / backend auth.
- ❌ Tidak ada perubahan database / API contract.
- ❌ Tidak mengubah business logic order/pembayaran.
- ❌ Tidak merusak flow guest existing (guest tetap memakai `KioskController.startOrder`).

## 3. Flow Screen

```
Welcome / Idle
 ├─ Login Member  → MemberLoginScreen (stage: memberLogin)
 │    ├─ Scan QR        → Simulasi QR Berhasil → Success
 │    ├─ Nomor HP       → Kirim OTP → input OTP → Verifikasi → Success
 │    └─ Member ID+PIN  → Masuk → Success
 │         (gagal di salah satu → Error State)
 │    Success → "Lanjut Pilih Mesin" → flow existing (machines)
 │    Error   → "Coba Lagi" / "Lanjut sebagai Guest"
 └─ Lanjut sebagai Guest → flow existing (machines)
```

Navigasi dirender oleh `KioskRouter` (stage-based), tetap di dalam `PortraitFrame` 9:16. Tidak memakai `Navigator.push` agar tidak keluar dari frame kiosk.

## 4. State UI yang Tersedia

`MemberLoginUiState` di `MemberLoginUiController`:

| State | Isi | Mascot (`KioskMascotAssets`) |
|---|---|---|
| `initial` | 3 kartu metode (QR highlighted, HP, PIN) + tombol Guest | `kioskFastLoginQr` |
| `qrScan` | Area scanner simulasi + "Simulasi QR Berhasil" / "Kembali" | `kioskFastLoginQr` |
| `otpInput` | Fase 1: input nomor HP → "Kirim OTP"; Fase 2: input OTP 6 digit → "Verifikasi" / "Kirim Ulang" | `waiting` |
| `pinLogin` | Input Member ID + PIN (obscure) → "Masuk" | `kioskPinConfirmationSecurity` |
| `success` | Pesan sukses + `MemberSummaryCard` (dummy) → "Lanjut Pilih Mesin" | `paymentSuccessBasketConfetti` |
| `error` | Pesan ramah → "Coba Lagi" / "Lanjut sebagai Guest" | `errorNoInternet` (koneksi) / `confused` (gagal login) |

Semua mascot dirender via **`KioskMascotPanel`**; tidak ada hardcoded path aset.

## 5. Dummy Data

`kDummyMember` (di `member_login_controller.dart`):

```
name: "Member Di.Cuciin"
tier: "Silver"
walletBalance: 50000
points: 120
activeVouchers: 2
```

Tidak disimpan ke DB, tidak dari backend.

## 6. File yang Dibuat / Diubah

**Dibuat:**
- `lib/src/features/member/member_login_controller.dart` — `MemberLoginUiController` (ChangeNotifier, UI-only) + `MemberSummary` + `kDummyMember`.
- `lib/src/features/member/member_login_widgets.dart` — `MemberLoginMethodCard`, `MemberSummaryCard`.
- `lib/src/features/member/member_login_screen.dart` — `MemberLoginScreen` + 6 state.
- `docs/kiosk-member-login-ui.md` (file ini).

**Diubah:**
- `lib/src/kiosk_controller.dart` — tambah `KioskStage.memberLogin` + method navigasi `goToMemberLogin()`.
- `lib/src/kiosk_app.dart` — import + case router `memberLogin`; WelcomeScreen jadi 2 CTA (Login Member / Guest) + helper text.

> Tidak ada perubahan pada API client, model, atau logic order/pembayaran.

## 7. TODO Backend Integration

Sudah ditandai `TODO:` di `member_login_controller.dart`:
- `simulateQrLogin()` → **TODO: connect to backend member auth API (verify QR token).**
- `sendOtp(phone)` / `resendOtp()` → **TODO: request/resend OTP via backend.**
- `verifyOtp(otp)` → **TODO: verify OTP via backend.**
- `loginWithMemberIdPin(id, pin)` → **TODO: login Member ID + PIN via backend.**
- `_loginSuccess()` → **TODO: replace dummy member data with API response.**
- `continueToMachineSelection()` → **TODO: integrate wallet/voucher/loyalty member ke checkout.**

Langkah integrasi nanti: ganti isi method dummy dengan panggilan `ApiClient` (pakai endpoint auth member yang tersedia), set `member` dari respons, dan teruskan identitas member ke `submitWalletCheckout`/`submitCheckout` agar wallet/voucher/loyalty terpakai.

## 8. Risiko UX

- **Member fast-login belum ada di backend kiosk** — saat ini kiosk device guest-only; perlu endpoint auth member untuk kiosk.
- **OTP/PIN UI** memakai TextField biasa; di kiosk fisik perlu on-screen keyboard/num-pad (belum disediakan).
- **Mascot welcome**: hero memakai mascot idle (`kioskIdleCleaning`); `kioskFastLoginQr` dipakai di layar login member (bukan diduplikasi di welcome) demi aturan maksimal 1 mascot per layar.
- **Path aset** sudah via konstanta (Flutter), aman.

## 9. Next Step

1. Sediakan endpoint backend auth member untuk kiosk (QR token, OTP, Member ID+PIN) — tanpa mengubah flow guest.
2. Ganti method dummy di `MemberLoginUiController` dengan panggilan API + error handling nyata.
3. Setelah login, teruskan identitas member ke checkout agar wallet/voucher/loyalty aktif (saat ini kiosk pakai `customerLookup` untuk wallet — bisa diisi dari member yang login).
4. Tambah num-pad/on-screen keyboard untuk input OTP/PIN di perangkat kiosk.
5. Uji visual on-device (frame portrait 9:16) untuk memastikan tidak ada overflow.
