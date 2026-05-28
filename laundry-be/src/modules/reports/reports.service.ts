import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

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
      totalRevenue: item._sum.subtotal ?? 0,
      totalQuantity: item._sum.quantity ?? 0,
      totalOrders: item._count._all,
    }));
  }
}
