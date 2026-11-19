-- Fase 1 Batch 1 (K2/T2): booking HOLD = order dibuat, menunggu pembayaran.
-- Aditif: hanya menambah nilai enum; data lama tidak berubah.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'HOLD' BEFORE 'RESERVED';
