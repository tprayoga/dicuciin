import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LedgerDirection, OrderStatus, WalletType } from '@prisma/client';
import { toNum } from '../../common/utils/money.util';

const PAID_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.RECEIVED,
  OrderStatus.WASHING,
  OrderStatus.DRYING,
  OrderStatus.IRONING,
  OrderStatus.PACKING,
  OrderStatus.READY_PICKUP,
  OrderStatus.COMPLETED,
];

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getOutletSummary(outletId?: string) {
    const where = outletId ? { id: outletId } : {};
    const outlets = await this.prisma.outlet.findMany({
      where,
      include: {
        _count: {
          select: {
            orders: { where: { status: { in: PAID_STATUSES } } },
            outletUsers: true,
            iotDevices: true,
          },
        },
      },
    });

    return outlets.map((o) => ({
      id: o.id,
      name: o.name,
      code: o.code,
      isActive: o.isActive,
      totalPaidOrders: o._count.orders,
      totalStaff: o._count.outletUsers,
      totalDevices: o._count.iotDevices,
    }));
  }

  /** Kinerja per staff: jumlah & nilai penjualan + jumlah & rata-rata ulasan. */
  async getStaffPerformance(outletId?: string) {
    const orderAgg = await this.prisma.order.groupBy({
      by: ['staffUserId'],
      where: {
        staffUserId: { not: null },
        status: { in: PAID_STATUSES },
        ...(outletId ? { outletId } : {}),
      },
      _count: true,
      _sum: { totalAmount: true },
    });

    const reviewAgg = await this.prisma.review.groupBy({
      by: ['staffUserId'],
      where: { staffUserId: { not: null } },
      _count: true,
      _avg: { rating: true },
    });

    const ids = Array.from(
      new Set<string>([
        ...orderAgg.map((o) => o.staffUserId).filter((x): x is string => !!x),
        ...reviewAgg.map((r) => r.staffUserId).filter((x): x is string => !!x),
      ]),
    );

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, role: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return ids
      .map((id) => {
        const o = orderAgg.find((x) => x.staffUserId === id);
        const r = reviewAgg.find((x) => x.staffUserId === id);
        return {
          staffId: id,
          name: userMap.get(id)?.name ?? '-',
          role: userMap.get(id)?.role ?? null,
          totalOrders: o?._count ?? 0,
          totalRevenue: toNum(o?._sum.totalAmount),
          reviewCount: r?._count ?? 0,
          avgRating: r?._avg.rating ?? 0,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  async getTopServices(month?: string, outletId?: string) {
    const monthRegex = /^\d{4}-\d{2}$/;
    if (month && !monthRegex.test(month)) {
      throw new BadRequestException('Invalid month format. Use YYYY-MM');
    }

    const now = new Date();
    const base = month
      ? new Date(`${month}-01T00:00:00.000Z`)
      : new Date(now.getFullYear(), now.getMonth(), 1);

    const start = new Date(base);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    const where: Record<string, unknown> = {
      order: {
        status: { in: PAID_STATUSES },
        orderDate: { gte: start, lt: end },
        ...(outletId ? { outletId } : {}),
      },
    };

    const items = await this.prisma.orderItem.groupBy({
      by: ['serviceId', 'serviceName'],
      where,
      _sum: { subtotal: true, quantity: true },
      _count: { _all: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 10,
    });

    return items.map((item) => ({
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      totalRevenue: toNum(item._sum.subtotal),
      totalQuantity: item._sum.quantity ?? 0,
      totalOrders: item._count._all,
    }));
  }

  private monthRange(month?: string) {
    const monthRegex = /^\d{4}-\d{2}$/;
    if (month && !monthRegex.test(month)) {
      throw new BadRequestException('Invalid month format. Use YYYY-MM');
    }
    const now = new Date();
    const start = month
      ? new Date(`${month}-01T00:00:00.000Z`)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  async getPromotionLoyalty(month?: string) {
    const { start, end } = this.monthRange(month);
    const dateWhere = { gte: start, lt: end };

    const [
      issued,
      used,
      bonusIssued,
      pointAgg,
      b2bOrders,
      revenueImpact,
      voucherByStatus,
      campaignLogs,
      walletLedgers,
      b2bPricingRuleAgg,
    ] = await Promise.all([
      this.prisma.userVoucher.count({ where: { issuedAt: dateWhere } }),
      this.prisma.voucherRedemption.count({
        where: { redeemedAt: dateWhere, status: 'APPLIED' },
      }),
      this.prisma.walletLedger.aggregate({
        where: {
          createdAt: dateWhere,
          walletType: WalletType.BONUS_BALANCE,
          direction: LedgerDirection.CREDIT,
        },
        _sum: { amount: true },
      }),
      this.prisma.wallet.aggregate({ _sum: { pointBalance: true } }),
      this.prisma.order.aggregate({
        where: { partnerId: { not: null }, status: { in: PAID_STATUSES }, orderDate: dateWhere },
        _count: true,
        _sum: { totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          status: { in: PAID_STATUSES },
          orderDate: dateWhere,
          OR: [
            { discountAmount: { gt: 0 } },
            { promoId: { not: null } },
            { voucherRedemption: { isNot: null } },
          ],
        },
        _sum: { discountAmount: true, totalAmount: true },
      }),
      this.prisma.userVoucher.groupBy({
        by: ['status'],
        where: { issuedAt: dateWhere },
        _count: true,
      }),
      this.prisma.campaignExecutionLog.findMany({
        where: { runAt: dateWhere },
        orderBy: { runAt: 'desc' },
        take: 50,
      }),
      this.prisma.walletLedger.findMany({
        where: { createdAt: dateWhere },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { wallet: { include: { customer: { include: { user: true } }, partner: true } }, order: true },
      }),
      (this.prisma as any).b2BPricingRuleUsage.groupBy({
        by: ['ruleId'],
        where: { createdAt: dateWhere },
        _count: { _all: true },
        _sum: { discountAmount: true },
      }),
    ]);

    const b2bPricingRules =
      b2bPricingRuleAgg.length > 0
        ? await (this.prisma as any).b2BPricingRule.findMany({
            where: { id: { in: b2bPricingRuleAgg.map((item: any) => item.ruleId) } },
            include: { partner: true, outlet: true, service: true },
          })
        : [];
    const b2bRuleMap = new Map<string, any>(
      b2bPricingRules.map((rule: any) => [rule.id, rule]),
    );

    return {
      month: month ?? start.toISOString().slice(0, 7),
      dashboard: {
        totalVoucherIssued: issued,
        totalVoucherUsed: used,
        voucherBurnRate: issued > 0 ? Number(((used / issued) * 100).toFixed(2)) : 0,
        totalBonusBalanceIssued: toNum(bonusIssued._sum.amount),
        totalOutstandingPoint: pointAgg._sum.pointBalance ?? 0,
        b2bTransactionVolume: toNum(b2bOrders._sum.totalAmount),
        b2bTransactionCount: b2bOrders._count,
        promoRevenueImpact: toNum(revenueImpact._sum.discountAmount),
        promoDrivenRevenue: toNum(revenueImpact._sum.totalAmount),
      },
      voucherByStatus: voucherByStatus.map((item) => ({
        status: item.status,
        count: item._count,
      })),
      b2bPricingImpact: b2bPricingRuleAgg.map((item: any) => {
        const rule = b2bRuleMap.get(item.ruleId);
        return {
          ruleId: item.ruleId,
          ruleName: rule?.name ?? '-',
          partnerName: rule?.partner?.companyName ?? null,
          tier: rule?.tier ?? null,
          outletName: rule?.outlet?.name ?? null,
          serviceName: rule?.service?.name ?? null,
          machineType: rule?.machineType ?? null,
          usageCount: item._count._all,
          discountAmount: toNum(item._sum.discountAmount),
        };
      }),
      campaignLogs,
      walletLedgers,
    };
  }
}
