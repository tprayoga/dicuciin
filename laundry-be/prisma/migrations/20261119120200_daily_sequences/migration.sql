-- Fase 1 Batch 1: nomor order/member unik di bawah request paralel.
-- Sebelumnya advisory lock dilepas sebelum order disisipkan → nomor ganda.
CREATE TABLE "daily_sequences" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_sequences_pkey" PRIMARY KEY ("key")
);
