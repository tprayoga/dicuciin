import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { BookingStatus, DeviceType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateIotDeviceDto, UpdateIotDeviceDto } from './dto/iot.dto';
import { MACHINE_TYPES } from '../bookings/booking-lifecycle';
import { activeBookingStatusByDevice, effectiveMachineStatus } from '../bookings/machine-availability';

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
    await this.assertServiceFitsMachine(createIotDeviceDto.deviceType, createIotDeviceDto.serviceId);

    return this.prisma.iotDevice.create({
      data: createIotDeviceDto,
      include: { outlet: true, kiosk: true, service: { select: { id: true, name: true, machineType: true } } },
    });
  }

  async updateDevice(id: string, updateIotDeviceDto: UpdateIotDeviceDto) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    await this.assertServiceFitsMachine(device.deviceType, updateIotDeviceDto.serviceId);

    return this.prisma.iotDevice.update({
      where: { id },
      data: updateIotDeviceDto,
      include: { outlet: true, kiosk: true, service: { select: { id: true, name: true, machineType: true } } },
    });
  }

  /**
   * Batch 6 (S3): layanan mesin harus ada, aktif, dan cocok tipe mesin
   * (pengering ↔ layanan DRYER; mesin cuci ↔ WASHER/WASHER_DRYER).
   */
  private async assertServiceFitsMachine(deviceType: DeviceType, serviceId?: string | null) {
    if (!serviceId) return;
    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!service || !service.isActive) throw new NotFoundException('Layanan tidak ditemukan / tidak aktif');
    const mt = (service.machineType ?? '').toUpperCase();
    const ok =
      deviceType === DeviceType.DRYER_MACHINE
        ? mt === 'DRYER'
        : deviceType === DeviceType.WASHING_MACHINE
          ? mt === 'WASHER' || mt === 'WASHER_DRYER'
          : false;
    if (!ok) {
      throw new BadRequestException(
        `Layanan "${service.name}" (${service.machineType ?? '-'}) tidak cocok untuk perangkat ${deviceType}`,
      );
    }
  }

  async removeDevice(id: string) {
    const device = await this.prisma.iotDevice.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');

    // Booking pelanggan ikut terhapus bila mesin dihapus (cascade) — padahal order
    // sudah dibayar. Tolak selama masih ada booking yang berjalan.
    const activeBookings = await this.prisma.machineBooking.count({
      where: {
        deviceId: id,
        status: { in: [BookingStatus.HOLD, BookingStatus.RESERVED, BookingStatus.IN_USE] },
      },
    });
    if (activeBookings > 0) {
      throw new ConflictException(
        `Mesin tidak bisa dihapus karena masih punya ${activeBookings} booking aktif. Ubah kondisinya menjadi Maintenance agar tidak bisa dipesan, lalu hapus setelah booking selesai.`,
      );
    }

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
        include: { outlet: true, kiosk: true, service: { select: { id: true, name: true, machineType: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.iotDevice.count({ where }),
    ]);

    // Status yang sama dengan yang dilihat pelanggan di aplikasi (lihat machine-availability).
    const machineIds = devices.filter((d) => MACHINE_TYPES.includes(d.deviceType)).map((d) => d.id);
    const bookingByDevice = await activeBookingStatusByDevice(this.prisma, machineIds);
    const data = devices.map((d) => ({
      ...d,
      availability: MACHINE_TYPES.includes(d.deviceType)
        ? effectiveMachineStatus(d, bookingByDevice.get(d.id))
        : null,
    }));

    return {
      data,
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
