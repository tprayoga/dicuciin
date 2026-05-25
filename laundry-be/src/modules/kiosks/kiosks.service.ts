import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateKioskDto, UpdateKioskDto } from './dto/kiosk.dto';

@Injectable()
export class KiosksService {
  constructor(private prisma: PrismaService) {}

  async create(createKioskDto: CreateKioskDto) {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: createKioskDto.outletId },
    });
    if (!outlet) throw new NotFoundException('Outlet not found');

    const existing = await this.prisma.kiosk.findUnique({
      where: { kioskCode: createKioskDto.kioskCode },
    });
    if (existing) throw new ConflictException('Kiosk code already exists');

    return this.prisma.kiosk.create({
      data: createKioskDto,
      include: { outlet: true },
    });
  }

  async findAll(page: number = 1, limit: number = 10, outletId?: string) {
    const skip = (page - 1) * limit;
    const where = outletId ? { outletId } : {};

    const [kiosks, total] = await Promise.all([
      this.prisma.kiosk.findMany({
        where,
        skip,
        take: limit,
        include: { outlet: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.kiosk.count({ where }),
    ]);

    return {
      data: kiosks,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const kiosk = await this.prisma.kiosk.findUnique({
      where: { id },
      include: { outlet: true, devices: true },
    });
    if (!kiosk) throw new NotFoundException('Kiosk not found');
    return kiosk;
  }

  async update(id: string, updateKioskDto: UpdateKioskDto) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id } });
    if (!kiosk) throw new NotFoundException('Kiosk not found');

    return this.prisma.kiosk.update({
      where: { id },
      data: updateKioskDto,
      include: { outlet: true },
    });
  }

  async remove(id: string) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id } });
    if (!kiosk) throw new NotFoundException('Kiosk not found');

    await this.prisma.kiosk.delete({ where: { id } });
    return { message: 'Kiosk deleted successfully' };
  }

  async startSession(kioskId: string, customerId?: string) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id: kioskId } });
    if (!kiosk) throw new NotFoundException('Kiosk not found');

    await this.prisma.kiosk.update({
      where: { id: kioskId },
      data: { lastHeartbeat: new Date() },
    });

    return this.prisma.kioskSession.create({
      data: { kioskId, customerId },
    });
  }

  async endSession(sessionId: string) {
    const session = await this.prisma.kioskSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    return this.prisma.kioskSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });
  }
}
