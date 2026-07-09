import { LedgerDirection, Prisma, WalletTransactionType } from '@prisma/client';
import {
  ledgerReferenceToTransactionType,
  mapLedgerToTransaction,
  walletTransactionToLedgerInput,
  MIGRATED_WT_PREFIX,
  WalletLedgerRowLike,
  WalletTransactionRowLike,
} from './wallet-history.mapper';

const D = (v: string | number) => new Prisma.Decimal(v);

const ledger = (o: Partial<WalletLedgerRowLike>): WalletLedgerRowLike => ({
  id: 'l-1',
  walletId: 'w-1',
  orderId: null,
  direction: LedgerDirection.CREDIT,
  amount: D('1000'),
  balanceBefore: D('0'),
  balanceAfter: D('1000'),
  referenceType: 'TOPUP',
  description: 'x',
  idempotencyKey: 'k',
  createdAt: new Date('2026-06-01T00:00:00Z'),
  ...o,
});

describe('wallet-history.mapper', () => {
  describe('ledgerReferenceToTransactionType', () => {
    it.each([
      ['TOPUP', WalletTransactionType.TOPUP],
      ['PAYMENT', WalletTransactionType.PAYMENT],
      ['REFUND', WalletTransactionType.REFUND],
      ['CASHBACK', WalletTransactionType.CASHBACK],
      ['VOUCHER', WalletTransactionType.ADJUSTMENT],
      [null, WalletTransactionType.ADJUSTMENT],
    ])('%s → %s', (ref, expected) => {
      expect(ledgerReferenceToTransactionType(ref as any)).toBe(expected);
    });
  });

  describe('mapLedgerToTransaction', () => {
    it('CREDIT → amount positif, tipe dari referenceType', () => {
      const dto = mapLedgerToTransaction(
        ledger({ direction: LedgerDirection.CREDIT, amount: D('350000'), referenceType: 'TOPUP' }),
      );
      expect(dto.transactionType).toBe(WalletTransactionType.TOPUP);
      expect(dto.amount.toString()).toBe('350000');
    });

    it('DEBIT → amount bertanda negatif (kontrak lama)', () => {
      const dto = mapLedgerToTransaction(
        ledger({ direction: LedgerDirection.DEBIT, amount: D('83500'), referenceType: 'PAYMENT' }),
      );
      expect(dto.transactionType).toBe(WalletTransactionType.PAYMENT);
      expect(dto.amount.toString()).toBe('-83500');
    });

    it('mempertahankan id, balances, createdAt, description', () => {
      const at = new Date('2026-06-23T12:04:27Z');
      const dto = mapLedgerToTransaction(
        ledger({ id: 'l-9', balanceBefore: D('90000'), balanceAfter: D('6500'), createdAt: at, description: 'bayar' }),
      );
      expect(dto.id).toBe('l-9');
      expect(dto.balanceBefore.toString()).toBe('90000');
      expect(dto.balanceAfter.toString()).toBe('6500');
      expect(dto.createdAt).toBe(at);
      expect(dto.description).toBe('bayar');
    });
  });

  describe('walletTransactionToLedgerInput (backfill)', () => {
    const wt = (o: Partial<WalletTransactionRowLike>): WalletTransactionRowLike => ({
      id: 'wt-1',
      walletId: 'w-1',
      orderId: null,
      transactionType: WalletTransactionType.TOPUP,
      amount: D('350000'),
      balanceBefore: D('0'),
      balanceAfter: D('350000'),
      description: 'top up',
      createdAt: new Date('2026-06-23T12:04:27Z'),
      ...o,
    });

    it('TOPUP positif → MAIN CREDIT magnitudo positif', () => {
      const inp = walletTransactionToLedgerInput(wt({}));
      expect(inp.walletType).toBe('MAIN_BALANCE');
      expect(inp.direction).toBe(LedgerDirection.CREDIT);
      expect(inp.amount.toString()).toBe('350000');
      expect(inp.referenceType).toBe('TOPUP');
      expect(inp.idempotencyKey).toBe(`${MIGRATED_WT_PREFIX}wt-1`);
    });

    it('PAYMENT negatif → MAIN DEBIT magnitudo positif', () => {
      const inp = walletTransactionToLedgerInput(
        wt({ id: 'wt-2', transactionType: WalletTransactionType.PAYMENT, amount: D('-83500'), orderId: 'ord-1' }),
      );
      expect(inp.direction).toBe(LedgerDirection.DEBIT);
      expect(inp.amount.toString()).toBe('83500');
      expect(inp.orderId).toBe('ord-1');
      expect(inp.referenceId).toBe('ord-1');
    });

    it('round-trip: backfill lalu baca kembali = amount bertanda semula', () => {
      const original = wt({ id: 'wt-3', transactionType: WalletTransactionType.PAYMENT, amount: D('-74000') });
      const inp = walletTransactionToLedgerInput(original);
      const back = mapLedgerToTransaction({
        id: 'l', walletId: inp.walletId, orderId: inp.orderId,
        direction: inp.direction, amount: inp.amount,
        balanceBefore: inp.balanceBefore, balanceAfter: inp.balanceAfter,
        referenceType: inp.referenceType, description: inp.description,
        idempotencyKey: inp.idempotencyKey, createdAt: inp.createdAt,
      });
      expect(back.amount.toString()).toBe('-74000');
      expect(back.transactionType).toBe(WalletTransactionType.PAYMENT);
    });
  });
});
