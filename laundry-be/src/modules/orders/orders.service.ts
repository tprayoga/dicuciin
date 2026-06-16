import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateOrderDto, UpdateOrderStatusDto, CancelOrderDto } from './dto/order.dto';
import { OrderStatus, UserRole, Prisma } from '@prisma/client';
import { generateDailySequence } from '../../common/utils/sequence.util';
import { toNum } from '../../common/utils/money.util';
import { PromosService } from '../promos/promos.service';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private promosService: PromosService,
  ) {}

  /**
   * Margin laba bersih default (80% dari revenue).
   * Idealnya ini dikonfigurasi per outlet di masa depan.
   * Untuk saat ini bisa di-override via env PROFIT_MARGIN_PERCENT.
   */
  private readonly PROFIT_MARGIN = parseFloat(
    process.env.PROFIT_MARGIN_PERCENT ?? '80',
  ) / 100;

  private readonly paidOrderStatuses: OrderStatus[] = [
    OrderStatus.PAID,
    OrderStatus.RECEIVED,
    OrderStatus.WASHING,
    OrderStatus.DRYING,
    OrderStatus.IRONING,
    OrderStatus.PACKING,
    OrderStatus.READY_PICKUP,
    OrderStatus.COMPLETED,
  ];

  async create(createOrderDto: CreateOrderDto, createdBy?: string) {
    const { items, outletId, customerId, promoCode, deliveryFee = 0, ...orderData } = createOrderDto;

    const outlet = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }

    if (customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
    }

    const orderNumber = await generateDailySequence(
      this.prisma,
      'ORD',
      'order',
      'orderNumber',
      6,
    );

    // Ambil semua harga layanan dalam satu query (hindari N+1 query di loop).
    const servicePrices = await this.prisma.servicePrice.findMany({
      where: {
        serviceId: { in: items.map((i) => i.serviceId) },
        outletId,
        isActive: true,
      },
      include: { service: true },
    });
    const priceMap = new Map(servicePrices.map((sp) => [sp.serviceId, sp]));

    let subtotal = new Prisma.Decimal(0);
    const orderItems: any[] = [];

    for (const item of items) {
      const servicePrice = priceMap.get(item.serviceId);

      if (!servicePrice) {
        throw new BadRequestException(`Service price not found for service ${item.serviceId}`);
      }

      const itemSubtotal = new Prisma.Decimal(servicePrice.price).mul(item.quantity);
      subtotal = subtotal.plus(itemSubtotal);

      orderItems.push({
        serviceId: item.serviceId,
        serviceName: servicePrice.service.name,
        quantity: item.quantity,
        unit: servicePrice.unit,
        pricePerUnit: servicePrice.price,
        subtotal: itemSubtotal,
        notes: item.notes,
      });
    }

    // Validasi + kalkulasi promo lewat sumber kebenaran TUNGGAL (PromosService).
    // Promo invalid → error jelas (bukan diam-diam tanpa diskon). Pemakaian promo
    // (PromoUsage + usedCount + cashback) BARU dicatat saat order dibayar
    // (commitUsage di jalur pembayaran), bukan di sini.
    const order = await this.prisma.$transaction(async (tx) => {
      let discountAmount = new Prisma.Decimal(0);
      let promoId: string | null = null;

      if (promoCode) {
        const result = await this.promosService.evaluatePromo({
          code: promoCode,
          customerId,
          items: orderItems.map((it) => ({
            serviceId: it.serviceId,
            subtotal: it.subtotal,
          })),
          outletId,
          deliveryFee,
          tx,
        });
        discountAmount = result.discount;
        promoId = result.promo.id;
      }

      const totalAmount = subtotal.minus(discountAmount).plus(deliveryFee);

      return tx.order.create({
        data: {
          orderNumber,
          customerId,
          outletId,
          promoId,
          ...orderData,
          subtotal,
          discountAmount,
          deliveryFee,
          totalAmount,
          status: OrderStatus.DRAFT,
          items: {
            create: orderItems,
          },
          statusLogs: {
            create: {
              status: OrderStatus.DRAFT,
              notes: 'Order created',
              createdBy,
            },
          },
        },
        include: {
          items: true,
          outlet: true,
          customer: true,
        },
      });
    });

    return order;
  }

  async findAll(page: number = 1, limit: number = 10, status?: OrderStatus, outletId?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (status) {
      where.status = status;
    }
    if (outletId) {
      where.outletId = outletId;
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          outlet: true,
          customer: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                  phone: true,
                },
              },
            },
          },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        outlet: true,
        customer: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        customerAddress: true,
        items: true,
        statusLogs: {
          orderBy: { createdAt: 'desc' },
        },
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async getDashboardSummary() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const start30Days = new Date(start);
    start30Days.setDate(start30Days.getDate() - 29);

    const [totalMachines, totalOutlets, totalStaff, todayAggregate, recentOrders, last30DaysOrders] =
      await Promise.all([
        this.prisma.iotDevice.count(),
        this.prisma.outlet.count(),
        this.prisma.user.count({
          where: {
            isActive: true,
            role: {
              in: [
                UserRole.OWNER,
                UserRole.ADMIN_OUTLET,
                UserRole.CASHIER,
                UserRole.OPERATOR,
                UserRole.TECHNICIAN,
              ],
            },
          },
        }),
        this.prisma.order.aggregate({
          where: {
            status: { in: this.paidOrderStatuses },
            orderDate: { gte: start, lt: end },
          },
          _sum: { totalAmount: true },
          _count: { _all: true },
        }),
        this.prisma.order.findMany({
          where: {
            status: { in: this.paidOrderStatuses },
          },
          include: {
            outlet: true,
            items: true,
          },
          orderBy: { orderDate: 'desc' },
          take: 6,
        }),
        this.prisma.order.findMany({
          where: {
            status: { in: this.paidOrderStatuses },
            orderDate: { gte: start30Days, lt: end },
          },
          select: {
            orderDate: true,
            totalAmount: true,
          },
        }),
      ]);

    const formatDateKey = (date: Date): string => {
      const y = date.getFullYear();
      const m = `${date.getMonth() + 1}`.padStart(2, '0');
      const d = `${date.getDate()}`.padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const dailyMap = new Map<string, number>();
    for (const order of last30DaysOrders) {
      const key = formatDateKey(new Date(order.orderDate));
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + toNum(order.totalAmount));
    }

    const dailySeries = [];
    for (let i = 0; i < 30; i += 1) {
      const day = new Date(start30Days);
      day.setDate(start30Days.getDate() + i);
      const key = formatDateKey(day);
      const revenue = dailyMap.get(key) ?? 0;
      dailySeries.push({
        date: key,
        revenue,
        profit: Math.round(revenue * this.PROFIT_MARGIN),
      });
    }

    return {
      totalMachines,
      totalOutlets,
      totalStaff,
      totalRevenueToday: toNum(todayAggregate._sum.totalAmount),
      totalPaidOrdersToday: todayAggregate._count._all,
      recentOrders,
      dailySeries,
    };
  }

  async getFinanceSummary(month?: string, outletId?: string) {
    const now = new Date();
    const monthRegex = /^\d{4}-\d{2}$/;
    if (month && !monthRegex.test(month)) {
      throw new BadRequestException('Invalid month format. Use YYYY-MM');
    }

    const base = month ? new Date(`${month}-01T00:00:00.000Z`) : new Date(now.getFullYear(), now.getMonth(), 1);
    if (Number.isNaN(base.getTime())) {
      throw new BadRequestException('Invalid month value');
    }

    const start = new Date(base);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    const where: any = {
      status: { in: this.paidOrderStatuses },
      orderDate: { gte: start, lt: end },
    };
    if (outletId) where.outletId = outletId;

    const [orders, aggregate] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { orderDate: 'asc' },
        select: {
          id: true,
          orderDate: true,
          totalAmount: true,
          outletId: true,
        },
      }),
      this.prisma.order.aggregate({
        where,
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
    ]);

    const dailyMap = new Map<string, number>();
    for (const order of orders) {
      const date = new Date(order.orderDate);
      const y = date.getFullYear();
      const m = `${date.getMonth() + 1}`.padStart(2, '0');
      const d = `${date.getDate()}`.padStart(2, '0');
      const key = `${y}-${m}-${d}`;
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + toNum(order.totalAmount));
    }

    const dailySeries = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({
        date,
        revenue,
        profit: Math.round(revenue * this.PROFIT_MARGIN),
      }));

    const totalRevenue = toNum(aggregate._sum.totalAmount);
    const operationalCost = Math.round(totalRevenue * (1 - this.PROFIT_MARGIN));
    const estimatedProfit = totalRevenue - operationalCost;

    return {
      month: `${start.getFullYear()}-${`${start.getMonth() + 1}`.padStart(2, '0')}`,
      outletId: outletId ?? null,
      totalRevenue,
      operationalCost,
      estimatedProfit,
      totalPaidOrders: aggregate._count._all,
      dailySeries,
    };
  }

  async updateStatus(id: string, updateOrderStatusDto: UpdateOrderStatusDto, updatedBy?: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const { status, notes } = updateOrderStatusDto;

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        status,
        ...(status === OrderStatus.COMPLETED ? { completedAt: new Date() } : {}),
        statusLogs: {
          create: {
            status,
            notes,
            createdBy: updatedBy,
          },
        },
      },
      include: {
        items: true,
        outlet: true,
      },
    });

    return updatedOrder;
  }

  async cancel(id: string, cancelOrderDto: CancelOrderDto, cancelledBy?: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot cancel this order');
    }

    const cancelledOrder = await this.prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: cancelOrderDto.cancelReason,
        statusLogs: {
          create: {
            status: OrderStatus.CANCELLED,
            notes: cancelOrderDto.cancelReason,
            createdBy: cancelledBy,
          },
        },
      },
      include: {
        items: true,
        outlet: true,
      },
    });

    return cancelledOrder;
  }

  private async generateOrderNumber(): Promise<string> {
    // Deprecated: digantikan oleh generateDailySequence di sequence.util.ts
    // Method ini dipertahankan sementara untuk backward compatibility
    return generateDailySequence(this.prisma, 'ORD', 'order', 'orderNumber', 6);
  }
}
