import {
  LedgerDirection,
  Prisma,
  WalletTransactionType,
  WalletType,
} from '@prisma/client';

/**
 * Pemetaan antara ledger resmi (`wallet_ledgers`) dan bentuk histori lama
 * (`wallet_transactions`). Dipakai dua arah:
 *  - baca: `mapLedgerToTransaction` → menyajikan ledger sebagai DTO histori lama
 *    agar endpoint/mobile tidak berubah kontraknya (T5/T6).
 *  - backfill: `walletTransactionToLedgerInput` → migrasi baris lama ke ledger (T7).
 *
 * Fungsi murni (tanpa I/O) supaya mudah diuji dan konsisten di kedua arah.
 */

/** `referenceType` ledger → `WalletTransactionType` (bentuk histori lama). */
export function ledgerReferenceToTransactionType(
  referenceType: string | null | undefined,
): WalletTransactionType {
  switch (referenceType) {
    case 'TOPUP':
      return WalletTransactionType.TOPUP;
    case 'PAYMENT':
      return WalletTransactionType.PAYMENT;
    case 'REFUND':
      return WalletTransactionType.REFUND;
    case 'CASHBACK':
      return WalletTransactionType.CASHBACK;
    default:
      // Nilai engine lain (VOUCHER/WITHDRAW/…) tidak punya padanan enum lama →
      // dipetakan ke ADJUSTMENT (netral) agar tetap tampil di histori.
      return WalletTransactionType.ADJUSTMENT;
  }
}

export interface WalletLedgerRowLike {
  id: string;
  walletId: string;
  orderId: string | null;
  direction: LedgerDirection;
  amount: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  referenceType: string | null;
  description: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
}

/**
 * Baris `wallet_ledgers` → bentuk histori lama (`WalletTransaction`).
 * `amount` dikembalikan bertanda (DEBIT negatif, CREDIT positif) persis seperti
 * kolom lama, sehingga konsumen (mobile/admin) tidak perlu berubah.
 */
export function mapLedgerToTransaction(l: WalletLedgerRowLike) {
  const amount =
    l.direction === LedgerDirection.DEBIT ? l.amount.negated() : l.amount;
  return {
    id: l.id,
    walletId: l.walletId,
    orderId: l.orderId,
    transactionType: ledgerReferenceToTransactionType(l.referenceType),
    amount,
    balanceBefore: l.balanceBefore,
    balanceAfter: l.balanceAfter,
    description: l.description,
    idempotencyKey: l.idempotencyKey,
    createdAt: l.createdAt,
  };
}

export interface WalletTransactionRowLike {
  id: string;
  walletId: string;
  orderId: string | null;
  transactionType: WalletTransactionType;
  amount: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  description: string | null;
  createdAt: Date;
}

/** Prefix idempotencyKey untuk baris ledger hasil backfill (dedup & telusur). */
export const MIGRATED_WT_PREFIX = 'migrated-wt-';

/**
 * Baris `wallet_transactions` lama → payload create `wallet_ledgers` (backfill).
 * Semua baris histori lama adalah MAIN_BALANCE. Arah diturunkan dari tanda
 * `amount`; magnitudo disimpan positif. `createdAt` dipertahankan agar urutan
 * histori tetap. `idempotencyKey` diberi prefix agar tidak bentrok dengan key
 * asli dan agar backfill idempoten.
 */
export function walletTransactionToLedgerInput(wt: WalletTransactionRowLike) {
  const isDebit = wt.amount.isNegative();
  return {
    walletId: wt.walletId,
    orderId: wt.orderId,
    walletType: WalletType.MAIN_BALANCE,
    direction: isDebit ? LedgerDirection.DEBIT : LedgerDirection.CREDIT,
    amount: wt.amount.abs(),
    balanceBefore: wt.balanceBefore,
    balanceAfter: wt.balanceAfter,
    referenceType: wt.transactionType,
    referenceId: wt.orderId,
    description: wt.description,
    idempotencyKey: `${MIGRATED_WT_PREFIX}${wt.id}`,
    createdAt: wt.createdAt,
  };
}
