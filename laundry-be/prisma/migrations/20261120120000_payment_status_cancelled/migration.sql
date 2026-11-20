-- Batch 2: percobaan pembayaran yang diganti/dibatalkan.
-- Terpisah dari migrasi berikutnya: nilai enum baru tidak boleh dipakai di
-- transaksi yang sama dengan ADD VALUE.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
