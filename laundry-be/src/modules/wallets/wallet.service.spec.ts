import { Test } from '@nestjs/testing';
import { Prisma, WalletType, LedgerDirection } from '@prisma/client';
import { WalletService } from './wallet.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'w1',
          balance: new Prisma.Decimal(0),
          bonusBalance: new Prisma.Decimal(0),
          pointBalance: 0,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      walletLedger: {
        create: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));

    const moduleRef = await Test.createTestingModule({
      providers: [WalletService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(WalletService);
  });

  it('top up creates MAIN_BALANCE ledger (CREDIT)', async () => {
    const ledger = await service.topUp({ walletId: 'w1', amount: 100000 });
    expect(ledger.walletType).toBe(WalletType.MAIN_BALANCE);
    expect(ledger.direction).toBe(LedgerDirection.CREDIT);
    expect(ledger.balanceAfter.toString()).toBe('100000');
    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balance: expect.anything() },
    });
  });

  it('cashback creates BONUS_BALANCE ledger (CREDIT)', async () => {
    const ledger = await service.creditCashback({ walletId: 'w1', amount: 5000 });
    expect(ledger.walletType).toBe(WalletType.BONUS_BALANCE);
    expect(ledger.direction).toBe(LedgerDirection.CREDIT);
    expect(ledger.balanceAfter.toString()).toBe('5000');
    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { bonusBalance: expect.anything() },
    });
  });

  it('bonus balance tidak bisa ditarik (withdraw non-MAIN ditolak)', async () => {
    await expect(
      service.withdraw(WalletType.BONUS_BALANCE, { walletId: 'w1', amount: 1000 }),
    ).rejects.toThrow();
  });

  it('payWithWallet pakai BONUS dulu lalu MAIN', async () => {
    prisma.wallet.findUnique.mockResolvedValue({
      id: 'w1',
      balance: new Prisma.Decimal(100000),
      bonusBalance: new Prisma.Decimal(20000),
      pointBalance: 0,
    });
    const res = await service.payWithWallet(prisma, {
      walletId: 'w1',
      amount: 50000,
      orderId: 'o1',
    });
    expect(res.bonusUsed.toString()).toBe('20000');
    expect(res.mainUsed.toString()).toBe('30000');
    // dua ledger debit (bonus + main)
    expect(prisma.walletLedger.create).toHaveBeenCalledTimes(2);
  });

  it('transaksi gagal karena saldo kurang', async () => {
    prisma.wallet.findUnique.mockResolvedValue({
      id: 'w1',
      balance: new Prisma.Decimal(0),
      bonusBalance: new Prisma.Decimal(0),
      pointBalance: 0,
    });
    await expect(
      service.payWithWallet(prisma, { walletId: 'w1', amount: 50000, orderId: 'o1' }),
    ).rejects.toThrow();
  });
});
