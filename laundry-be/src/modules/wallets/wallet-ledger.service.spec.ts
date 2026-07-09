import { Test } from '@nestjs/testing';
import { Prisma, WalletType, LedgerDirection } from '@prisma/client';
import { WalletLedgerService } from './wallet-ledger.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Mock Prisma berbasis-store: menyimpan satu wallet in-memory dan meniru
 * semantik `updateMany` bersyarat (compare-and-decrement) + `increment`/
 * `decrement`. Ini penting agar test konkurensi bermakna: guard atomik
 * `<field> >= amount` benar-benar diuji, bukan sekadar stub yang selalu lolos.
 */
function makePrismaMock(initial?: Partial<{ balance: number; bonusBalance: number }>) {
  const w: any = {
    id: 'w1',
    balance: new Prisma.Decimal(initial?.balance ?? 0),
    bonusBalance: new Prisma.Decimal(initial?.bonusBalance ?? 0),
    pointBalance: 0,
  };

  const applyData = (data: any) => {
    for (const [k, v] of Object.entries<any>(data)) {
      if (v && typeof v === 'object' && 'increment' in v) {
        w[k] = new Prisma.Decimal(w[k]).plus(v.increment);
      } else if (v && typeof v === 'object' && 'decrement' in v) {
        w[k] = new Prisma.Decimal(w[k]).minus(v.decrement);
      } else {
        w[k] = v;
      }
    }
  };

  const matches = (where: any) => {
    if (where.id && where.id !== w.id) return false;
    for (const [k, cond] of Object.entries<any>(where)) {
      if (k === 'id') continue;
      if (cond && typeof cond === 'object' && 'gte' in cond) {
        if (new Prisma.Decimal(w[k]).lt(cond.gte)) return false;
      }
    }
    return true;
  };

  const prisma: any = {
    __wallet: w,
    wallet: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === w.id ? { ...w } : null,
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        if (where.id !== w.id) throw new Error('not found');
        return { ...w };
      }),
      update: jest.fn(async ({ data }: any) => {
        applyData(data);
        return { ...w };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!matches(where)) return { count: 0 };
        applyData(data);
        return { count: 1 };
      }),
    },
    walletLedger: {
      create: jest.fn(async ({ data }: any) => data),
    },
  };
  prisma.$transaction = jest.fn((fn: any) => fn(prisma));
  return prisma;
}

