import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PromosService } from './promos.service';
import { PrismaService } from '../../common/prisma/prisma.service';

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

describe('PromosService.validatePromo', () => {
  let service: PromosService;
  let prisma: {
    promo: { findUnique: jest.Mock };
    promoUsage: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      promo: { findUnique: jest.fn() },
      promoUsage: { count: jest.fn().mockResolvedValue(0) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [PromosService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PromosService);
  });

  it('PERCENTAGE: diskon 20% dari 85500 = 17100 (eksak)', async () => {
    prisma.promo.findUnique.mockResolvedValue(validPromo());
    const res = await service.validatePromo('WELCOME20', 'cust-1', 85500);
    expect(res.isValid).toBe(true);
    expect(res.discount).toBe(17100);
  });

  it('FIXED_AMOUNT: diskon = value', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ promoType: 'FIXED_AMOUNT', value: new Prisma.Decimal(15000) }),
    );
    const res = await service.validatePromo('FIX15', 'cust-1', 85500);
    expect(res.discount).toBe(15000);
  });

  it('maxDiscount membatasi diskon persentase', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ rules: [{ maxDiscount: new Prisma.Decimal(10000) }] }),
    );
    const res = await service.validatePromo('WELCOME20', 'cust-1', 85500);
    expect(res.discount).toBe(10000); // 17100 dibatasi ke 10000
  });

  it('minTransaction belum terpenuhi → BadRequest', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ rules: [{ minTransaction: new Prisma.Decimal(100000) }] }),
    );
    await expect(
      service.validatePromo('WELCOME20', 'cust-1', 50000),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kode tidak ditemukan → NotFound', async () => {
    prisma.promo.findUnique.mockResolvedValue(null);
    await expect(
      service.validatePromo('NGAWUR', 'cust-1', 50000),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('promo non-aktif → BadRequest', async () => {
    prisma.promo.findUnique.mockResolvedValue(validPromo({ isActive: false }));
    await expect(
      service.validatePromo('WELCOME20', 'cust-1', 50000),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kuota habis → BadRequest', async () => {
    prisma.promo.findUnique.mockResolvedValue(
      validPromo({ quota: 5, usedCount: 5 }),
    );
    await expect(
      service.validatePromo('WELCOME20', 'cust-1', 50000),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
