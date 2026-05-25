import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateServiceDto, CreateServicePriceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async createService(createServiceDto: CreateServiceDto) {
    return this.prisma.service.create({
      data: createServiceDto,
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

  async findAllServicePrices(outletId?: string) {
    const where = outletId ? { outletId } : {};

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
