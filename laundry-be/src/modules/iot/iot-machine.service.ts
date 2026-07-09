import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { BookingStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IncomingDeviceEvent, IotMqttService } from './iot-mqtt.service';

/** Lifecycle status command mesin (disimpan di IotCommand.status). */
export const IotCommandStatus = {
  PENDING: 'PENDING',
  PUBLISHED: 'PUBLISHED',
  ACKED: 'ACKED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
} as const;

export type IotCommandStatusValue =
  (typeof IotCommandStatus)[keyof typeof IotCommandStatus];

const ACTIVE_STATUSES: string[] = [
  IotCommandStatus.PENDING,
  IotCommandStatus.PUBLISHED,
  IotCommandStatus.ACKED,
  IotCommandStatus.RUNNING,
];

const TERMINAL_STATUSES: string[] = [
  IotCommandStatus.COMPLETED,
  IotCommandStatus.FAILED,
  IotCommandStatus.TIMEOUT,
  IotCommandStatus.CANCELLED,
];

export const START_MACHINE = 'START_MACHINE';

/** Map eventType device → status command tujuan. */
function mapEventToStatus(eventType: string): IotCommandStatusValue | null {
  switch (eventType.toUpperCase()) {
    case 'ACK':
    case 'ACKED':
      return IotCommandStatus.ACKED;
    case 'RUNNING':
    case 'STARTED':
    case 'START':
      return IotCommandStatus.RUNNING;
    case 'COMPLETED':
    case 'DONE':
    case 'FINISHED':
      return IotCommandStatus.COMPLETED;
    case 'ERROR':
    case 'FAILED':
    case 'FAULT':
      return IotCommandStatus.FAILED;
    default:
      return null; // HEARTBEAT/lainnya: tidak mengubah command
  }
}

/**
 * Lifecycle command mesin (START_MACHINE) + ingest event device. Aman & idempoten:
 * - Mesin hanya start bila order PAID (keputusan keamanan).
 * - Satu order tidak bisa punya dua command START aktif (idempotencyKey unik).
 * - Event dari device tak dikenal ditolak (untrusted), tidak menyentuh order finansial.
 *
 * MQTT publish best-effort (DB tetap source of truth bila broker mati).
 */
@Injectable()
export class IotMachineService implements OnModuleInit {
  private readonly logger = new Logger(IotMachineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mqtt: IotMqttService,
  ) {}

  onModuleInit() {
    // Wire ingest event MQTT → handler (hindari circular DI di constructor).
    this.mqtt.eventHandler = (event) => this.handleDeviceEvent(event);
  }

  /** Resolusi device dari deviceId/deviceCode, atau dari booking order. */
  private async resolveDevice(input: {
    orderId: string;
    deviceId?: string;
    deviceCode?: string;
  }) {
    if (input.deviceId) {
      return this.prisma.iotDevice.findUnique({ where: { id: input.deviceId } });
    }
    if (input.deviceCode) {
      return this.prisma.iotDevice.findUnique({
        where: { deviceCode: input.deviceCode },
      });
    }
    // Binding utama: MachineBooking.orderId (alur booking mobile).
    const booking = await this.prisma.machineBooking.findUnique({
      where: { orderId: input.orderId },
      include: { device: true },
    });
    return booking?.device ?? null;
  }

