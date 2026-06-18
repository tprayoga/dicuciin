import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, LedgerDirection, UserRole } from '@prisma/client';
import { VoucherService } from '../vouchers/voucher.service';
import { LoyaltyConfigService } from '../loyalty-config/loyalty-config.service';

type PrismaTx = Prisma.TransactionClient;

export interface EarnPointsInput {
  walletId: string;
  points: number;
  orderId: string; // poin hanya dari transaksi sukses (keputusan 3)
  sourceType?: string;
  sourceId?: string;
  expiresAt?: Date;
  description?: string;
  idempotencyKey?: string;
  tx?: PrismaTx;
}

export interface RedeemPointsInput {
  walletId: string;
  points: number;
  sourceType?: string;
  sourceId?: string;
  description?: string;
  idempotencyKey?: string;
  tx?: PrismaTx;
}

export interface RedeemVoucherWithPointsInput {
  walletId: string;
  templateId: string;
  description?: string;
  idempotencyKey?: string;
}

export interface AuthenticatedPointUser {
  userId: string;
  role: UserRole;
}

/**
 * Loyalty point ledger (`point_ledgers`). Poin:
 * - hanya diberikan dari transaksi sukses (keputusan 3) → `earn` wajib `orderId`,
 * - tidak bisa diuangkan (keputusan 8) → tak ada konversi poin→saldo uang.
 *
 * `Wallet.pointBalance` adalah cache; sumber kebenaran tetap ledger ini.
 */
@Injectable()
export class PointService {
  constructor(
    private prisma: PrismaService,
    private voucherService: VoucherService,
    private loyaltyConfig: LoyaltyConfigService,
  ) {}

  /**
   * Masa berlaku default poin earn = now + `pointExpiryDays` (default 365).
   * `pointExpiryDays` selalu > 0 (di-clamp di config), jadi poin earn baru selalu
   * punya `expiresAt`. Poin lama (historis) tetap `expiresAt = null` → non-expiring
   * (backward compatible).
   */
  private defaultEarnExpiry(): Date | undefined {
    const days = this.loyaltyConfig.pointExpiryDays;
    return days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : undefined;
  }

  private readonly adminRoles = new Set<UserRole>([
    UserRole.SUPER_ADMIN,
    UserRole.OWNER,
    UserRole.ADMIN_OUTLET,
  ]);

  private run<T>(tx: PrismaTx | undefined, fn: (db: PrismaTx) => Promise<T>): Promise<T> {
    return tx ? fn(tx) : this.prisma.$transaction(fn);
  }

  private async mutate(
    db: PrismaTx,
    direction: LedgerDirection,
    walletId: string,
    points: number,
    meta: {
      orderId?: string;
      sourceType?: string;
      sourceId?: string;
      expiresAt?: Date;
      description?: string;
      idempotencyKey?: string;
    },
  ) {
    if (!Number.isInteger(points) || points <= 0) {
      throw new BadRequestException('Jumlah poin harus bilangan bulat > 0');
    }

    const wallet = await db.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet tidak ditemukan');

    if (direction === LedgerDirection.CREDIT) {
      await db.wallet.update({
        where: { id: wallet.id },
        data: { pointBalance: { increment: points } },
      });
    } else {
      const debited = await db.wallet.updateMany({
        where: { id: wallet.id, pointBalance: { gte: points } },
        data: { pointBalance: { decrement: points } },
      });
      if (debited.count === 0) {
        throw new BadRequestException('Poin tidak mencukupi');
      }
    }

    const refreshed = await db.wallet.findUnique({ where: { id: wallet.id } });
    if (!refreshed) throw new NotFoundException('Wallet tidak ditemukan');
    const balanceAfter = refreshed.pointBalance;
    const balanceBefore =
      direction === LedgerDirection.CREDIT
        ? balanceAfter - points
        : balanceAfter + points;

    return db.pointLedger.create({
      data: {
        walletId: wallet.id,
        orderId: meta.orderId,
        direction,
        points,
        balanceBefore,
        balanceAfter,
        sourceType: meta.sourceType,
        sourceId: meta.sourceId,
        expiresAt: meta.expiresAt,
        description: meta.description,
        idempotencyKey: meta.idempotencyKey,
      },
    });
  }

