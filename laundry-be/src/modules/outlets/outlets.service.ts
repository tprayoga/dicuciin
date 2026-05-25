import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateOutletDto, UpdateOutletDto } from './dto/outlet.dto';

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

    return this.prisma.outlet.create({
      data: createOutletDto,
    });
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [outlets, total] = await Promise.all([
      this.prisma.outlet.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.outlet.count(),
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

    await this.prisma.outlet.delete({ where: { id } });

    return { message: 'Outlet deleted successfully' };
  }
}
