import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService promotion loyalty', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      userVoucher: {
        count: jest.fn().mockResolvedValue(10),
        groupBy: jest.fn().mockResolvedValue([{ status: 'ACTIVE', _count: 6 }]),
      },
      voucherRedemption: { count: jest.fn().mockResolvedValue(4) },
      walletLedger: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(25000) } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      wallet: { aggregate: jest.fn().mockResolvedValue({ _sum: { pointBalance: 1234 } }) },
      order: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({
            _count: 3,
            _sum: { totalAmount: new Prisma.Decimal(300000) },
          })
          .mockResolvedValueOnce({
            _sum: {
              discountAmount: new Prisma.Decimal(50000),
              totalAmount: new Prisma.Decimal(450000),
            },
          }),
      },
      campaignExecutionLog: { findMany: jest.fn().mockResolvedValue([]) },
      b2BPricingRuleUsage: {
        groupBy: jest.fn().mockResolvedValue([
          {
            ruleId: 'rule-1',
            _count: { _all: 2 },
            _sum: { discountAmount: new Prisma.Decimal(75000) },
          },
        ]),
      },
      b2BPricingRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-1',
            name: 'Gold Washer',
            tier: 'GOLD_PARTNER',
            machineType: 'WASHER',
            partner: { companyName: 'PT B2B' },
            outlet: { name: 'Outlet A' },
            service: { name: 'Wash' },
          },
        ]),
      },
      // Ledger legacy: TIDAK boleh dipakai report saldo modern (cegah double count).
      walletTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(999999) } }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ReportsService);
  });

  it('transaksi partner masuk report B2B', async () => {
    const report = await service.getPromotionLoyalty('2026-06');
    expect(report.dashboard.b2bTransactionCount).toBe(3);
    expect(report.dashboard.b2bTransactionVolume).toBe(300000);
    expect(report.dashboard.voucherBurnRate).toBe(40);
    expect(report.b2bPricingImpact).toEqual([
      expect.objectContaining({
        ruleId: 'rule-1',
        ruleName: 'Gold Washer',
        usageCount: 2,
        discountAmount: 75000,
      }),
    ]);
  });

  // --- Phase C: source-of-truth ledger (cegah double count) ---

  it('bonus liability bersumber dari walletLedger (BONUS/CREDIT), bukan walletTransaction legacy', async () => {
    const report = await service.getPromotionLoyalty('2026-06');
    expect(report.dashboard.totalBonusBalanceIssued).toBe(25000); // dari walletLedger.aggregate
    expect(prisma.walletLedger.aggregate).toHaveBeenCalled();
    expect(prisma.walletTransaction.aggregate).not.toHaveBeenCalled();
    expect(prisma.walletTransaction.findMany).not.toHaveBeenCalled();
  });

  it('point liability bersumber dari Wallet.pointBalance (cache poin)', async () => {
    const report = await service.getPromotionLoyalty('2026-06');
    expect(report.dashboard.totalOutstandingPoint).toBe(1234);
    expect(prisma.wallet.aggregate).toHaveBeenCalled();
  });

  it('revenue dari order PAID; top up (walletTransaction TOPUP) tidak dihitung sebagai revenue', async () => {
    const report = await service.getPromotionLoyalty('2026-06');
    expect(report.dashboard.promoRevenueImpact).toBe(50000); // discountAmount order PAID
    expect(report.dashboard.promoDrivenRevenue).toBe(450000); // totalAmount order PAID
    expect(prisma.order.aggregate).toHaveBeenCalled();
    expect(prisma.walletTransaction.aggregate).not.toHaveBeenCalled();
  });
});
