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
  });
});
