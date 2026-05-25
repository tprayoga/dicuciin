import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class IotService {
  constructor(private prisma: PrismaService) {}

  async findAllDevices(outletId?: string) {
    const where = outletId ? { outletId } : {};
    return this.prisma.iotDevice.findMany({
      where,
      include: {
        outlet: true,
        kiosk: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneDevice(id: string) {
    const device = await this.prisma.iotDevice.findUnique({
      where: { id },
      include: {
        outlet: true,
        kiosk: true,
        commands: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        events: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }

  async updateHeartbeat(id: string) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return this.prisma.iotDevice.update({
      where: { id },
      data: {
        status: 'ONLINE',
        lastHeartbeatAt: new Date(),
      },
    });
  }

  async sendCommand(deviceId: string, command: string, payload?: any) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const iotCommand = await this.prisma.iotCommand.create({
      data: {
        deviceId,
        command,
        payload,
        status: 'PENDING',
      },
    });

    return iotCommand;
  }

  async getDeviceEvents(deviceId: string, page: number = 1, limit: number = 10) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      this.prisma.iotEvent.findMany({
        where: { deviceId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.iotEvent.count({ where: { deviceId } }),
    ]);

    return {
      data: events,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
