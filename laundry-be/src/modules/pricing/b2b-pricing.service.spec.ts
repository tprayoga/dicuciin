import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { B2BPartnerTier, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { B2BPricingService } from './b2b-pricing.service';

describe('B2BPricingService', () => {
  let service: B2BPricingService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      b2BPricingRule: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => data),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [B2BPricingService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(B2BPricingService);
  });

  it('create rule wajib partnerId atau tier', async () => {
    await expect(
      service.create({
        name: 'Invalid',
        priceType: 'FIXED_PRICE',
        value: 30000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('findBestRule memilih priority tertinggi lalu specificity', async () => {
    prisma.b2BPricingRule.findMany.mockResolvedValue([
      {
        id: 'tier-rule',
        tier: B2BPartnerTier.GOLD_PARTNER,
        priority: 1,
        startDate: null,
        endDate: null,
      },
      {
        id: 'partner-rule',
        partnerId: 'p1',
        tier: B2BPartnerTier.GOLD_PARTNER,
        outletId: 'out-1',
        serviceId: 'svc-1',
        machineType: 'WASHER',
        priority: 1,
        startDate: null,
        endDate: null,
      },
    ]);

    const rule = await service.findBestRule({
      partnerId: 'p1',
      tier: B2BPartnerTier.GOLD_PARTNER,
      outletId: 'out-1',
      serviceId: 'svc-1',
      machineType: 'WASHER',
      at: new Date('2026-06-16T10:00:00.000Z'),
    });

    expect(rule.id).toBe('partner-rule');
  });

  it('calculateAdjustment mendukung fixed price', () => {
    const discount = service.calculateAdjustment(
      { priceType: 'FIXED_PRICE', value: new Prisma.Decimal(30000) },
      new Prisma.Decimal(50000),
    );
    expect(discount.toString()).toBe('20000');
  });
});
