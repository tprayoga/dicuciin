import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  Prisma,
  WalletType,
  LedgerDirection,
} from '@prisma/client';
import { D, money } from '../../common/utils/money.util';

type PrismaTx = Prisma.TransactionClient;

export interface WalletOwner {
  customerId?: string;
  partnerId?: string;
}

export interface MoneyMutationInput {
  walletId: string;
  amount: Prisma.Decimal.Value;
  referenceType?: string;
  referenceId?: string;
  orderId?: string;
  description?: string;
  idempotencyKey?: string;
  tx?: PrismaTx;
}

/**
 * Wallet multi-saldo untuk Promotion & Loyalty Engine. Setiap mutasi saldo
 * menulis baris `wallet_ledgers` (keputusan 9). Saldo uang: MAIN (`balance`) &
 * BONUS (`bonusBalance`); poin ditangani `PointService` (`point_ledgers`).
 *
 * Aturan yang ditegakkan:
 * - Top up hanya masuk MAIN_BALANCE.
 * - Cashback hanya masuk BONUS_BALANCE.
 * - Hanya MAIN_BALANCE yang bisa ditarik (BONUS non-withdrawable — keputusan 8).
 *
 * Catatan: tidak menggantikan `WalletsService` (pay/topup lama). Ini service
 * tambahan sebagai integration point yang aman untuk fitur loyalty.
 */