describe('WalletLedgerService', () => {
  let service: WalletLedgerService;
  let prisma: any;

  const build = async (p: any) => {
    const moduleRef = await Test.createTestingModule({
      providers: [WalletLedgerService, { provide: PrismaService, useValue: p }],
    }).compile();
    return moduleRef.get(WalletLedgerService);
  };

  beforeEach(async () => {
    prisma = makePrismaMock();
    service = await build(prisma);
  });

  it('top up creates MAIN_BALANCE ledger (CREDIT) via increment atomik', async () => {
    const ledger = await service.topUp({ walletId: 'w1', amount: 100000 });
    expect(ledger.walletType).toBe(WalletType.MAIN_BALANCE);
    expect(ledger.direction).toBe(LedgerDirection.CREDIT);
    expect(ledger.balanceBefore.toString()).toBe('0');
    expect(ledger.balanceAfter.toString()).toBe('100000');
    expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { balance: { increment: expect.anything() } },
    });
  });

  it('cashback creates BONUS_BALANCE ledger (CREDIT)', async () => {
    const ledger = await service.creditCashback({ walletId: 'w1', amount: 5000 });
    expect(ledger.walletType).toBe(WalletType.BONUS_BALANCE);
    expect(ledger.direction).toBe(LedgerDirection.CREDIT);
    expect(ledger.balanceAfter.toString()).toBe('5000');
    expect(prisma.__wallet.bonusBalance.toString()).toBe('5000');
  });

  it('debit menurunkan saldo & mencatat balanceBefore/After benar', async () => {
    prisma.__wallet.balance = new Prisma.Decimal(100000);
    const ledger = await service.debit(WalletType.MAIN_BALANCE, {
      walletId: 'w1',
      amount: 30000,
    });
    expect(ledger.direction).toBe(LedgerDirection.DEBIT);
    expect(ledger.balanceBefore.toString()).toBe('100000');
    expect(ledger.balanceAfter.toString()).toBe('70000');
    expect(prisma.__wallet.balance.toString()).toBe('70000');
  });

  it('debit melebihi saldo ditolak (guard gte), saldo tak berubah', async () => {
    prisma.__wallet.balance = new Prisma.Decimal(10000);
    await expect(
      service.debit(WalletType.MAIN_BALANCE, { walletId: 'w1', amount: 30000 }),
    ).rejects.toThrow('Saldo tidak mencukupi');
    expect(prisma.__wallet.balance.toString()).toBe('10000');
    expect(prisma.walletLedger.create).not.toHaveBeenCalled();
  });

  it('bonus balance tidak bisa ditarik (withdraw non-MAIN ditolak)', async () => {
    await expect(
      service.withdraw(WalletType.BONUS_BALANCE, { walletId: 'w1', amount: 1000 }),
    ).rejects.toThrow();
  });

  it('payWithWallet pakai BONUS dulu lalu MAIN', async () => {
    prisma.__wallet.balance = new Prisma.Decimal(100000);
    prisma.__wallet.bonusBalance = new Prisma.Decimal(20000);
    const res = await service.payWithWallet(prisma, {
      walletId: 'w1',
      amount: 50000,
      orderId: 'o1',
    });
    expect(res.bonusUsed.toString()).toBe('20000');
    expect(res.mainUsed.toString()).toBe('30000');
    expect(prisma.walletLedger.create).toHaveBeenCalledTimes(2);
    expect(prisma.__wallet.bonusBalance.toString()).toBe('0');
    expect(prisma.__wallet.balance.toString()).toBe('70000');
  });

  it('transaksi gagal karena saldo kurang', async () => {
    await expect(
      service.payWithWallet(prisma, { walletId: 'w1', amount: 50000, orderId: 'o1' }),
    ).rejects.toThrow();
  });

  it('wallet tidak ditemukan → NotFound', async () => {
    await expect(
      service.topUp({ walletId: 'ghost', amount: 1000 }),
    ).rejects.toThrow('Wallet tidak ditemukan');
  });

  // --- REGRESI RACE CONDITION (G2) ---
  it('konkuren: banyak debit paralel tidak pernah membuat saldo minus / lost-update', async () => {
    prisma = makePrismaMock({ balance: 100000 });
    service = await build(prisma);

    // 10 debit @30.000 pada saldo 100.000 → hanya 3 yang boleh sukses.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        service.debit(WalletType.MAIN_BALANCE, { walletId: 'w1', amount: 30000 }),
      ),
    );

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    expect(ok).toBe(3); // floor(100000 / 30000)
    expect(failed).toBe(7);
    expect(prisma.__wallet.balance.gte(0)).toBe(true);
    expect(prisma.__wallet.balance.toString()).toBe('10000'); // sisa benar
    // Hanya debit yang sukses yang menulis ledger (tak ada ledger hantu).
    expect(prisma.walletLedger.create).toHaveBeenCalledTimes(3);
  });

  it('konkuren: credit + debit campuran konsisten dengan running balance', async () => {
    prisma = makePrismaMock({ balance: 50000 });
    service = await build(prisma);

    await Promise.allSettled([
      service.topUp({ walletId: 'w1', amount: 20000 }),
      service.debit(WalletType.MAIN_BALANCE, { walletId: 'w1', amount: 10000 }),
      service.topUp({ walletId: 'w1', amount: 5000 }),
      service.debit(WalletType.MAIN_BALANCE, { walletId: 'w1', amount: 15000 }),
    ]);

    // 50000 + 20000 - 10000 + 5000 - 15000 = 50000
    expect(prisma.__wallet.balance.toString()).toBe('50000');
    expect(prisma.__wallet.balance.gte(0)).toBe(true);
  });
});
