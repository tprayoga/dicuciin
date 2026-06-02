import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IotService } from '../iot/iot.service';
import { BookingStatus, DeviceType } from '@prisma/client';

const MACHINE_TYPES: DeviceType[] = [
  DeviceType.WASHING_MACHINE,
  DeviceType.DRYER_MACHINE,
];

const RESERVE_TTL_MS = 15 * 60 * 1000; // 15 menit untuk mengaktifkan reservasi

const bookingInclude = {
  device: { select: { id: true, name: true, deviceCode: true, deviceType: true } },
};

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private iot: IotService,
  ) {}

  private async resolveCustomerId(userId: string): Promise<string> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!customer) {
      throw new ForbiddenException('Hanya customer yang dapat membooking mesin');
    }
    return customer.id;
  }

  private genCode(): string {
    return 'BK-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  /** Reservasi mesin: kunci untuk customer ini bila masih tersedia. */
  async reserve(
    userId: string,
    ref: { deviceId?: string; deviceCode?: string },
    orderId?: string,
  ) {
    const customerId = await this.resolveCustomerId(userId);

    if (!ref.deviceId && !ref.deviceCode) {
      throw new BadRequestException('deviceId atau deviceCode wajib diisi');
    }
    const device = ref.deviceId
      ? await this.prisma.iotDevice.findUnique({ where: { id: ref.deviceId } })
      : await this.prisma.iotDevice.findUnique({ where: { deviceCode: ref.deviceCode } });
    if (!device) throw new NotFoundException('Mesin tidak ditemukan');
    const deviceId = device.id;
    if (!MACHINE_TYPES.includes(device.deviceType)) {
      throw new BadRequestException('Perangkat ini bukan mesin cuci/pengering');
    }

    const now = new Date();
    const active = await this.prisma.machineBooking.findFirst({
      where: {
        deviceId,
        OR: [
          { status: BookingStatus.IN_USE },
          { status: BookingStatus.RESERVED, expiresAt: { gt: now } },
        ],
      },
    });
    if (active) throw new ConflictException('Mesin sedang dibooking atau dipakai');

    const booking = await this.prisma.machineBooking.create({
      data: {
        deviceId,
        customerId,
        orderId: orderId ?? null,
        bookingCode: this.genCode(),
        expiresAt: new Date(now.getTime() + RESERVE_TTL_MS),
      },
      include: bookingInclude,
    });
    await this.prisma.iotDevice.update({
      where: { id: deviceId },
      data: { status: 'RESERVED' },
    });
    return booking;
  }

  /**
   * Verifikasi pemakai = pemesan. Customer scan QR mesin (deviceCode); hanya
   * pemesan dengan reservasi aktif yang bisa mengaktifkan & membuka mesin.
   */
  async verifyByDeviceCode(userId: string, deviceCode: string) {
    const customerId = await this.resolveCustomerId(userId);

    const device = await this.prisma.iotDevice.findUnique({ where: { deviceCode } });
    if (!device) throw new NotFoundException('Mesin tidak dikenali');

    const now = new Date();

    // Reservasi milik customer ini yang masih berlaku → aktifkan + buka mesin.
    const mine = await this.prisma.machineBooking.findFirst({
      where: {
        deviceId: device.id,
        customerId,
        status: BookingStatus.RESERVED,
        expiresAt: { gt: now },
      },
      orderBy: { reservedAt: 'desc' },
    });
    if (mine) {
      const booking = await this.prisma.machineBooking.update({
        where: { id: mine.id },
        data: { status: BookingStatus.IN_USE, startedAt: now },
        include: bookingInclude,
      });
      await this.prisma.iotDevice.update({
        where: { id: device.id },
        data: { status: 'IN_USE' },
      });
      await this.iot.sendCommand(device.id, 'UNLOCK', { bookingId: mine.id });
      return {
        verified: true,
        status: BookingStatus.IN_USE,
        booking,
        message: 'Mesin terbuka. Selamat menggunakan!',
      };
    }

    // Scan ulang oleh pemakai yang sama yang sudah aktif.
    const alreadyMine = await this.prisma.machineBooking.findFirst({
      where: { deviceId: device.id, customerId, status: BookingStatus.IN_USE },
      include: bookingInclude,
    });
    if (alreadyMine) {
      return {
        verified: true,
        status: BookingStatus.IN_USE,
        booking: alreadyMine,
        message: 'Mesin sudah aktif untukmu.',
      };
    }

    // Dibooking/dipakai customer lain → tolak (cegah pemakaian oleh non-pemesan).
    const other = await this.prisma.machineBooking.findFirst({
      where: {
        deviceId: device.id,
        customerId: { not: customerId },
        OR: [
          { status: BookingStatus.IN_USE },
          { status: BookingStatus.RESERVED, expiresAt: { gt: now } },
        ],
      },
    });
    if (other) {
      throw new ForbiddenException('Mesin ini sedang dibooking pelanggan lain');
    }

    throw new BadRequestException('Kamu belum membooking mesin ini. Booking dulu ya.');
  }

  async complete(userId: string, id: string) {
    const customerId = await this.resolveCustomerId(userId);
    const booking = await this.prisma.machineBooking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking tidak ditemukan');
    if (booking.customerId !== customerId) {
      throw new ForbiddenException('Bukan booking milikmu');
    }
    if (
      booking.status !== BookingStatus.IN_USE &&
      booking.status !== BookingStatus.RESERVED
    ) {
      throw new BadRequestException('Booking tidak aktif');
    }
    const updated = await this.prisma.machineBooking.update({
      where: { id },
      data: { status: BookingStatus.DONE, endedAt: new Date() },
      include: bookingInclude,
    });
    await this.prisma.iotDevice.update({
      where: { id: booking.deviceId },
      data: { status: 'AVAILABLE' },
    });
    await this.iot.sendCommand(booking.deviceId, 'LOCK', { bookingId: id });
    return updated;
  }

  async cancel(userId: string, id: string) {
    const customerId = await this.resolveCustomerId(userId);
    const booking = await this.prisma.machineBooking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking tidak ditemukan');
    if (booking.customerId !== customerId) {
      throw new ForbiddenException('Bukan booking milikmu');
    }
    if (booking.status !== BookingStatus.RESERVED) {
      throw new BadRequestException('Hanya reservasi yang belum aktif bisa dibatalkan');
    }
    const updated = await this.prisma.machineBooking.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED },
      include: bookingInclude,
    });
    await this.prisma.iotDevice.update({
      where: { id: booking.deviceId },
      data: { status: 'AVAILABLE' },
    });
    return updated;
  }

  /** Booking aktif (RESERVED belum kadaluarsa / IN_USE) milik customer. */
  async getActive(userId: string) {
    const customerId = await this.resolveCustomerId(userId);
    const now = new Date();
    return this.prisma.machineBooking.findMany({
      where: {
        customerId,
        OR: [
          { status: BookingStatus.IN_USE },
          { status: BookingStatus.RESERVED, expiresAt: { gt: now } },
        ],
      },
      orderBy: { reservedAt: 'desc' },
      include: bookingInclude,
    });
  }
}
