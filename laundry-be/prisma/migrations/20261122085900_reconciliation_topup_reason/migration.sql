-- Batch 4: alasan rekonsiliasi top-up (migrasi terpisah: nilai enum baru).
ALTER TYPE "ReconciliationReason" ADD VALUE IF NOT EXISTS 'TOPUP_LATE_SETTLEMENT';
