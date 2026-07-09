import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PromosService, PromoEvalItem } from './promos.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';

/** Promo PERCENTAGE 20% yang valid hari ini, tanpa rule, tanpa kuota. */
function validPromo(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'promo-1',
    code: 'WELCOME20',
    isActive: true,
    startDate: new Date(now.getTime() - 86_400_000),
    endDate: new Date(now.getTime() + 86_400_000),
    quota: null,
    usedCount: 0,
    promoType: 'PERCENTAGE',
    value: new Prisma.Decimal(20),
    rules: [],
    ...overrides,
  };
}

const items = (...subtotals: Array<[string, number]>): PromoEvalItem[] =>
  subtotals.map(([serviceId, subtotal]) => ({ serviceId, subtotal }));

describe('PromosService.evaluatePromo', () => {
  let service: PromosService;
  let prisma: {
    promo: { findUnique: jest.Mock };
    promoUsage: { count: jest.Mock };
  };

  const evalPromo = (overrides: Partial<Parameters<PromosService['evaluatePromo']>[0]> = {}) =>
    service.evaluatePromo({
      code: 'WELCOME20',
      customerId: 'cust-1',
      items: items(['svc-1', 85500]),
      ...overrides,
    });

  beforeEach(async () => {
    prisma = {
      promo: { findUnique: jest.fn() },
      promoUsage: { count: jest.fn().mockResolvedValue(0) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PromosService,
        { provide: PrismaService, useValue: prisma },
        { provide: WalletLedgerService, useValue: { creditCashback: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(PromosService);
  });

  it('PERCENTAGE: diskon 20% dari 85500 = 17100 (dibulatkan rupiah)', async () => {
    prisma.promo.findUnique.mockResolvedValue(validPromo());
    const res = await evalPromo();
    expect(res.discount.toNumber()).toBe(17100);
    expect(res.cashback.toNumber()).toBe(0);
  });

  it('FIXED_AMOUNT: diskon = value', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ promoType: 'FIXED_AMOUNT', value: new Prisma.Decimal(15000) }),
    );
    const res = await evalPromo();
    expect(res.discount.toNumber()).toBe(15000);
  });

  it('FIXED_AMOUNT tidak melebihi subtotal', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ promoType: 'FIXED_AMOUNT', value: new Prisma.Decimal(50000) }),
    );
    const res = await evalPromo({ items: items(['svc-1', 30000]) });
    expect(res.discount.toNumber()).toBe(30000);
  });

  it('FREE_DELIVERY: diskon = ongkir', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ promoType: 'FREE_DELIVERY', value: new Prisma.Decimal(0) }),
    );
    const res = await evalPromo({ deliveryFee: 12000 });
    expect(res.discount.toNumber()).toBe(12000);
  });

  it('CASHBACK: tidak memotong checkout, mengembalikan cashback', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ promoType: 'CASHBACK', value: new Prisma.Decimal(10) }),
    );
    const res = await evalPromo({ items: items(['svc-1', 50000]) });
    expect(res.discount.toNumber()).toBe(0);
    expect(res.cashback.toNumber()).toBe(5000);
  });

  it('maxDiscount membatasi diskon persentase', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ rules: [{ maxDiscount: new Prisma.Decimal(10000) }] }),
    );
    const res = await evalPromo();
    expect(res.discount.toNumber()).toBe(10000); // 17100 dibatasi ke 10000
  });

  it('applicableServices: diskon hanya dari subtotal layanan yang cocok', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ rules: [{ applicableServices: 'svc-1' }] }),
    );
    // Order: svc-1 50000 (cocok) + svc-2 50000 (tidak) → diskon 20% dari 50000.
    const res = await evalPromo({ items: items(['svc-1', 50000], ['svc-2', 50000]) });
    expect(res.discount.toNumber()).toBe(10000);
  });

  it('applicableServices: tak ada layanan cocok → BadRequest', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ rules: [{ applicableServices: 'svc-9' }] }),
    );
    await expect(
      evalPromo({ items: items(['svc-1', 50000]) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applicableOutlets: outlet tidak termasuk → BadRequest', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ rules: [{ applicableOutlets: 'out-9' }] }),
    );
    await expect(
      evalPromo({ outletId: 'out-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maxUsagePerCustomer terlampaui → BadRequest', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ rules: [{ maxUsagePerCustomer: 1 }] }),
    );
    prisma.promoUsage.count.mockResolvedValue(1);
    await expect(evalPromo()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('minTransaction belum terpenuhi → BadRequest', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ rules: [{ minTransaction: new Prisma.Decimal(100000) }] }),
    );
    await expect(
      evalPromo({ items: items(['svc-1', 50000]) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kode tidak ditemukan → NotFound', async () => {
    prisma.promo.findUnique.mockResolvedValue(null);
    await expect(evalPromo()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('promo non-aktif → BadRequest', async () => {
    prisma.promo.findUnique.mockResolvedValue(validPromo({ isActive: false }));
    await expect(evalPromo()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kuota habis → BadRequest', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ quota: 5, usedCount: 5 }),
    );
    await expect(evalPromo()).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PromosService.commitUsage', () => {
  let service: PromosService;
  let tx: any;
  let walletLedger: any;

  beforeEach(async () => {
    tx = {
      order: { findUnique: jest.fn() },
      promoUsage: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      promo: { update: jest.fn() },
      wallet: {
        findUnique: jest.fn().mockResolvedValue({ id: 'w-1' }),
        update: jest.fn(),
      },
    };
    walletLedger = {
      creditCashback: jest.fn().mockResolvedValue({
        balanceBefore: new Prisma.Decimal('0'),
        balanceAfter: new Prisma.Decimal('5000'),
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PromosService,
        { provide: PrismaService, useValue: {} },
        { provide: WalletLedgerService, useValue: walletLedger },
      ],
    }).compile();
    service = moduleRef.get(PromosService);
  });

  const cashbackOrder = () => ({
    id: 'ord-1',
    orderNumber: 'ORD-1',
    promoId: 'promo-1',
    customerId: 'cust-1',
    discountAmount: new Prisma.Decimal(0),
    items: [{ serviceId: 'svc-1', subtotal: new Prisma.Decimal(50000) }],
    promo: {
      code: 'CB10',
      promoType: 'CASHBACK',
      value: new Prisma.Decimal(10), // 10% dari 50000 = 5000
      rules: [],
    },
  });

  it('CASHBACK → kredit BONUS via WalletLedgerService (bukan tulis saldo langsung)', async () => {
    tx.order.findUnique.mockResolvedValue(cashbackOrder());

    await service.commitUsage(tx, 'ord-1');

    expect(walletLedger.creditCashback).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 'w-1',
        orderId: 'ord-1',
        referenceType: 'CASHBACK',
        referenceId: 'promo-1',
        idempotencyKey: 'cashback-ord-1',
      }),
    );
    expect(
      walletLedger.creditCashback.mock.calls[0][0].amount.toString(),
    ).toBe('5000');
    // G4 fixed: tidak lagi memutasi saldo langsung ke MAIN.
    expect(tx.wallet.update).not.toHaveBeenCalled();
  });

  it('promo non-CASHBACK: tidak memanggil creditCashback', async () => {
    tx.order.findUnique.mockResolvedValue({
      ...cashbackOrder(),
      discountAmount: new Prisma.Decimal(5000),
      promo: {
        code: 'P20',
        promoType: 'PERCENTAGE',
        value: new Prisma.Decimal(20),
        rules: [],
      },
    });

    await service.commitUsage(tx, 'ord-1');

    expect(walletLedger.creditCashback).not.toHaveBeenCalled();
  });

  it('idempoten: PromoUsage sudah ada → tidak memproses ulang', async () => {
    tx.order.findUnique.mockResolvedValue(cashbackOrder());
    tx.promoUsage.findFirst.mockResolvedValue({ id: 'usage-1' });

    await service.commitUsage(tx, 'ord-1');

    expect(tx.promo.update).not.toHaveBeenCalled();
    expect(walletLedger.creditCashback).not.toHaveBeenCalled();
  });
});
