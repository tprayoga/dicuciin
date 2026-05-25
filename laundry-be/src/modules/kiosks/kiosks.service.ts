import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class KiosksService {
  constructor(private prisma: PrismaService) {}

  async findAll(outletId?: string) {
    const where = outletId ? { outletId } : {};
    return this.prisma.kiosk.findMany({
      where,
      include: {
        outlet: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const kiosk = await this.prisma.kiosk.findUnique({
      where: { id },
      include: {
        outlet: true,
        devices: true,
      },
    });

    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }

    return kiosk;
  }

  async startSession(kioskId: string, customerId?: string) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id: kioskId } });
    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }

    await this.prisma.kiosk.update({
      where: { id: kioskId },
      data: { lastHeartbeat: new Date() },
    });

    return this.prisma.kioskSession.create({
      data: {
        kioskId,
        customerId,
      },
    });
  }

  async endSession(sessionId: string) {
    const session = await this.prisma.kioskSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.prisma.kioskSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });
  }
}
