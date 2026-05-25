import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateIotDeviceDto, UpdateIotDeviceDto } from './dto/iot.dto';

@Injectable()
export class IotService {
  constructor(private prisma: PrismaService) {}

  async createDevice(createIotDeviceDto: CreateIotDeviceDto) {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: createIotDeviceDto.outletId },
    });
    if (!outlet) throw new NotFoundException('Outlet not found');

    const existing = await this.prisma.iotDevice.findUnique({
      where: { deviceCode: createIotDeviceDto.deviceCode },
    });
    if (existing) throw new ConflictException('Device code already exists');

    return this.prisma.iotDevice.create({
      data: createIotDeviceDto,
      include: { outlet: true, kiosk: true },
    });
  }

  async updateDevice(id: string, updateIotDeviceDto: UpdateIotDeviceDto) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');

    return this.prisma.iotDevice.update({
      where: { id },
      data: updateIotDeviceDto,
      include: { outlet: true, kiosk: true },
    });
  }

  async removeDevice(id: string) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');

    await this.prisma.iotDevice.delete({ where: { id } });
    return { message: 'Device deleted successfully' };
  }

  async findAllDevices(page: number = 1, limit: number = 10, outletId?: string) {
    const skip = (page - 1) * limit;
    const where = outletId ? { outletId } : {};

    const [devices, total] = await Promise.all([
      this.prisma.iotDevice.findMany({
        where,
        skip,
        take: limit,
        include: { outlet: true, kiosk: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.iotDevice.count({ where }),
    ]);

    return {
      data: devices,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneDevice(id: string) {
    const device = await this.prisma.iotDevice.findUnique({
      where: { id },
      include: {
        outlet: true,
        kiosk: true,
        commands: { take: 10, orderBy: { createdAt: 'desc' } },
        events: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async updateHeartbeat(id: string) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');

    return this.prisma.iotDevice.update({
      where: { id },
      data: { status: 'ONLINE', lastHeartbeatAt: new Date() },
    });
  }

  async sendCommand(deviceId: string, command: string, payload?: any) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');

    return this.prisma.iotCommand.create({
      data: { deviceId, command, payload, status: 'PENDING' },
    });
  }

  async getDeviceEvents(deviceId: string, page: number = 1, limit: number = 10) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');

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
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
