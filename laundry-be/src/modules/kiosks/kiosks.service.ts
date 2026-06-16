import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateKioskDto, UpdateKioskDto } from './dto/kiosk.dto';
import { OrdersService } from '../orders/orders.service';
import { CreateOrderDto } from '../orders/dto/order.dto';
import { BookingsService } from '../bookings/bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateGatewayPaymentDto } from '../payments/dto/payment.dto';
import * as crypto from 'crypto';

@Injectable()
export class KiosksService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private bookingsService: BookingsService,
    private paymentsService: PaymentsService,
    private config: ConfigService,
  ) {}

  async create(createKioskDto: CreateKioskDto) {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: createKioskDto.outletId },
    });
    if (!outlet) throw new NotFoundException('Outlet not found');

    const existing = await this.prisma.kiosk.findUnique({
      where: { kioskCode: createKioskDto.kioskCode },
    });
    if (existing) throw new ConflictException('Kiosk code already exists');

    const kiosk = await this.prisma.kiosk.create({
      data: createKioskDto,
      include: { outlet: true },
    });
    return this.deviceView(kiosk);
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
      data: kiosks.map((kiosk) => this.deviceView(kiosk)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAssigned(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        outletUsers: {
          select: {
            outlet: {
              select: {
                id: true,
                name: true,
                code: true,
                kiosks: {
                  where: { status: 'ACTIVE' },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Staff not found');
    if (user.outletUsers.length === 0) {
      throw new BadRequestException('Staff belum terhubung ke outlet');
    }
    if (user.outletUsers.length > 1) {
      throw new BadRequestException(
        'Staff harus terhubung tepat ke satu outlet untuk menggunakan kiosk',
      );
    }

    const outlet = user.outletUsers[0].outlet;
    const { kiosks, ...outletData } = outlet;
    return {
      outlet: outletData,
      kiosks: kiosks.map((kiosk) => ({ ...kiosk, outlet: outletData })),
    };
  }

  async findOne(id: string) {
    const kiosk = await this.prisma.kiosk.findUnique({
      where: { id },
      include: { outlet: true, devices: true },
    });
    if (!kiosk) throw new NotFoundException('Kiosk not found');
    return this.deviceView(kiosk);
  }

  async update(id: string, updateKioskDto: UpdateKioskDto) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id } });
    if (!kiosk) throw new NotFoundException('Kiosk not found');

    const { scheduleDays, ...data } = updateKioskDto;
    const updated = await this.prisma.kiosk.update({
      where: { id },
      data: {
        ...data,
        ...(scheduleDays ? { scheduleDays: scheduleDays.join(',') } : {}),
      },
      include: { outlet: true },
    });
    return this.deviceView(updated);
  }

  async remove(id: string) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id } });
    if (!kiosk) throw new NotFoundException('Kiosk not found');

    await this.prisma.kiosk.delete({ where: { id } });
    return { message: 'Kiosk deleted successfully' };
  }

  async startSession(kioskId: string, customerId?: string, staffUserId?: string) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id: kioskId } });
    if (!kiosk) throw new NotFoundException('Kiosk not found');
    if (!staffUserId) throw new ForbiddenException('Staff login required');

    const assignment = await this.prisma.outletUser.findUnique({
      where: {
        outletId_userId: {
          outletId: kiosk.outletId,
          userId: staffUserId,
        },
      },
    });
    if (!assignment) {
      throw new ForbiddenException('Kiosk tidak terhubung ke outlet staff');
    }

    await this.prisma.kiosk.update({
      where: { id: kioskId },
      data: { lastHeartbeat: new Date() },
    });

    return this.prisma.kioskSession.create({
      data: { kioskId, customerId, staffUserId },
    });
  }

  async generateEnrollmentCode(id: string) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id } });
    if (!kiosk) throw new NotFoundException('Kiosk not found');

    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.kiosk.update({
      where: { id },
      data: {
        enrollmentCodeHash: this.hash(code),
        enrollmentCodeExpiresAt: expiresAt,
      },
    });
    return { code, expiresAt };
  }

  async revokeEnrollment(id: string) {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id } });
    if (!kiosk) throw new NotFoundException('Kiosk not found');
    await this.prisma.kiosk.update({
      where: { id },
      data: {
        deviceTokenHash: null,
        deviceId: null,
        enrolledAt: null,
        tokenRevokedAt: new Date(),
        enrollmentCodeHash: null,
        enrollmentCodeExpiresAt: null,
      },
    });
    await this.prisma.kioskSession.updateMany({
      where: { kioskId: id, endedAt: null },
      data: { endedAt: new Date() },
    });
    return { message: 'Enrollment kiosk dicabut' };
  }

  async enroll(code: string, deviceId: string) {
    const kiosk = await this.prisma.kiosk.findFirst({
      where: {
        enrollmentCodeHash: this.hash(code),
        enrollmentCodeExpiresAt: { gt: new Date() },
      },
      include: { outlet: true },
    });
    if (!kiosk) {
      throw new UnauthorizedException('Kode enrollment tidak valid atau kedaluwarsa');
    }

    const deviceToken = crypto.randomBytes(32).toString('hex');
    const updated = await this.prisma.kiosk.update({
      where: { id: kiosk.id },
      data: {
        deviceTokenHash: this.hash(deviceToken),
        deviceId,
        enrolledAt: new Date(),
        tokenRevokedAt: null,
        enrollmentCodeHash: null,
        enrollmentCodeExpiresAt: null,
        lastHeartbeat: new Date(),
      },
      include: { outlet: true },
    });
    return {
      deviceToken,
      kiosk: this.deviceView(updated),
      schedule: this.scheduleState(updated),
    };
  }

  async bootstrap(deviceToken: string) {
    const kiosk = await this.authenticateDevice(deviceToken);
    return {
      kiosk: this.deviceView(kiosk),
      schedule: this.scheduleState(kiosk),
    };
  }

  async heartbeat(deviceToken: string) {
    const kiosk = await this.authenticateDevice(deviceToken);
    const updated = await this.prisma.kiosk.update({
      where: { id: kiosk.id },
      data: { lastHeartbeat: new Date() },
      include: { outlet: true },
    });
    return {
      status: 'ONLINE',
      schedule: this.scheduleState(updated),
    };
  }

  async deviceServices(deviceToken: string) {
    const kiosk = await this.authenticateDevice(deviceToken);
    return this.prisma.servicePrice.findMany({
      where: { outletId: kiosk.outletId, isActive: true },
      include: { service: true, outlet: true },
      orderBy: { service: { name: 'asc' } },
    });
  }

  async startDeviceSession(deviceToken: string) {
    const kiosk = await this.authenticateDevice(deviceToken);
    const schedule = this.scheduleState(kiosk);
    if (!schedule.isOpen) {
      throw new ForbiddenException('Kiosk berada di luar jadwal operasional');
    }
    await this.prisma.kioskSession.updateMany({
      where: { kioskId: kiosk.id, endedAt: null },
      data: { endedAt: new Date() },
    });
    return this.prisma.kioskSession.create({
      data: { kioskId: kiosk.id },
    });
  }

  async endDeviceSession(deviceToken: string, sessionId: string) {
    const kiosk = await this.authenticateDevice(deviceToken);
    const session = await this.prisma.kioskSession.findFirst({
      where: { id: sessionId, kioskId: kiosk.id },
    });
    if (!session) throw new NotFoundException('Session not found');
    return this.prisma.kioskSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });
  }

  async createDeviceOrder(deviceToken: string, dto: CreateOrderDto) {
    const kiosk = await this.authenticateDevice(deviceToken);
    const schedule = this.scheduleState(kiosk);
    if (!schedule.isOpen) {
      throw new ForbiddenException('Kiosk berada di luar jadwal operasional');
    }
    return this.ordersService.create({
      ...dto,
      outletId: kiosk.outletId,
      kioskId: kiosk.id,
      staffUserId: undefined,
      sourcePlatform: 'KIOSK',
      notes: dto.notes || `Order dibuat dari ${kiosk.kioskCode}`,
    });
  }

  /** Daftar mesin (cuci/pengering) di outlet kiosk + status ketersediaan. */
  async deviceMachines(deviceToken: string) {
    const kiosk = await this.authenticateDevice(deviceToken);
    return this.bookingsService.listOutletMachines(kiosk.outletId);
  }

  /** Buat tagihan QRIS/VA untuk order kiosk (tamu). Order wajib milik kiosk ini. */
  async createDevicePayment(deviceToken: string, dto: CreateGatewayPaymentDto) {
    const kiosk = await this.authenticateDevice(deviceToken);
    await this.assertOrderOwnedByKiosk(dto.orderId, kiosk.id);
    return this.paymentsService.createKioskGatewayPayment(dto.orderId, dto);
  }

  /** Status pembayaran untuk polling dari kiosk. */
  async devicePaymentStatus(deviceToken: string, paymentNumber: string) {
    await this.authenticateDevice(deviceToken);
    return this.paymentsService.getStatus(paymentNumber);
  }

  /** Dev-only: simulasikan pembayaran kiosk berhasil (mock gateway). */
  async simulateDevicePayment(deviceToken: string, paymentNumber: string) {
    await this.authenticateDevice(deviceToken);
    if (this.config.get<string>('APP_ENV', 'development') === 'production') {
      throw new ForbiddenException('Tidak tersedia di produksi');
    }
    return this.paymentsService.simulatePaid(paymentNumber);
  }

  private async assertOrderOwnedByKiosk(orderId: string, kioskId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { kioskId: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.kioskId !== kioskId) {
      throw new ForbiddenException('Order bukan milik kiosk ini');
    }
  }

  async endSession(sessionId: string) {
    const session = await this.prisma.kioskSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    return this.prisma.kioskSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });
  }

  private async authenticateDevice(deviceToken: string) {
    if (!deviceToken) throw new UnauthorizedException('Device token required');
    const kiosk = await this.prisma.kiosk.findUnique({
      where: { deviceTokenHash: this.hash(deviceToken) },
      include: { outlet: true },
    });
    if (!kiosk || kiosk.tokenRevokedAt || kiosk.status !== 'ACTIVE') {
      throw new UnauthorizedException('Device token tidak valid atau telah dicabut');
    }
    return kiosk;
  }

  private deviceView(kiosk: any) {
    const {
      enrollmentCodeHash,
      enrollmentCodeExpiresAt,
      deviceTokenHash,
      tokenRevokedAt,
      ...safe
    } = kiosk;
    return {
      ...safe,
      scheduleDays: this.parseScheduleDays(kiosk.scheduleDays),
      isEnrolled: !!kiosk.deviceTokenHash,
    };
  }

  private scheduleState(kiosk: any) {
    if (!kiosk.scheduleEnabled) {
      return { isOpen: true, reason: null, nextChangeAt: null };
    }
    if (!kiosk.scheduleOpenTime || !kiosk.scheduleCloseTime) {
      return {
        isOpen: false,
        reason: 'Jadwal kiosk belum lengkap',
        nextChangeAt: null,
      };
    }

    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: kiosk.timezone || 'Asia/Jakarta',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value;
    const dayMap: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    const day = dayMap[value('weekday') || ''] || 0;
    const minutes = Number(value('hour')) * 60 + Number(value('minute'));
    const [openHour, openMinute] = kiosk.scheduleOpenTime.split(':').map(Number);
    const [closeHour, closeMinute] = kiosk.scheduleCloseTime.split(':').map(Number);
    const open = openHour * 60 + openMinute;
    const close = closeHour * 60 + closeMinute;
    const scheduleDays = this.parseScheduleDays(kiosk.scheduleDays);
    let isOpen: boolean;
    if (open <= close) {
      isOpen = scheduleDays.includes(day) && minutes >= open && minutes < close;
    } else if (minutes >= open) {
      isOpen = scheduleDays.includes(day);
    } else {
      const previousDay = day === 1 ? 7 : day - 1;
      isOpen = scheduleDays.includes(previousDay) && minutes < close;
    }
    return {
      isOpen,
      reason: isOpen ? null : 'Kiosk berada di luar jadwal operasional',
      nextChangeAt: null,
    };
  }

  private parseScheduleDays(value: string): number[] {
    return value
      .split(',')
      .map(Number)
      .filter((day) => day >= 1 && day <= 7);
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