  private rethrowDuplicate(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException('Transaksi point sudah diproses');
    }
    throw err;
  }

  private async assertWalletAccess(walletId: string, user: AuthenticatedPointUser) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        customer: { select: { userId: true } },
        partner: { select: { userId: true } },
      },
    });
    if (!wallet) throw new NotFoundException('Wallet tidak ditemukan');
    if (this.adminRoles.has(user.role)) return wallet;

    const ownsCustomerWallet = wallet.customer?.userId === user.userId;
    const ownsPartnerWallet = wallet.partner?.userId === user.userId;
    if (!ownsCustomerWallet && !ownsPartnerWallet) {
      throw new ForbiddenException('Tidak boleh mengakses point wallet ini');
    }
    return wallet;
  }

  /** Tambah poin dari transaksi sukses (keputusan 3). */
  async earn(input: EarnPointsInput) {
    if (!input.orderId) {
      throw new BadRequestException(
        'Poin hanya bisa diberikan dari transaksi sukses (orderId wajib)',
      );
    }
    return this.run(input.tx, (db) =>
      this.mutate(db, LedgerDirection.CREDIT, input.walletId, input.points, {
        orderId: input.orderId,
        sourceType: input.sourceType ?? 'ORDER',
        sourceId: input.sourceId ?? input.orderId,
        // Bila pemanggil tidak menyetel expiresAt, pakai default dari config.
        expiresAt: input.expiresAt ?? this.defaultEarnExpiry(),
        description: input.description,
        idempotencyKey: input.idempotencyKey,
      }),
    );
  }

  /** Tukar poin (mis. redeem voucher). Poin tidak bisa jadi uang. */
  async redeem(input: RedeemPointsInput) {
    try {
      return await this.run(input.tx, (db) =>
        this.mutate(db, LedgerDirection.DEBIT, input.walletId, input.points, {
          sourceType: input.sourceType ?? 'REDEMPTION',
          sourceId: input.sourceId,
          description: input.description,
          idempotencyKey: input.idempotencyKey,
        }),
      );
    } catch (err) {
      this.rethrowDuplicate(err);
    }
  }

  async getBalanceForUser(walletId: string, user: AuthenticatedPointUser) {
    const wallet = await this.assertWalletAccess(walletId, user);
    return { walletId: wallet.id, pointBalance: wallet.pointBalance };
  }

  async redeemForUser(input: RedeemPointsInput, user: AuthenticatedPointUser) {
    await this.assertWalletAccess(input.walletId, user);
    return this.redeem(input);
  }

  async redeemVoucherForUser(
    input: RedeemVoucherWithPointsInput,
    user: AuthenticatedPointUser,
  ) {
    const wallet = await this.assertWalletAccess(input.walletId, user);
    if (!wallet.customerId && !wallet.partnerId) {
      throw new BadRequestException('Wallet tidak memiliki owner customer/partner');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.voucherTemplate.findUnique({
          where: { id: input.templateId },
        });
        if (!template) throw new NotFoundException('Template voucher tidak ditemukan');
        if (!template.isActive) {
          throw new BadRequestException('Template voucher tidak aktif');
        }

        const pointCost = template.pointCost ?? 0;
        if (pointCost <= 0) {
          throw new BadRequestException('Template voucher tidak bisa ditebus dengan point');
        }

        const pointLedger = await this.redeem({
          walletId: wallet.id,
          points: pointCost,
          sourceType: 'VOUCHER_REDEMPTION',
          sourceId: template.id,
          description: input.description ?? `Redeem voucher ${template.code}`,
          idempotencyKey: input.idempotencyKey,
          tx,
        });

        const userVoucher = await this.voucherService.issue({
          templateId: template.id,
          customerId: wallet.customerId ?? undefined,
          partnerId: wallet.partnerId ?? undefined,
          sourceType: 'POINT_REDEMPTION',
          sourceId: pointLedger.id,
          tx,
        });

        return { pointLedger, userVoucher };
      });
    } catch (err) {
      this.rethrowDuplicate(err);
    }
  }

  /**
   * Tarik kembali poin yang diberikan dari sebuah order saat refund (keputusan
   * 10). Di-clamp ke saldo tersedia agar tak minus (bila poin sudah terpakai).
   * Idempoten via idempotencyKey.
   */
  async reverseForOrder(tx: PrismaTx, walletId: string, orderId: string) {
    const earned = await tx.pointLedger.findMany({
      where: { orderId, walletId, direction: LedgerDirection.CREDIT },
    });
    const totalEarned = earned.reduce((sum, l) => sum + l.points, 0);
    if (totalEarned <= 0) return null;

    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) return null;
    const toReverse = Math.min(totalEarned, wallet.pointBalance);
    if (toReverse <= 0) return null;

    return this.mutate(tx, LedgerDirection.DEBIT, walletId, toReverse, {
      orderId,
      sourceType: 'REFUND_REVERSAL',
      sourceId: orderId,
      description: `Pembalikan poin refund order`,
      idempotencyKey: `point-reverse-${orderId}`,
    });
  }

  async getBalance(walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet tidak ditemukan');
    return wallet.pointBalance;
  }

  /**
   * Job kedaluwarsa poin. Mencari `PointLedger` CREDIT yang sudah `expiresAt <= now`
   * dan belum punya pasangan EXPIRE (idempoten via `idempotencyKey=point-expiry-<ledgerId>`),
   * lalu men-debit saldo poin.
   *
   * AMAN & IDEMPOTEN:
   * - Tiap credit ledger di-debit maksimal `min(credit.points, saldo poin saat itu)` →
   *   `Wallet.pointBalance` tidak pernah negatif (juga dijaga guard `updateMany` di `mutate`).
   * - Diproses berurutan; bila dijalankan ulang, key unik mencegah double-debit.
   *
   * LIMITATION (didokumentasikan): tidak ada tracking "sisa terpakai" per credit ledger,
   * jadi ini BUKAN FIFO-exact. Poin fungible; total yang di-expire tetap di-clamp ke saldo
   * agar tak melebihi yang benar-benar tersedia.
   *
   * @param options.dryRun true → hanya menghitung (tidak menulis ledger / mutasi saldo).
   */
  async expireDuePoints(
    now: Date = new Date(),
    options: { dryRun?: boolean } = {},
  ): Promise<{ scanned: number; expiredLedgers: number; expiredPoints: number; dryRun: boolean }> {
    const dryRun = options.dryRun ?? false;
    const dueCredits = await this.prisma.pointLedger.findMany({
      where: {
        direction: LedgerDirection.CREDIT,
        expiresAt: { not: null, lte: now },
      },
      orderBy: { expiresAt: 'asc' },
    });

    let scanned = 0;
    let expiredLedgers = 0;
    let expiredPoints = 0;

    for (const credit of dueCredits) {
      scanned++;
      const idempotencyKey = `point-expiry-${credit.id}`;

      const already = await this.prisma.pointLedger.findUnique({
        where: { idempotencyKey },
      });
      if (already) continue; // sudah pernah di-expire → idempoten

      const wallet = await this.prisma.wallet.findUnique({
        where: { id: credit.walletId },
      });
      if (!wallet || wallet.pointBalance <= 0) continue;

      const toExpire = Math.min(credit.points, wallet.pointBalance);
      if (toExpire <= 0) continue;

      if (dryRun) {
        expiredLedgers++;
        expiredPoints += toExpire;
        continue;
      }

      try {
        await this.prisma.$transaction((tx) =>
          this.mutate(tx, LedgerDirection.DEBIT, credit.walletId, toExpire, {
            sourceType: 'EXPIRY',
            sourceId: credit.id,
            description: 'Poin kedaluwarsa',
            idempotencyKey,
          }),
        );
        expiredLedgers++;
        expiredPoints += toExpire;
      } catch (err) {
        // Dijalankan paralel (key unik) atau saldo berubah → aman dilewati.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        if (err instanceof BadRequestException) continue;
        throw err;
      }
    }

    return { scanned, expiredLedgers, expiredPoints, dryRun };
  }
}
