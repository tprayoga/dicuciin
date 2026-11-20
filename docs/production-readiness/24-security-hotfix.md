# 24 — Security Hotfix Production (2026-11-21)

Hotfix minimal untuk production dibuat di branch terpisah **`hotfix/auth-privilege-escalation`** dari commit production **`70dedee`** (= `main`), bukan dari branch ini.

| Commit | Isi |
|---|---|
| `56bd077` | registrasi publik hanya CUSTOMER (V1); `PATCH/GET /users/:id` dikunci (V2, V3); OWNER ↛ SUPER_ADMIN (V4) |
| `0c595ef` | otorisasi top-up/refund/dompet/perintah mesin (K1, K3, K4, K6, K9, K10) — opsional tetapi disarankan |
| `f29098f` | skrip audit akun baca-saja + prosedur backup/deploy/smoke/rollback |

Dokumen lengkap (kerentanan, bukti uji, prasyarat, prosedur): `docs/security-hotfix/2026-11-21-auth-privilege-escalation.md` **di branch hotfix**.

Branch ini sudah memuat perbaikan yang sama (lebih lengkap: Fase 0 + Batch 5). Saat `main` (berisi hotfix) digabung ke branch ini, konflik di `auth.service.ts`, `users.*`, `wallets.*`, `transactions.controller.ts`, `iot.controller.ts` diselesaikan dengan **versi branch ini**, lalu seluruh test dijalankan ulang.

Status: siap, **menunggu persetujuan owner** untuk push, konfirmasi commit server, dan deploy. Audit akun production belum dijalankan.
