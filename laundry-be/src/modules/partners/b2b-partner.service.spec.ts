import { Test } from '@nestjs/testing';
import { B2BPartnerTier, Prisma, UserSegment } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { B2BPartnerService } from './b2b-partner.service';

describe('B2BPartnerService', () => {
  let service: B2BPartnerService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      b2BPartner: {
        create: jest.fn().mockResolvedValue({ id: 'p1', partnerCode: 'B2B-TEST' }),
        update: jest.fn().mockResolvedValue({}),
      },
      wallet: { create: jest.fn().mockResolvedValue({ id: 'w1' }) },
      userMembershipStatus: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
      b2BPartnerTierConfig: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn((fn: any) => fn(tx)),
      b2BPartner: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      wallet: { findUnique: jest.fn() },
      order: { findMany: jest.fn() },
      b2BPartnerTierConfig: tx.b2BPartnerTierConfig,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [B2BPartnerService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(B2BPartnerService);
  });

  it('partner memakai wallet dan membership status saat dibuat', async () => {
    await service.create({ companyName: 'Acme', picName: 'Ana', phone: '0812' });
    expect(tx.wallet.create).toHaveBeenCalledWith({ data: { partnerId: 'p1' } });
    expect(tx.userMembershipStatus.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        partnerId: 'p1',
        segment: UserSegment.B2B,
        currentB2BTier: B2BPartnerTier.BUSINESS_PARTNER,
      }),
    });
  });

  it('partner mendapat harga sesuai tier config', async () => {
    prisma.b2BPartnerTierConfig.findUnique.mockResolvedValue({
      tier: B2BPartnerTier.GOLD_PARTNER,
      discountRate: new Prisma.Decimal(12),
    });
    const rate = await service.getDiscountRate(B2BPartnerTier.GOLD_PARTNER);
    expect(rate.toString()).toBe('12');
  });

  it('recordSuccessfulTransaction menaikkan tier B2B dan sinkron ke partner', async () => {
    tx.userMembershipStatus.findUnique.mockResolvedValue({
      id: 'm1',
      partnerId: 'p1',
      currentB2BTier: B2BPartnerTier.BUSINESS_PARTNER,
      earnedSpending: new Prisma.Decimal(900000),
      successfulTxnCount: 1,
    });
    tx.b2BPartnerTierConfig.findMany.mockResolvedValue([
      {
        tier: B2BPartnerTier.GOLD_PARTNER,
        thresholdSpending: new Prisma.Decimal(1000000),
        thresholdTxnCount: null,
        isActive: true,
      },
    ]);

    const updated = await service.recordSuccessfulTransaction(tx, 'p1', 100000);
    expect(updated.currentB2BTier).toBe(B2BPartnerTier.GOLD_PARTNER);
    expect(tx.b2BPartner.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { tier: B2BPartnerTier.GOLD_PARTNER },
    });
  });
});
