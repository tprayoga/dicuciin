import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateReviewDto } from './dto/review.dto';
import { ReviewSource, Prisma, OrderStatus } from '@prisma/client';

/** Batch 6 (S8): status order yang boleh diulas pelanggan. */
const REVIEWABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.RECEIVED,
  OrderStatus.WASHING,
  OrderStatus.DRYING,
  OrderStatus.IRONING,
  OrderStatus.PACKING,
  OrderStatus.READY_PICKUP,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.COMPLETED,
];

const reviewInclude = {
  customer: { include: { user: { select: { name: true } } } },
  staff: { select: { id: true, name: true } },
  order: { select: { id: true, orderNumber: true, outletId: true } },
} satisfies Prisma.ReviewInclude;

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  /** Buat ulasan. customerId diturunkan dari user login (bila ada profil customer). */
  async create(dto: CreateReviewDto, userId?: string) {
    const { orderId, rating, comment, source, kioskSessionId, staffUserId } = dto;

    let customerId: string | undefined;
    if (userId) {
      const customer = await this.prisma.customer.findUnique({
        where: { userId },
        select: { id: true },
      });
      customerId = customer?.id;
    }

    let resolvedStaffId = staffUserId;
    if (orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Order not found');
      if (customerId && order.customerId !== customerId) {
        throw new ForbiddenException('Tidak boleh mengulas order milik orang lain');
      }
      // Batch 6 (S8): pelanggan mengulas layanan yang sudah dibayar/dipakai,
      // bukan order yang belum dibayar atau dibatalkan. (Ulasan kiosk tetap.)
      if (customerId && !REVIEWABLE_STATUSES.includes(order.status)) {
        throw new BadRequestException('Ulasan bisa diberikan setelah order dibayar');
      }
      const existing = await this.prisma.review.findUnique({ where: { orderId } });
      if (existing) throw new ConflictException('Order ini sudah diulas');
      // Tautkan ke staff yang membuat order (kiosk/kasir) bila belum diisi.
      resolvedStaffId = resolvedStaffId ?? order.staffUserId ?? undefined;
    }
    // Fallback: turunkan staff dari sesi kiosk yang aktif saat ulasan dibuat.
    if (!resolvedStaffId && kioskSessionId) {
      const session = await this.prisma.kioskSession.findUnique({
        where: { id: kioskSessionId },
      });
      resolvedStaffId = session?.staffUserId ?? undefined;
    }

    try {
      return await this.prisma.review.create({
        data: {
          orderId,
          customerId,
          staffUserId: resolvedStaffId ?? null,
          kioskSessionId: kioskSessionId ?? null,
          rating,
          comment: comment ?? null,
          source: source ?? ReviewSource.APP,
        },
        include: reviewInclude,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Order ini sudah diulas');
      }
      throw err;
    }
  }

  async findAll(params: {
    rating?: number;
    isFocused?: boolean;
    source?: ReviewSource;
    page?: number;
    limit?: number;
  }) {
    const { rating, isFocused, source, page = 1, limit = 20 } = params;
    const where: Prisma.ReviewWhereInput = {
      ...(rating ? { rating } : {}),
      ...(isFocused !== undefined ? { isFocused } : {}),
      ...(source ? { source } : {}),
    };
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: reviewInclude,
      }),
      this.prisma.review.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** Ulasan pilihan (dikurasi admin) untuk ditampilkan di app. */
  findFocused(limit = 10) {
    return this.prisma.review.findMany({
      where: { isFocused: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: reviewInclude,
    });
  }

  findByOrder(orderId: string) {
    return this.prisma.review.findUnique({
      where: { orderId },
      include: reviewInclude,
    });
  }

  /** Ringkasan: rata-rata rating, total, distribusi 1..5. */
  async stats() {
    const [agg, grouped] = await Promise.all([
      this.prisma.review.aggregate({ _avg: { rating: true }, _count: true }),
      this.prisma.review.groupBy({ by: ['rating'], _count: true }),
    ]);
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of grouped) distribution[g.rating] = g._count;
    return {
      average: agg._avg.rating ?? 0,
      total: agg._count,
      distribution,
    };
  }

  /** Moderasi: hapus ulasan (mis. spam/kasar). Order & pelanggan tidak terpengaruh. */
  async remove(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.review.delete({ where: { id } });
    return { message: 'Ulasan dihapus' };
  }

  async setFocus(id: string, isFocused: boolean) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    return this.prisma.review.update({
      where: { id },
      data: { isFocused },
      include: reviewInclude,
    });
  }
}