@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  /** Kolom saldo uang sesuai tipe (POINT ditangani PointService). */
  private balanceField(type: WalletType): 'balance' | 'bonusBalance' {
    if (type === WalletType.MAIN_BALANCE) return 'balance';
    if (type === WalletType.BONUS_BALANCE) return 'bonusBalance';
    throw new BadRequestException(
      'POINT_BALANCE dimutasi lewat PointService, bukan WalletService',
    );
  }

  /** Ambil/buat wallet untuk pemilik (retail customer atau B2B partner). */
  async getOrCreateWallet(owner: WalletOwner) {
    if (!owner.customerId && !owner.partnerId) {
      throw new BadRequestException('Owner wallet (customer/partner) wajib diisi');
    }
    const where = owner.customerId
      ? { customerId: owner.customerId }
      : { partnerId: owner.partnerId };
    const existing = await this.prisma.wallet.findFirst({ where });
    if (existing) return existing;
    return this.prisma.wallet.create({ data: { ...where } });
  }

  /** Inti mutasi saldo uang + tulis ledger, atomik. */
  private async mutateMoney(
    db: PrismaTx,
    type: WalletType,
    direction: LedgerDirection,
    input: MoneyMutationInput,
  ) {
    const field = this.balanceField(type);
    const amount = money(input.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Nominal mutasi harus lebih dari 0');
    }

    const wallet = await db.wallet.findUnique({ where: { id: input.walletId } });
    if (!wallet) throw new NotFoundException('Wallet tidak ditemukan');

    const balanceBefore = D(wallet[field]);
    const balanceAfter =
      direction === LedgerDirection.CREDIT
        ? balanceBefore.plus(amount)
        : balanceBefore.minus(amount);

    if (direction === LedgerDirection.DEBIT && balanceAfter.lt(0)) {
      throw new BadRequestException('Saldo tidak mencukupi');
    }

    await db.wallet.update({
      where: { id: wallet.id },
      data: { [field]: balanceAfter },
    });

    return db.walletLedger.create({
      data: {
        walletId: wallet.id,
        orderId: input.orderId,
        walletType: type,
        direction,
        amount,
        balanceBefore,
        balanceAfter,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  /** Jalankan mutasi di transaksi pemanggil bila ada, atau buat transaksi baru. */
  private run<T>(tx: PrismaTx | undefined, fn: (db: PrismaTx) => Promise<T>): Promise<T> {
    return tx ? fn(tx) : this.prisma.$transaction(fn);
  }

  /** Top up → MAIN_BALANCE (keputusan 7: liability, belum revenue). */
  async topUp(input: MoneyMutationInput) {
    return this.run(input.tx, (db) =>
      this.mutateMoney(db, WalletType.MAIN_BALANCE, LedgerDirection.CREDIT, {
        ...input,
        referenceType: input.referenceType ?? 'TOPUP',
      }),
    );
  }

  /** Cashback → BONUS_BALANCE (keputusan 8: non-withdrawable). */
  async creditCashback(input: MoneyMutationInput) {
    return this.run(input.tx, (db) =>
      this.mutateMoney(db, WalletType.BONUS_BALANCE, LedgerDirection.CREDIT, {
        ...input,
        referenceType: input.referenceType ?? 'CASHBACK',
      }),
    );
  }

  /** Debit saldo (mis. pembayaran). Default MAIN; BONUS boleh untuk bayar. */
  async debit(type: WalletType, input: MoneyMutationInput) {
    return this.run(input.tx, (db) =>
      this.mutateMoney(db, type, LedgerDirection.DEBIT, input),
    );
  }

  /**
   * Penarikan saldo (cash-out). Hanya MAIN_BALANCE yang boleh ditarik;
   * BONUS_BALANCE & POINT_BALANCE tidak bisa dicairkan (keputusan 8).
   */
  async withdraw(type: WalletType, input: MoneyMutationInput) {
    if (type !== WalletType.MAIN_BALANCE) {
      throw new BadRequestException(
        'Hanya saldo utama (MAIN_BALANCE) yang bisa ditarik',
      );
    }
    return this.run(input.tx, (db) =>
      this.mutateMoney(db, WalletType.MAIN_BALANCE, LedgerDirection.DEBIT, {
        ...input,
        referenceType: input.referenceType ?? 'WITHDRAW',
      }),
    );
  }

  /** Kredit umum ke bucket tertentu (mis. pengembalian saat refund). */
  async credit(type: WalletType, input: MoneyMutationInput) {
    return this.run(input.tx, (db) =>
      this.mutateMoney(db, type, LedgerDirection.CREDIT, input),
    );
  }

  /**
   * Bayar order dari wallet: pakai BONUS_BALANCE dulu (bila eligible), sisanya
   * MAIN_BALANCE. Menulis satu ledger per debit. Saldo tidak boleh minus —
   * bila MAIN tak cukup untuk sisa, transaksi dilempar error. HARUS dipanggil
   * dalam transaksi pembayaran.
   */
  async payWithWallet(
    tx: PrismaTx,
    input: {
      walletId: string;
      amount: Prisma.Decimal.Value;
      orderId?: string;
      allowBonus?: boolean;
      referenceType?: string;
      referenceId?: string;
      description?: string;
    },
  ): Promise<{ bonusUsed: Prisma.Decimal; mainUsed: Prisma.Decimal }> {
    const amount = money(input.amount);
    const allowBonus = input.allowBonus ?? true;

    const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
    if (!wallet) throw new NotFoundException('Wallet tidak ditemukan');

    const bonusAvailable = D(wallet.bonusBalance);
    const bonusUsed =
      allowBonus && bonusAvailable.gt(0)
        ? Prisma.Decimal.min(bonusAvailable, amount)
        : new Prisma.Decimal(0);
    const mainUsed = amount.minus(bonusUsed);

    // Cek kecukupan saldo utama untuk sisa sebelum mutasi (saldo tak boleh minus).
    if (D(wallet.balance).lt(mainUsed)) {
      throw new BadRequestException('Saldo wallet tidak cukup');
    }

    if (bonusUsed.gt(0)) {
      await this.mutateMoney(tx, WalletType.BONUS_BALANCE, LedgerDirection.DEBIT, {
        walletId: wallet.id,
        amount: bonusUsed,
        orderId: input.orderId,
        referenceType: input.referenceType ?? 'PAYMENT',
        referenceId: input.referenceId,
        description: input.description ?? 'Pembayaran (bonus)',
      });
    }
    if (mainUsed.gt(0)) {
      await this.mutateMoney(tx, WalletType.MAIN_BALANCE, LedgerDirection.DEBIT, {
        walletId: wallet.id,
        amount: mainUsed,
        orderId: input.orderId,
        referenceType: input.referenceType ?? 'PAYMENT',
        referenceId: input.referenceId,
        description: input.description ?? 'Pembayaran (saldo utama)',
      });
    }

    return { bonusUsed, mainUsed };
  }

  /** Ringkasan saldo. */
  async getBalances(walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet tidak ditemukan');
    return {
      mainBalance: wallet.balance,
      bonusBalance: wallet.bonusBalance,
      pointBalance: wallet.pointBalance,
    };
  }
}
