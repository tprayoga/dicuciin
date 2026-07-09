import { Injectable, NotFoundException } from '@nestjs/common';
import {
  LedgerDirection,
  MembershipTier,
  Prisma,
  UserSegment,
  VoucherStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const tierLabel = (tier?: MembershipTier | null) => {
  if (!tier) return 'Silver';
  return tier.charAt(0) + tier.slice(1).toLowerCase();
};

const toNumber = (value: Prisma.Decimal | number | null | undefined) =>
  value == null ? 0 : Number(value);

@Injectable()
export class MobileMemberService {
  constructor(private readonly prisma: PrismaService) {}

  private async getCustomerContext(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        customer: {
          include: {
            wallet: true,
            membershipStatus: true,
          },
        },
      },
    });

    if (!user?.customer) {
      throw new NotFoundException('Profil customer tidak ditemukan');
    }

    return { user, customer: user.customer };
  }

  async getSummary(userId: string) {
    const { user, customer } = await this.getCustomerContext(userId);
    const wallet = customer.wallet;
    const status = customer.membershipStatus;
    const currentTier = status?.currentTier ?? MembershipTier.SILVER;

    const [tiers, voucherCounts, activeVouchers, promos, happyHourActive, lifetimePoints] =
      await Promise.all([
        this.prisma.membershipTierConfig.findMany({
          where: { isActive: true },
          orderBy: { level: 'asc' },
        }),
        this.prisma.userVoucher.groupBy({
          by: ['status'],
          where: { customerId: customer.id },
          _count: { _all: true },
        }),
        this.prisma.userVoucher.findMany({
          where: { customerId: customer.id, status: VoucherStatus.ACTIVE },
          include: { template: true },
          orderBy: { expiresAt: 'asc' },
          take: 5,
        }),
        this.prisma.promo.findMany({
          where: {
            isActive: true,
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
          },
          orderBy: { endDate: 'asc' },
          take: 20,
        }),
        this.prisma.happyHourRule.count({
          where: {
            isActive: true,
            startDate: { lte: new Date() },
            OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
          },
        }),
        wallet
          ? this.prisma.pointLedger.aggregate({
              where: { walletId: wallet.id, direction: LedgerDirection.CREDIT },
              _sum: { points: true },
            })
          : Promise.resolve({ _sum: { points: 0 } }),
      ]);

    const currentTierConfig = tiers.find((tier) => tier.tier === currentTier);
    const nextTierConfig = currentTierConfig
      ? tiers.find((tier) => tier.level > currentTierConfig.level)
      : tiers[1];
    const earnedSpending = toNumber(status?.earnedSpending);
    const nextThreshold = toNumber(nextTierConfig?.thresholdSpending);
    const currentThreshold = toNumber(currentTierConfig?.thresholdSpending);
    const progressRange = Math.max(nextThreshold - currentThreshold, 1);
    const progressValue = Math.max(earnedSpending - currentThreshold, 0);
    const tierProgressPercent = nextTierConfig
      ? Math.min(100, Math.round((progressValue / progressRange) * 100))
      : 100;

    const countByStatus = new Map(
      voucherCounts.map((row) => [row.status, row._count._all]),
    );
    const currentPoints = wallet?.pointBalance ?? 0;
    const pointsToNextTier = nextTierConfig
      ? Math.max(0, Math.ceil(nextThreshold / 1000) - currentPoints)
      : 0;

    return {
      customer: {
        id: customer.id,
        name: user.name,
        phone: user.phone,
        memberCode: customer.memberCode,
      },
      membership: {
        tier: tierLabel(currentTier),
        currentTier,
        currentPoints,
        lifetimePoints: lifetimePoints._sum.points ?? currentPoints,
        lifetimeSpending: earnedSpending,
        lifetimeTransactions: status?.successfulTxnCount ?? 0,
        nextTier: tierLabel(nextTierConfig?.tier),
        nextTierCode: nextTierConfig?.tier ?? null,
        pointsToNextTier,
        tierProgressPercent,
      },
      wallet: {
        id: wallet?.id ?? null,
        balance: toNumber(wallet?.balance),
        bonusBalance: toNumber(wallet?.bonusBalance),
        pointBalance: currentPoints,
      },
      vouchers: {
        activeCount: countByStatus.get(VoucherStatus.ACTIVE) ?? 0,
        usedCount: countByStatus.get(VoucherStatus.USED) ?? 0,
        expiredCount: countByStatus.get(VoucherStatus.EXPIRED) ?? 0,
        active: activeVouchers,
      },
      promos: {
        availableCount: promos.length,
        happyHourActive: happyHourActive > 0,
        available: promos,
      },
    };
  }

  async getVouchers(userId: string) {
    const { customer } = await this.getCustomerContext(userId);
    const vouchers = await this.prisma.userVoucher.findMany({
      where: { customerId: customer.id },
      include: { template: true },
      orderBy: [{ status: 'asc' }, { issuedAt: 'desc' }],
    });

    return {
      active: vouchers.filter((voucher) => voucher.status === VoucherStatus.ACTIVE),
      used: vouchers.filter((voucher) => voucher.status === VoucherStatus.USED),
      expired: vouchers.filter((voucher) => voucher.status === VoucherStatus.EXPIRED),
    };
  }

  async getPoints(userId: string) {
    const { customer } = await this.getCustomerContext(userId);
    const wallet = customer.wallet;
    if (!wallet) {
      return {
        currentPoints: 0,
        ledger: [],
        tier: null,
        nextTier: null,
      };
    }

    const [summary, ledger] = await Promise.all([
      this.getSummary(userId),
      this.prisma.pointLedger.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      currentPoints: wallet.pointBalance,
      ledger,
      tier: summary.membership,
      nextTier: {
        name: summary.membership.nextTier,
        code: summary.membership.nextTierCode,
        pointsToNextTier: summary.membership.pointsToNextTier,
      },
    };
  }
}
