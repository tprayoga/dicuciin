import { Test } from '@nestjs/testing';
import { MembershipTier, Prisma, UserSegment } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MembershipTierService } from './membership-tier.service';

describe('MembershipTierService', () => {
  let service: MembershipTierService;
  let tx: any;

  const tierConfigs = [
    {
      tier: MembershipTier.DIAMOND,
      level: 4,
      thresholdSpending: new Prisma.Decimal(1000000),
      thresholdTxnCount: null,
      isActive: true,
    },
    {
      tier: MembershipTier.GOLD,
      level: 2,
      thresholdSpending: null,
      thresholdTxnCount: 5,
      isActive: true,
    },
    {
      tier: MembershipTier.SILVER,
      level: 1,
      thresholdSpending: null,
      thresholdTxnCount: null,
      isActive: true,
    },
  ];

  beforeEach(async () => {
    tx = {
      userMembershipStatus: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockImplementation(({ data }: any) => data),
      },
      membershipTierConfig: {
        findMany: jest.fn().mockResolvedValue(tierConfigs),
        findUnique: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MembershipTierService,
        {
          provide: PrismaService,
          useValue: {
            membershipTierConfig: tx.membershipTierConfig,
            userMembershipStatus: tx.userMembershipStatus,
          },
        },
      ],
    }).compile();
    service = moduleRef.get(MembershipTierService);
  });

  it('tier naik berdasarkan spending', async () => {
    tx.userMembershipStatus.findUnique.mockResolvedValue({
      id: 'm1',
      customerId: 'cust-1',
      segment: UserSegment.RETAIL,
      currentTier: MembershipTier.SILVER,
      earnedSpending: new Prisma.Decimal(900000),
      successfulTxnCount: 2,
    });

    const updated = await service.recordSuccessfulTransaction(
      tx,
      'cust-1',
      new Prisma.Decimal(100000),
    );
    expect(updated.currentTier).toBe(MembershipTier.DIAMOND);
    expect(updated.earnedSpending.toString()).toBe('1000000');
  });

  it('tier naik berdasarkan jumlah transaksi', async () => {
    tx.userMembershipStatus.findUnique.mockResolvedValue({
      id: 'm1',
      customerId: 'cust-1',
      segment: UserSegment.RETAIL,
      currentTier: MembershipTier.SILVER,
      earnedSpending: new Prisma.Decimal(0),
      successfulTxnCount: 4,
    });

    const updated = await service.recordSuccessfulTransaction(tx, 'cust-1', 10000);
    expect(updated.currentTier).toBe(MembershipTier.GOLD);
    expect(updated.successfulTxnCount).toBe(5);
  });

  it('top up tidak menaikkan tier karena service hanya mencatat transaksi sukses', async () => {
    await service.getBenefits(MembershipTier.SILVER);
    expect(tx.userMembershipStatus.update).not.toHaveBeenCalled();
  });

  it('refund mengurangi spending/transaksi dan bisa menurunkan tier', async () => {
    tx.userMembershipStatus.findUnique.mockResolvedValue({
      id: 'm1',
      customerId: 'cust-1',
      currentTier: MembershipTier.DIAMOND,
      earnedSpending: new Prisma.Decimal(1000000),
      successfulTxnCount: 5,
    });

    const updated = await service.reverseTransaction(tx, 'cust-1', 600000);
    expect(updated).not.toBeNull();
    if (!updated) throw new Error('Expected membership status to be updated');
    expect(updated.earnedSpending.toString()).toBe('400000');
    expect(updated.successfulTxnCount).toBe(4);
    expect(updated.currentTier).toBe(MembershipTier.SILVER);
  });

  it('point multiplier mengikuti tier config', async () => {
    tx.membershipTierConfig.findUnique.mockResolvedValue({
      tier: MembershipTier.DIAMOND,
      pointMultiplier: new Prisma.Decimal(2),
      cashbackRate: new Prisma.Decimal(1),
    });
    const benefits = await service.getBenefits(MembershipTier.DIAMOND);
    expect(benefits.pointMultiplier.toString()).toBe('2');
    expect(benefits.cashbackRate.toString()).toBe('1');
  });
});
