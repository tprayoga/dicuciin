import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LedgerDirection, UserRole } from '@prisma/client';
import { PointService } from './point.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VoucherService } from '../vouchers/voucher.service';
import { LoyaltyConfigService } from '../loyalty-config/loyalty-config.service';

describe('PointService', () => {
  let service: PointService;
  let prisma: any;
  let voucherService: { issue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue({ id: 'w1', pointBalance: 0 }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      pointLedger: {
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'pl1', ...data })),
      },
      voucherTemplate: {
        findUnique: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    voucherService = {
      issue: jest.fn().mockResolvedValue({ id: 'uv1', code: 'POINT-AAAA' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PointService,
        { provide: PrismaService, useValue: prisma },
        { provide: VoucherService, useValue: voucherService },
        LoyaltyConfigService,
      ],
    }).compile();
    service = moduleRef.get(PointService);
  });

  it('successful transaction creates point ledger (CREDIT)', async () => {
    prisma.wallet.findUnique
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 0 })
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 50 });

    const ledger = await service.earn({ walletId: 'w1', points: 50, orderId: 'o1' });
    expect(ledger.direction).toBe(LedgerDirection.CREDIT);
    expect(ledger.points).toBe(50);
    expect(ledger.balanceAfter).toBe(50);
    expect(ledger.orderId).toBe('o1');
    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { pointBalance: { increment: 50 } },
    });
  });

  it('earn tanpa orderId ditolak (poin hanya dari transaksi sukses)', async () => {
    await expect(
      service.earn({ walletId: 'w1', points: 50, orderId: '' }),
    ).rejects.toThrow();
  });

  it('redeem point masuk ledger DEBIT dan mengurangi POINT_BALANCE', async () => {
    prisma.wallet.findUnique
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 100 })
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 60 });

    const ledger = await service.redeem({
      walletId: 'w1',
      points: 40,
      sourceType: 'VOUCHER_REDEMPTION',
      sourceId: 'uv1',
    });

    expect(ledger.direction).toBe(LedgerDirection.DEBIT);
    expect(ledger.points).toBe(40);
    expect(ledger.balanceBefore).toBe(100);
    expect(ledger.balanceAfter).toBe(60);
    expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'w1', pointBalance: { gte: 40 } },
      data: { pointBalance: { decrement: 40 } },
    });
  });

  it('saldo point tidak boleh minus', async () => {
    prisma.wallet.findUnique.mockResolvedValue({ id: 'w1', pointBalance: 10 });
    prisma.wallet.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.redeem({ walletId: 'w1', points: 20 })).rejects.toThrow(
      'Poin tidak mencukupi',
    );
    expect(prisma.pointLedger.create).not.toHaveBeenCalled();
  });

  it('owner wallet bisa melihat saldo point', async () => {
    prisma.wallet.findUnique.mockResolvedValue({
      id: 'w1',
      pointBalance: 75,
      customer: { userId: 'user-1' },
      partner: null,
    });

    const res = await service.getBalanceForUser('w1', {
      userId: 'user-1',
      role: UserRole.CUSTOMER,
    });

    expect(res).toEqual({ walletId: 'w1', pointBalance: 75 });
  });

  it('user lain tidak boleh akses point wallet', async () => {
    prisma.wallet.findUnique.mockResolvedValue({
      id: 'w1',
      pointBalance: 75,
      customer: { userId: 'user-1' },
      partner: null,
    });

    await expect(
      service.getBalanceForUser('w1', {
        userId: 'user-2',
        role: UserRole.CUSTOMER,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('admin bisa redeem point wallet customer', async () => {
    prisma.wallet.findUnique
      .mockResolvedValueOnce({
        id: 'w1',
        pointBalance: 100,
        customer: { userId: 'user-1' },
        partner: null,
      })
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 100 })
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 75 });

    const ledger = await service.redeemForUser(
      { walletId: 'w1', points: 25, sourceType: 'REDEMPTION' },
      { userId: 'admin-1', role: UserRole.OWNER },
    );

    expect(ledger.direction).toBe(LedgerDirection.DEBIT);
    expect(ledger.balanceAfter).toBe(75);
  });

  it('redeem-voucher debit point dan issue voucher dalam satu transaksi', async () => {
    prisma.wallet.findUnique
      .mockResolvedValueOnce({
        id: 'w1',
        customerId: 'cust-1',
        partnerId: null,
        pointBalance: 150,
        customer: { userId: 'user-1' },
        partner: null,
      })
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 150 })
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 50 });
    prisma.voucherTemplate.findUnique.mockResolvedValue({
      id: 'tpl1',
      code: 'POINT100',
      isActive: true,
      pointCost: 100,
    });

    const res = await service.redeemVoucherForUser(
      { walletId: 'w1', templateId: 'tpl1', idempotencyKey: 'redeem-voucher-1' },
      { userId: 'user-1', role: UserRole.CUSTOMER },
    );

    expect(res.pointLedger.direction).toBe(LedgerDirection.DEBIT);
    expect(res.pointLedger.points).toBe(100);
    expect(voucherService.issue).toHaveBeenCalledWith({
      templateId: 'tpl1',
      customerId: 'cust-1',
      partnerId: undefined,
      sourceType: 'POINT_REDEMPTION',
      sourceId: 'pl1',
      tx: prisma,
    });
    expect(res.userVoucher.id).toBe('uv1');
  });

  it('redeem-voucher rollback sebelum debit jika template tidak punya pointCost', async () => {
    prisma.wallet.findUnique.mockResolvedValueOnce({
      id: 'w1',
      customerId: 'cust-1',
      partnerId: null,
      pointBalance: 150,
      customer: { userId: 'user-1' },
      partner: null,
    });
    prisma.voucherTemplate.findUnique.mockResolvedValue({
      id: 'tpl1',
      code: 'FREE',
      isActive: true,
      pointCost: null,
    });

    await expect(
      service.redeemVoucherForUser(
        { walletId: 'w1', templateId: 'tpl1' },
        { userId: 'user-1', role: UserRole.CUSTOMER },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.wallet.update).not.toHaveBeenCalled();
    expect(voucherService.issue).not.toHaveBeenCalled();
  });

  // --- Phase E: point expiry ---

  it('earn mengisi expiresAt default dari config (365 hari)', async () => {
    prisma.wallet.findUnique
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 0 })
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 50 });
    const before = Date.now();
    const ledger: any = await service.earn({ walletId: 'w1', points: 50, orderId: 'o1' });
    expect(ledger.expiresAt).toBeInstanceOf(Date);
    const days = Math.round((ledger.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000));
    expect(days).toBe(365);
  });

  it('earn menghormati expiresAt eksplisit dari pemanggil', async () => {
    prisma.wallet.findUnique
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 0 })
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 10 });
    const explicit = new Date('2027-01-01T00:00:00.000Z');
    const ledger: any = await service.earn({
      walletId: 'w1',
      points: 10,
      orderId: 'o1',
      expiresAt: explicit,
    });
    expect(ledger.expiresAt).toEqual(explicit);
  });

  it('expireDuePoints membuat DEBIT EXPIRED untuk credit jatuh tempo', async () => {
    prisma.pointLedger.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'pl-credit', walletId: 'w1', points: 30, direction: 'CREDIT' }]);
    prisma.pointLedger.findUnique = jest.fn().mockResolvedValue(null);
    prisma.wallet.findUnique
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 30 }) // pre-check
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 30 }) // mutate read
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 0 }); // mutate refresh

    const res = await service.expireDuePoints(new Date());

    expect(res.expiredLedgers).toBe(1);
    expect(res.expiredPoints).toBe(30);
    expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'w1', pointBalance: { gte: 30 } },
      data: { pointBalance: { decrement: 30 } },
    });
    expect(prisma.pointLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'point-expiry-pl-credit',
          sourceType: 'EXPIRY',
        }),
      }),
    );
  });

  it('expireDuePoints idempoten: skip bila EXPIRE sudah ada (run kedua tidak double debit)', async () => {
    prisma.pointLedger.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'pl-credit', walletId: 'w1', points: 30, direction: 'CREDIT' }]);
    prisma.pointLedger.findUnique = jest.fn().mockResolvedValue({ id: 'existing-expire' });

    const res = await service.expireDuePoints(new Date());

    expect(res.expiredLedgers).toBe(0);
    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
    expect(prisma.pointLedger.create).not.toHaveBeenCalled();
  });

  it('expireDuePoints di-clamp ke saldo: tidak membuat pointBalance negatif', async () => {
    prisma.pointLedger.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'pl-credit', walletId: 'w1', points: 100, direction: 'CREDIT' }]);
    prisma.pointLedger.findUnique = jest.fn().mockResolvedValue(null);
    prisma.wallet.findUnique
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 40 }) // saldo cuma 40
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 40 })
      .mockResolvedValueOnce({ id: 'w1', pointBalance: 0 });

    const res = await service.expireDuePoints(new Date());

    expect(res.expiredPoints).toBe(40); // bukan 100
    expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'w1', pointBalance: { gte: 40 } },
      data: { pointBalance: { decrement: 40 } },
    });
  });

  it('expireDuePoints dryRun tidak melakukan mutasi', async () => {
    prisma.pointLedger.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'pl-credit', walletId: 'w1', points: 30, direction: 'CREDIT' }]);
    prisma.pointLedger.findUnique = jest.fn().mockResolvedValue(null);
    prisma.wallet.findUnique.mockResolvedValueOnce({ id: 'w1', pointBalance: 30 });

    const res = await service.expireDuePoints(new Date(), { dryRun: true });

    expect(res.dryRun).toBe(true);
    expect(res.expiredPoints).toBe(30);
    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
    expect(prisma.pointLedger.create).not.toHaveBeenCalled();
  });
});