  /**
   * Buat command START_MACHINE untuk order PAID. Idempoten via
   * `idempotencyKey = start-machine-<orderId>`: bila sudah ada, kembalikan yang ada
   * (tidak double-start). Tidak otomatis publish kecuali `opts.publish`.
   */
  async createStartMachineCommand(
    input: { orderId: string; deviceId?: string; deviceCode?: string },
    opts: { publish?: boolean } = {},
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
    });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('Mesin hanya bisa start untuk order PAID');
    }

    const idempotencyKey = `start-machine-${input.orderId}`;
    const existing = await this.prisma.iotCommand.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      // Sudah pernah dibuat (aktif maupun terminal) → idempoten, kembalikan apa adanya.
      if (opts.publish && existing.status === IotCommandStatus.PENDING) {
        return this.markPublished(existing.id);
      }
      return existing;
    }

    const device = await this.resolveDevice(input);
    if (!device) {
      throw new NotFoundException('Device mesin untuk order ini tidak ditemukan');
    }

    const command = await this.prisma.iotCommand.create({
      data: {
        deviceId: device.id,
        orderId: order.id,
        command: START_MACHINE,
        status: IotCommandStatus.PENDING,
        idempotencyKey,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          deviceCode: device.deviceCode,
          action: START_MACHINE,
          requestedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    return opts.publish ? this.markPublished(command.id) : command;
  }

  /** Tandai command terpublish + publish ke broker (best-effort). PENDING → PUBLISHED. */
  async markPublished(commandId: string) {
    const command = await this.prisma.iotCommand.findUnique({
      where: { id: commandId },
      include: { device: true },
    });
    if (!command) throw new NotFoundException('Command tidak ditemukan');
    if (command.status !== IotCommandStatus.PENDING) return command;

    this.mqtt.publishCommand(command.device.deviceCode, command.command, {
      commandId: command.id,
      ...((command.payload as Record<string, unknown>) ?? {}),
    });

    return this.prisma.iotCommand.update({
      where: { id: command.id },
      data: { status: IotCommandStatus.PUBLISHED, sentAt: new Date() },
    });
  }

  /**
   * Dipanggil hook payment PAID. Aman: TIDAK pernah melempar — bila order tak punya
   * binding mesin, kembalikan null + log (payment/order tetap sukses).
   */
  async activateMachineForOrder(
    orderId: string,
    ref: { deviceId?: string; deviceCode?: string } = {},
  ) {
    try {
      return await this.createStartMachineCommand(
        { orderId, ...ref },
        { publish: true },
      );
    } catch (err) {
      this.logger.warn(
        `Aktivasi mesin untuk order ${orderId} dilewati: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Ingest event device. Device tak dikenal ditolak (untrusted). Mentransisikan
   * status command bila relevan, mencatat IotEvent, memperbarui heartbeat & booking.
   */
  async handleDeviceEvent(event: IncomingDeviceEvent) {
    const device = await this.prisma.iotDevice.findUnique({
      where: { deviceCode: event.deviceCode },
    });
    if (!device) {
      this.logger.warn(
        `Event dari device tak dikenal ditolak: ${event.deviceCode} (${event.eventType})`,
      );
      return { trusted: false as const };
    }

    await this.prisma.iotEvent.create({
      data: {
        deviceId: device.id,
        eventType: event.eventType,
        payload: (event.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
    await this.prisma.iotDevice.update({
      where: { id: device.id },
      data: { status: 'ONLINE', lastHeartbeatAt: new Date() },
    });

    const targetStatus = mapEventToStatus(event.eventType);
    if (!targetStatus) {
      return { trusted: true as const, eventType: event.eventType };
    }

    // Command tujuan: by commandId atau command START aktif terbaru device ini.
    const command = event.commandId
      ? await this.prisma.iotCommand.findUnique({ where: { id: event.commandId } })
      : await this.prisma.iotCommand.findFirst({
          where: { deviceId: device.id, status: { in: ACTIVE_STATUSES } },
          orderBy: { createdAt: 'desc' },
        });

    if (!command || TERMINAL_STATUSES.includes(command.status)) {
      return { trusted: true as const, eventType: event.eventType, commandUpdated: false };
    }

    await this.prisma.iotCommand.update({
      where: { id: command.id },
      data: {
        status: targetStatus,
        response: (event.payload ?? {}) as Prisma.InputJsonValue,
        ...(targetStatus === IotCommandStatus.COMPLETED
          ? { executedAt: new Date() }
          : {}),
      },
    });

    // Sinkronkan MachineBooking (bila order alur booking) — operasional, bukan finansial.
    if (command.orderId) {
      if (targetStatus === IotCommandStatus.RUNNING) {
        await this.prisma.machineBooking.updateMany({
          where: { orderId: command.orderId, status: { not: BookingStatus.DONE } },
          data: { status: BookingStatus.IN_USE, startedAt: new Date() },
        });
      } else if (targetStatus === IotCommandStatus.COMPLETED) {
        await this.prisma.machineBooking.updateMany({
          where: { orderId: command.orderId },
          data: { status: BookingStatus.DONE, endedAt: new Date() },
        });
      }
    }

    return {
      trusted: true as const,
      eventType: event.eventType,
      commandId: command.id,
      status: targetStatus,
      commandUpdated: true,
    };
  }

  /** Status mesin untuk sebuah order (read-only, untuk kiosk/admin). */
  async getMachineStatusForOrder(orderId: string) {
    const command = await this.prisma.iotCommand.findFirst({
      where: { orderId, command: START_MACHINE },
      include: { device: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!command) {
      return {
        orderId,
        bound: false,
        commandStatus: null,
        deviceCode: null,
        lastEvent: null,
        updatedAt: null,
      };
    }
    const lastEvent = await this.prisma.iotEvent.findFirst({
      where: { deviceId: command.deviceId },
      orderBy: { createdAt: 'desc' },
      select: { eventType: true, createdAt: true },
    });
    return {
      orderId,
      bound: true,
      commandStatus: command.status,
      deviceCode: command.device.deviceCode,
      lastEvent,
      updatedAt: command.updatedAt,
    };
  }
}
