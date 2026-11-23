import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateOutletDto, UpdateOutletDto } from './dto/outlet.dto';
import { ensurePricesForOutlet } from '../services/service-price-sync';

@Injectable()
export class OutletsService {
  constructor(private prisma: PrismaService) {}

  async create(createOutletDto: CreateOutletDto) {
    const existing = await this.prisma.outlet.findUnique({
      where: { code: createOutletDto.code },
    });

    if (existing) {
      throw new ConflictException('Outlet code already exists');
    }

    // Outlet baru langsung punya harga untuk semua layanan aktif (= basePrice).
    return this.prisma.$transaction(async (tx) => {
      const outlet = await tx.outlet.create({ data: createOutletDto });
      await ensurePricesForOutlet(tx, outlet.id);
      return outlet;
    });
  }

  /**
   * @param activeOnly true untuk pelanggan: outlet nonaktif tidak ditawarkan di aplikasi.
   * Admin tetap melihat semua outlet beserta jumlah staf aktif & mesin.
   */
  async findAll(page: number = 1, limit: number = 10, activeOnly = false) {
    const skip = (page - 1) * limit;
    const where = activeOnly ? { isActive: true } : {};

    const [outlets, total] = await Promise.all([
      this.prisma.outlet.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              iotDevices: true,
              outletUsers: { where: { user: { isActive: true } } },
            },
          },
        },
      }),
      this.prisma.outlet.count({ where }),
    ]);

    return {
      data: outlets,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id },
      include: {
        servicePrices: {
          include: {
            service: true,
          },
        },
        kiosks: true,
        iotDevices: true,
      },
    });

    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }

    return outlet;
  }

  async update(id: string, updateOutletDto: UpdateOutletDto) {
    const outlet = await this.prisma.outlet.findUnique({ where: { id } });
    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }

    return this.prisma.outlet.update({
      where: { id },
      data: updateOutletDto,
    });
  }

  async remove(id: string) {
    const outlet = await this.prisma.outlet.findUnique({ where: { id } });
    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }

    // Outlet yang sudah bertransaksi tidak boleh dihapus: riwayat order, laporan
    // keuangan & booking pelanggan bergantung padanya. Nonaktifkan saja.
    const orderCount = await this.prisma.order.count({ where: { outletId: id } });
    if (orderCount > 0) {
      throw new ConflictException(
        `Outlet tidak bisa dihapus karena sudah punya ${orderCount} transaksi. Nonaktifkan outlet sebagai gantinya.`,
      );
    }

    await this.prisma.outlet.delete({ where: { id } });

    return { message: 'Outlet deleted successfully' };
  }
}
