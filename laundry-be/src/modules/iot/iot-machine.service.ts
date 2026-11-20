import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { BookingStatus, OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { IncomingDeviceEvent, IotMqttService } from "./iot-mqtt.service";
import { bookingConfig, completeBookingForOrder } from "../bookings/booking-lifecycle";

/** Lifecycle status command mesin (disimpan di IotCommand.status). */
export const IotCommandStatus = {
  PENDING: "PENDING",
  PUBLISHED: "PUBLISHED",
  ACKED: "ACKED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  TIMEOUT: "TIMEOUT",
  CANCELLED: "CANCELLED",
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

export const START_MACHINE = "START_MACHINE";

/** Map eventType device → status command tujuan. */
function mapEventToStatus(eventType: string): IotCommandStatusValue | null {
  switch (eventType.toUpperCase()) {
    case "ACK":
    case "ACKED":
      return IotCommandStatus.ACKED;
    case "RUNNING":
    case "STARTED":
    case "START":
      return IotCommandStatus.RUNNING;
    case "COMPLETED":
    case "DONE":
    case "FINISHED":
      return IotCommandStatus.COMPLETED;
    case "ERROR":
    case "FAILED":
    case "FAULT":
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
    // Order alur booking: mesin WAJIB mesin pada booking order tsb (cegah START
    // mesin lain memakai order PAID milik booking berbeda).
    const bound = await this.prisma.machineBooking.findUnique({
      where: { orderId: input.orderId },
      include: { device: true },
    });
    if (bound) {
      const mismatch =
        (input.deviceId && input.deviceId !== bound.deviceId) ||
        (input.deviceCode && input.deviceCode !== bound.device.deviceCode);
      if (mismatch) {
        throw new BadRequestException(
          "Mesin tidak sesuai dengan booking order ini",
        );
      }
      return bound.device;
    }
    if (input.deviceId) {
      return this.prisma.iotDevice.findUnique({
        where: { id: input.deviceId },
      });
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
    opts: { publish?: boolean; idempotencyKey?: string } = {},
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
    });
    if (!order) throw new NotFoundException("Order tidak ditemukan");
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException("Mesin hanya bisa start untuk order PAID");
    }

    const idempotencyKey =
      opts.idempotencyKey ?? `start-machine-${input.orderId}`;
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
      throw new NotFoundException(
        "Device mesin untuk order ini tidak ditemukan",
      );
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
    if (!command) throw new NotFoundException("Command tidak ditemukan");
    if (command.status !== IotCommandStatus.PENDING) return command;

    // Batch 2: klaim atomik PENDING → PUBLISHED SEBELUM publish. Hanya satu
    // pemanggil (request/scan paralel, worker scheduler) yang menang → perintah
    // tidak pernah terkirim dua kali ke mesin.
    const claimed = await this.prisma.iotCommand.updateMany({
      where: { id: command.id, status: IotCommandStatus.PENDING },
      data: { status: IotCommandStatus.PUBLISHED, sentAt: new Date() },
    });
    if (claimed.count === 1) {
      this.mqtt.publishCommand(command.device.deviceCode, command.command, {
        commandId: command.id,
        ...((command.payload as Record<string, unknown>) ?? {}),
      });
    }
    return this.prisma.iotCommand.findUniqueOrThrow({ where: { id: command.id } });
  }

  /**
   * Minta mesin START untuk order booking yang sudah tervalidasi (scan QR).
   * Idempoten: scan ulang/paralel tidak membuat START ganda. Bila START terakhir
   * FAILED, boleh dicoba ulang sampai `maxAttempts`.
   */
  async requestMachineStart(
    orderId: string,
    deviceId: string,
    maxAttempts = 3,
  ) {
    const previous = await this.prisma.iotCommand.findMany({
      where: { orderId, command: START_MACHINE },
      orderBy: { createdAt: "desc" },
    });
    const latest = previous[0];
    const retryable =
      latest?.status === IotCommandStatus.FAILED ||
      latest?.status === IotCommandStatus.TIMEOUT;
    if (latest && !retryable) {
      // Sudah ada START aktif/selesai → jangan kirim lagi (anti-replay).
      if (latest.status === IotCommandStatus.PENDING)
        return this.markPublished(latest.id);
      return latest;
    }
    if (previous.length >= maxAttempts) {
      throw new BadRequestException(
        "Mesin gagal dinyalakan berulang kali. Hubungi petugas outlet.",
      );
    }
    const attempt = previous.length + 1;
    const idempotencyKey =
      attempt === 1
        ? `start-machine-${orderId}`
        : `start-machine-${orderId}-${attempt}`;
    try {
      return await this.createStartMachineCommand(
        { orderId, deviceId },
        { publish: true, idempotencyKey },
      );
    } catch (err) {
      // Scan paralel: kalah balapan unik idempotencyKey → pakai command pemenang.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const winner = await this.prisma.iotCommand.findUnique({
          where: { idempotencyKey },
        });
        if (winner) return winner;
      }
      throw err;
    }
  }

  /**
   * Nyalakan mesin untuk order KIOSK yang sudah dibayar (Batch 1.5).
   * Dipakai hook PAID dan tombol "coba lagi" di kiosk. Syarat (semua wajib):
   * - order dibuat oleh kiosk (`kioskId` — hanya bisa di-set rute perangkat
   *   kiosk; rute JWT membuangnya) dan, bila `kioskId` diberikan, kiosk yang sama;
   * - order PAID **dan** ada baris Payment PAID (bukan sekadar status order);
   * - booking terikat order, status RESERVED/IN_USE, tanpa jadwal, belum kedaluwarsa.
   * Idempoten lewat `requestMachineStart` (webhook ganda/retry paralel → 1 START).
   */
  async startKioskOrder(orderId: string, kioskId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        kioskId: true,
        status: true,
        machineBooking: true,
        payments: { where: { status: "PAID" }, select: { id: true } },
      },
    });
    if (!order) throw new NotFoundException("Order tidak ditemukan");
    if (!order.kioskId || (kioskId && order.kioskId !== kioskId)) {
      throw new BadRequestException("Order ini bukan order kiosk ini");
    }
    if (order.status !== OrderStatus.PAID || order.payments.length === 0) {
      throw new BadRequestException("Pembayaran order belum terverifikasi");
    }
    const booking = order.machineBooking;
    if (!booking) {
      throw new BadRequestException("Order kiosk ini tidak terikat mesin");
    }
    if (booking.status === BookingStatus.IN_USE) {
      return this.requestMachineStart(orderId, booking.deviceId, 1).catch(
        () => null,
      );
    }
    if (booking.status !== BookingStatus.RESERVED) {
      throw new BadRequestException(
        "Booking mesin order ini tidak aktif. Hubungi petugas outlet.",
      );
    }
    if (booking.scheduledAt) {
      throw new BadRequestException("Order kiosk tidak boleh terjadwal");
    }
    if (booking.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        "Waktu pemakaian mesin sudah lewat. Hubungi petugas outlet.",
      );
    }
    return this.requestMachineStart(
      orderId,
      booking.deviceId,
      bookingConfig().maxStartAttempts,
    );
  }

  /**
   * Dipanggil hook payment PAID. Aman: TIDAK pernah melempar — bila order tak punya
   * binding mesin, kembalikan null + log (payment/order tetap sukses).
   */
  async activateMachineForOrder(
    orderId: string,
    ref: { deviceId?: string; deviceCode?: string } = {},
  ) {
    // K2/T2: order alur booking TIDAK start saat dibayar — mesin baru start saat
    // pelanggan scan QR di mesin (validasi di BookingsService.verifyByDeviceCode).
    // Mencegah booking terjadwal (mis. besok) menyalakan mesin sekarang.
    const booking = await this.prisma.machineBooking.findUnique({
      where: { orderId },
      select: { id: true, order: { select: { kioskId: true } } },
    });
    if (booking?.order?.kioskId) {
      // Batch 1.5: order kiosk — pembeli berdiri di depan mesin & kiosk; tidak
      // ada aplikasi untuk scan QR. Mesin start begitu pembayaran terverifikasi.
      try {
        return await this.startKioskOrder(orderId);
      } catch (err) {
        this.logger.warn(
          `Aktivasi mesin order kiosk ${orderId} gagal: ${(err as Error).message}`,
        );
        return null;
      }
    }
    if (booking) {
      this.logger.log(
        `Order ${orderId} terikat booking ${booking.id}: aktivasi ditunda sampai scan QR`,
      );
      return null;
    }
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
      data: { status: "ONLINE", lastHeartbeatAt: new Date() },
    });

    const targetStatus = mapEventToStatus(event.eventType);
    if (!targetStatus) {
      return { trusted: true as const, eventType: event.eventType };
    }

    // Command tujuan: by commandId atau command START aktif terbaru device ini.
    const command = event.commandId
      ? await this.prisma.iotCommand.findUnique({
          where: { id: event.commandId },
        })
      : await this.prisma.iotCommand.findFirst({
          where: { deviceId: device.id, status: { in: ACTIVE_STATUSES } },
          orderBy: { createdAt: "desc" },
        });

    // Event terlambat (RUNNING/COMPLETED) untuk perintah yang sudah dicap TIMEOUT
    // oleh scheduler tetap diterima — mesin ternyata berjalan.
    const lateEvent =
      command?.status === IotCommandStatus.TIMEOUT &&
      (targetStatus === IotCommandStatus.RUNNING ||
        targetStatus === IotCommandStatus.COMPLETED);
    if (!command || (TERMINAL_STATUSES.includes(command.status) && !lateEvent)) {
      return {
        trusted: true as const,
        eventType: event.eventType,
        commandUpdated: false,
      };
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
          where: {
            orderId: command.orderId,
            status: { in: [BookingStatus.RESERVED, BookingStatus.IN_USE] },
          },
          data: { status: BookingStatus.IN_USE, startedAt: new Date() },
        });
      } else if (targetStatus === IotCommandStatus.COMPLETED) {
        await completeBookingForOrder(this.prisma, command.orderId, "IOT_COMPLETED_EVENT");
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
      orderBy: { createdAt: "desc" },
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
      orderBy: { createdAt: "desc" },
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
