import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, UserSegment, MembershipTier } from '@prisma/client';

type PrismaTx = Prisma.TransactionClient;

/** Pengali poin default per tier bila config belum di-seed (Silver 1x..Diamond 2x). */
const DEFAULT_POINT_MULTIPLIER: Record<MembershipTier, number> = {
  [MembershipTier.SILVER]: 1,
  [MembershipTier.GOLD]: 1.2,
  [MembershipTier.PLATINUM]: 1.5,
  [MembershipTier.DIAMOND]: 2,
};

/**
 * Membership tier RETAIL (Silver/Gold/Platinum/Diamond). Tier naik dari
 * akumulasi transaksi sukses (earnedSpending / successfulTxnCount) — top up
 * DIKECUALIKAN (keputusan 4). Sumber kebenaran ambang ada di `membership_tiers`.
 */
@Injectable()
export class MembershipTierService {
  constructor(private prisma: PrismaService) {}

  async listTiers() {
    return this.prisma.membershipTierConfig.findMany({ orderBy: { level: 'asc' } });
  }

  async upsertTier(tier: MembershipTier, data: Prisma.MembershipTierConfigCreateInput) {
    return this.prisma.membershipTierConfig.upsert({
      where: { tier },
      create: { ...data, tier },
      update: data,
    });
  }

  /** Pastikan ada baris status untuk customer. */
  async ensureStatus(customerId: string) {
    const existing = await this.prisma.userMembershipStatus.findUnique({
      where: { customerId },
    });
    if (existing) return existing;
    return this.prisma.userMembershipStatus.create({
      data: { customerId, segment: UserSegment.RETAIL, currentTier: MembershipTier.SILVER },
    });
  }

  async getStatus(customerId: string) {
    return this.prisma.userMembershipStatus.findUnique({ where: { customerId } });
  }

  async getStatusByUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customer: true, b2bPartner: true },
    });
    if (!user) return null;
    if (user.customer) {
      return this.prisma.userMembershipStatus.findUnique({
        where: { customerId: user.customer.id },
      });
    }
    if (user.b2bPartner) {
      return this.prisma.userMembershipStatus.findUnique({
        where: { partnerId: user.b2bPartner.id },
      });
    }
    return null;
  }

  /** Benefit tier saat ini (pengali poin & rate cashback). */
  async getBenefits(tier: MembershipTier | null | undefined) {
    if (!tier) return { pointMultiplier: new Prisma.Decimal(1), cashbackRate: new Prisma.Decimal(0) };
    const config = await this.prisma.membershipTierConfig.findUnique({ where: { tier } });
    if (config) {
      return { pointMultiplier: config.pointMultiplier, cashbackRate: config.cashbackRate };
    }
    // Fallback ke pengali default bila tier belum di-seed.
    return {
      pointMultiplier: new Prisma.Decimal(DEFAULT_POINT_MULTIPLIER[tier]),
      cashbackRate: new Prisma.Decimal(0),
    };
  }

  /**
   * Catat transaksi sukses (saat order PAID) lalu evaluasi ulang tier. Harus
   * dipanggil dalam transaksi pembayaran. `spending` = nilai transaksi (bukan top up).
   */
  async recordSuccessfulTransaction(
    tx: PrismaTx,
    customerId: string,
    spending: Prisma.Decimal.Value,
  ) {
    let status = await tx.userMembershipStatus.findUnique({ where: { customerId } });
    if (!status) {
      status = await tx.userMembershipStatus.create({
        data: { customerId, segment: UserSegment.RETAIL, currentTier: MembershipTier.SILVER },
      });
    }

    const earnedSpending = new Prisma.Decimal(status.earnedSpending).plus(spending);
    const successfulTxnCount = status.successfulTxnCount + 1;

    const newTier = await this.resolveTier(tx, earnedSpending, successfulTxnCount);
    const tierChanged = newTier !== status.currentTier;

    return tx.userMembershipStatus.update({
      where: { id: status.id },
      data: {
        earnedSpending,
        successfulTxnCount,
        currentTier: newTier,
        evaluatedAt: new Date(),
        ...(tierChanged ? { achievedAt: new Date() } : {}),
      },
    });
  }

  /**
   * Balikkan akumulasi saat order di-refund (keputusan 10): kurangi spending &
   * jumlah transaksi, lalu evaluasi ulang tier (bisa turun).
   */
  async reverseTransaction(
    tx: PrismaTx,
    customerId: string,
    spending: Prisma.Decimal.Value,
  ) {
    const status = await tx.userMembershipStatus.findUnique({ where: { customerId } });
    if (!status) return null;

    const earnedSpending = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      new Prisma.Decimal(status.earnedSpending).minus(spending),
    );
    const successfulTxnCount = Math.max(0, status.successfulTxnCount - 1);
    const newTier = await this.resolveTier(tx, earnedSpending, successfulTxnCount);

    return tx.userMembershipStatus.update({
      where: { id: status.id },
      data: {
        earnedSpending,
        successfulTxnCount,
        currentTier: newTier,
        evaluatedAt: new Date(),
      },
    });
  }

  /** Tier tertinggi yang ambangnya terpenuhi. */
  private async resolveTier(
    tx: PrismaTx,
    earnedSpending: Prisma.Decimal,
    txnCount: number,
  ): Promise<MembershipTier> {
    const tiers = await tx.membershipTierConfig.findMany({
      where: { isActive: true },
      orderBy: { level: 'desc' },
    });
    for (const t of tiers) {
      const spendingOk =
        t.thresholdSpending == null || earnedSpending.gte(t.thresholdSpending);
      const txnOk = t.thresholdTxnCount == null || txnCount >= t.thresholdTxnCount;
      // Naik tier bila ambang spending ATAU jumlah transaksi terpenuhi (keputusan 4).
      if (
        (t.thresholdSpending != null && spendingOk) ||
        (t.thresholdTxnCount != null && txnOk) ||
        (t.thresholdSpending == null && t.thresholdTxnCount == null)
      ) {
        return t.tier;
      }
    }
    return MembershipTier.SILVER;
  }
}
