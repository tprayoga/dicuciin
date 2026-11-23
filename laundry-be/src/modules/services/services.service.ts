import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateServiceDto, CreateServicePriceDto, UpdateServiceDto } from './dto/service.dto';
import { ensurePricesForService, syncBasePriceChange } from './service-price-sync';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async createService(createServiceDto: CreateServiceDto) {
    // Layanan baru langsung bisa dipesan di semua outlet (harga = basePrice).
    return this.prisma.$transaction(async (tx) => {
      const service = await tx.service.create({ data: createServiceDto });
      await ensurePricesForService(tx, service);
      return service;
    });
  }

  async findAllServices(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [services, total] = await Promise.all([
      this.prisma.service.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.service.count(),
    ]);

    return {
      data: services,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateService(id: string, updateServiceDto: UpdateServiceDto) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Service not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.service.update({ where: { id }, data: updateServiceDto });
      if (updateServiceDto.basePrice !== undefined) {
        await syncBasePriceChange(tx, id, service.basePrice, updated.basePrice);
      }
      return updated;
    });
  }

  /**
   * Hapus permanen hanya untuk layanan yang belum pernah dipakai. Layanan yang sudah
   * ada di order (riwayat & laporan) atau masih dipasang di mesin/aturan → 409, nonaktifkan saja.
   */
  async removeService(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException('Service not found');
    const [orders, devices, happyHours, b2bRules] = await Promise.all([
      this.prisma.orderItem.count({ where: { serviceId: id } }),
      this.prisma.iotDevice.count({ where: { serviceId: id } }),
      this.prisma.happyHourRule.count({ where: { serviceId: id } }),
      this.prisma.b2BPricingRule.count({ where: { serviceId: id } }),
    ]);
    if (orders > 0) {
      throw new ConflictException(
        `Layanan tidak bisa dihapus karena sudah dipakai di ${orders} transaksi. Nonaktifkan layanan sebagai gantinya.`,
      );
    }
    const inUse = [
      devices && `${devices} mesin`,
      happyHours && `${happyHours} aturan Happy Hour`,
      b2bRules && `${b2bRules} harga B2B`,
    ].filter(Boolean);
    if (inUse.length) {
      throw new ConflictException(
        `Layanan masih dipakai oleh ${inUse.join(', ')}. Ganti atau hapus pemakaian itu dulu, atau nonaktifkan layanan.`,
      );
    }
    // Harga per-outlet ikut terhapus (cascade).
    await this.prisma.service.delete({ where: { id } });
    return { message: 'Layanan dihapus' };
  }

  async createServicePrice(createServicePriceDto: CreateServicePriceDto) {
    const service = await this.prisma.service.findUnique({
      where: { id: createServicePriceDto.serviceId },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const outlet = await this.prisma.outlet.findUnique({
      where: { id: createServicePriceDto.outletId },
    });
    if (!outlet) {
      throw new NotFoundException('Outlet not found');
    }

    const existing = await this.prisma.servicePrice.findUnique({
      where: {
        serviceId_outletId: {
          serviceId: createServicePriceDto.serviceId,
          outletId: createServicePriceDto.outletId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Service price already exists for this outlet');
    }

    return this.prisma.servicePrice.create({
      data: createServicePriceDto,
      include: {
        service: true,
        outlet: true,
      },
    });
  }

  /** Daftar harga untuk aplikasi: hanya layanan & harga yang aktif (layanan nonaktif tidak ditawarkan). */
  async findAllServicePrices(outletId?: string) {
    const where = {
      ...(outletId ? { outletId } : {}),
      isActive: true,
      service: { isActive: true },
    };

    return this.prisma.servicePrice.findMany({
      where,
      include: {
        service: true,
        outlet: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
