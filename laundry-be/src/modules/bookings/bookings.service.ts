import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { IotService } from "../iot/iot.service";
import { IotMachineService } from "../iot/iot-machine.service";
import { BookingStatus, OrderStatus, PaymentStatus } from "@prisma/client";
import {
  ACTIVE_BOOKING_STATUSES,
  MACHINE_TYPES,
  bookingConfig,
  createBookingInTx,
  isBookingActive,
  lockDevice,
  parseScheduledAt,
  resolveBookableDevice,
  slotStart,
} from "./booking-lifecycle";

const bookingInclude = {
  device: {
    select: { id: true, name: true, deviceCode: true, deviceType: true },
  },
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private prisma: PrismaService,
    private iot: IotService,
    private iotMachine: IotMachineService,
  ) {}

  private async resolveCustomerId(userId: string): Promise<string> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!customer) {
      throw new ForbiddenException(
        "Hanya customer yang dapat membooking mesin",
      );
    }
    return customer.id;
  }

  private genCode(): string {
    return "BK-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  }

  /**
   * API lama `POST /bookings`: menahan mesin (HOLD singkat) TANPA bisa dipakai.
   * Booking baru bisa dipakai setelah terikat order yang PAID — order dibuat
   * lewat `POST /orders` (deviceId + scheduledAt) yang otomatis memakai HOLD ini.
   * Bila `orderId` dikirim, order harus milik customer & belum dibayar.
   */
  async reserve(
    userId: string,
    ref: { deviceId?: string; deviceCode?: string },
    orderId?: string,
    scheduledAtIso?: string,
  ) {
    const customerId = await this.resolveCustomerId(userId);
    const now = new Date();
    const scheduledAt = parseScheduledAt(scheduledAtIso, now);

    if (orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });
      if (!order || order.customerId !== customerId) {
        throw new ForbiddenException("Order tidak ditemukan untuk akun ini");
      }
      if (
        order.status !== OrderStatus.DRAFT &&
        order.status !== OrderStatus.WAITING_PAYMENT
      ) {
        throw new BadRequestException(
          "Order ini tidak bisa dipakai untuk booking baru",
        );
      }
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const device = await resolveBookableDevice(tx, ref);
      return createBookingInTx(tx, {
        customerId,
        deviceId: device.id,
        orderId: orderId ?? null,
        scheduledAt,
        status: BookingStatus.HOLD,
        bookingCode: this.genCode(),
        now,
      });
    });
    return this.prisma.machineBooking.findUnique({
      where: { id: booking.id },
      include: bookingInclude,
    });
  }

  /**
   * Scan QR mesin → validasi server → minta mesin START.
   * Syarat (semua di backend): customer login, mesin dikenali, booking milik
   * customer untuk MESIN INI, booking RESERVED & masih dalam jendela waktu,
   * terikat order milik customer yang PAID dengan pembayaran PAID tercatat.
   * Status booking menjadi IN_USE hanya saat mesin melapor RUNNING (event IoT).
   * Scan ulang/paralel aman: START idempoten per order.
   */
  async verifyByDeviceCode(userId: string, deviceCode: string) {
    const customerId = await this.resolveCustomerId(userId);
    const device = await this.prisma.iotDevice.findUnique({
      where: { deviceCode },
    });
    if (!device) throw new NotFoundException("Mesin tidak dikenali");
    if (!MACHINE_TYPES.includes(device.deviceType)) {
      throw new BadRequestException("Perangkat ini bukan mesin cuci/pengering");
    }

    const cfg = bookingConfig();
    const now = new Date();

    const target = await this.prisma.$transaction(async (tx) => {
      await lockDevice(tx, device.id);
      const mine = await tx.machineBooking.findMany({
        where: {
          deviceId: device.id,
          customerId,
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
        orderBy: { reservedAt: "desc" },
        include: {
          order: { select: { id: true, status: true, customerId: true } },
        },
      });
      const activeMine = mine.filter((b) => isBookingActive(b, now));

      const inUse = activeMine.find((b) => b.status === BookingStatus.IN_USE);
      if (inUse) return { kind: "already" as const, booking: inUse };

      const reserved = activeMine.filter(
        (b) => b.status === BookingStatus.RESERVED,
      );
      if (reserved.length === 0) {
        if (activeMine.some((b) => b.status === BookingStatus.HOLD)) {
          throw new BadRequestException(
            "Selesaikan pembayaran dulu sebelum memakai mesin.",
          );
        }
        const others = await tx.machineBooking.findMany({
          where: {
            deviceId: device.id,
            customerId: { not: customerId },
            status: { in: ACTIVE_BOOKING_STATUSES },
          },
        });
        if (
          others.some(
            (b) =>
              isBookingActive(b, now) &&
              (b.status === BookingStatus.IN_USE ||
                Math.abs(slotStart(b).getTime() - now.getTime()) <
                  cfg.slotMinutes * 60_000),
          )
        ) {
          throw new ForbiddenException(
            "Mesin ini sedang dibooking pelanggan lain",
          );
        }
        throw new BadRequestException(
          "Kamu belum memesan mesin ini. Pesan & bayar dulu ya.",
        );
      }

      // Pilih reservasi yang jadwalnya sudah masuk jendela scan.
      const earlyMs = cfg.scanEarlyMinutes * 60_000;
      const due = reserved.find(
        (b) => slotStart(b).getTime() - earlyMs <= now.getTime(),
      );
      if (!due) {
        const next = reserved
          .map((b) => slotStart(b))
          .sort((a, b) => a.getTime() - b.getTime())[0];
        throw new BadRequestException(
          `Belum waktunya. Mesin bisa dipakai mulai ${next.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB.`,
        );
      }
      if (!due.orderId || !due.order) {
        throw new ForbiddenException(
          "Reservasi ini tidak terikat order yang sah. Pesan & bayar dulu.",
        );
      }
      if (due.order.customerId !== customerId) {
        throw new ForbiddenException("Order reservasi ini bukan milikmu");
      }
      if (due.order.status !== OrderStatus.PAID) {
        throw new ForbiddenException(
          "Order belum lunas. Selesaikan pembayaran dulu.",
        );
      }
      const paid = await tx.payment.findFirst({
        where: { orderId: due.orderId, status: PaymentStatus.PAID },
        select: { id: true },
      });
      if (!paid) {
        throw new ForbiddenException("Pembayaran order belum terverifikasi");
      }
      return { kind: "start" as const, booking: due };
    });

    if (target.kind === "already") {
      return {
        verified: true,
        status: BookingStatus.IN_USE,
        booking: target.booking,
        message: "Mesin sudah aktif untukmu.",
      };
    }

    const command = await this.iotMachine.requestMachineStart(
      target.booking.orderId!,
      device.id,
      cfg.maxStartAttempts,
    );
    return {
      verified: true,
      status: target.booking.status,
      booking: await this.prisma.machineBooking.findUnique({
        where: { id: target.booking.id },
        include: bookingInclude,
      }),
      activation: { commandId: command.id, status: command.status },
      message: "Pembayaran terverifikasi. Mesin sedang dinyalakan…",
    };
  }

  async complete(userId: string, id: string) {
    const customerId = await this.resolveCustomerId(userId);
    const booking = await this.prisma.machineBooking.findUnique({
      where: { id },
    });
    if (!booking) throw new NotFoundException("Booking tidak ditemukan");
    if (booking.customerId !== customerId) {
      throw new ForbiddenException("Bukan booking milikmu");
    }
    if (
      booking.status !== BookingStatus.IN_USE &&
      booking.status !== BookingStatus.RESERVED
    ) {
      throw new BadRequestException("Booking tidak aktif");
    }
    const updated = await this.prisma.machineBooking.update({
      where: { id },
      data: { status: BookingStatus.DONE, endedAt: new Date() },
      include: bookingInclude,
    });
    await this.prisma.iotDevice.update({
      where: { id: booking.deviceId },
      data: { status: "AVAILABLE" },
    });
    await this.iot.sendCommand(booking.deviceId, "LOCK", { bookingId: id });
    return updated;
  }

  async cancel(userId: string, id: string) {
    const customerId = await this.resolveCustomerId(userId);
    const booking = await this.prisma.machineBooking.findUnique({
      where: { id },
    });
    if (!booking) throw new NotFoundException("Booking tidak ditemukan");
    if (booking.customerId !== customerId) {
      throw new ForbiddenException("Bukan booking milikmu");
    }
    if (
      booking.status !== BookingStatus.RESERVED &&
      booking.status !== BookingStatus.HOLD
    ) {
      throw new BadRequestException(
        "Hanya reservasi yang belum aktif bisa dibatalkan",
      );
    }
    const order = booking.orderId
      ? await this.prisma.order.findUnique({ where: { id: booking.orderId } })
      : null;
    if (
      order &&
      order.status !== OrderStatus.DRAFT &&
      order.status !== OrderStatus.WAITING_PAYMENT
    ) {
      throw new BadRequestException(
        "Booking ini sudah dibayar dan tidak bisa dibatalkan sendiri. Hubungi admin.",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.machineBooking.update({
        where: { id },
        data: { status: BookingStatus.CANCELLED },
        include: bookingInclude,
      });
      // Order belum dibayar ikut dibatalkan agar tidak ada order DRAFT yatim.
      if (order) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: "Booking dibatalkan pelanggan",
            statusLogs: {
              create: {
                status: OrderStatus.CANCELLED,
                notes: "Booking dibatalkan pelanggan",
              },
            },
          },
        });
      }
      return updated;
    });
  }

  /**
   * Daftar mesin (cuci/pengering) sebuah outlet + status ketersediaannya,
   * beserta ringkasan keramaian. Status diturunkan dari booking aktif & status
   * perangkat: IN_USE > RESERVED > OFFLINE > AVAILABLE.
   */
  async listOutletMachines(outletId: string) {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
    });
    if (!outlet) throw new NotFoundException("Outlet tidak ditemukan");

    const devices = await this.prisma.iotDevice.findMany({
      where: { outletId, deviceType: { in: MACHINE_TYPES } },
      orderBy: { deviceCode: "asc" },
    });

    const statusByDevice = await this.activeBookingStatusByDevice(
      devices.map((d) => d.id),
    );

    const machines = devices.map((d) => {
      const status = this.effectiveStatus(d.status, statusByDevice.get(d.id));
      return {
        deviceId: d.id,
        deviceCode: d.deviceCode,
        name: d.name,
        type: d.deviceType,
        status,
        bookable: status === "AVAILABLE",
      };
    });

    return { outletId, occupancy: this.occupancyOf(machines), machines };
  }

  /** Ringkasan keramaian semua outlet aktif (untuk halaman daftar lokasi). */
  async occupancyForAllOutlets() {
    const [outlets, devices] = await Promise.all([
      this.prisma.outlet.findMany({
        where: { isActive: true },
        select: { id: true },
      }),
      this.prisma.iotDevice.findMany({
        where: { deviceType: { in: MACHINE_TYPES } },
        select: { id: true, outletId: true, status: true },
      }),
    ]);

    const statusByDevice = await this.activeBookingStatusByDevice(
      devices.map((d) => d.id),
    );

    return outlets.map((o) => {
      const machines = devices
        .filter((d) => d.outletId === o.id)
        .map((d) => ({
          status: this.effectiveStatus(d.status, statusByDevice.get(d.id)),
        }));
      return { outletId: o.id, ...this.occupancyOf(machines) };
    });
  }

  /** Peta deviceId → status booking aktif (IN_USE diprioritaskan atas RESERVED). */
  private async activeBookingStatusByDevice(deviceIds: string[]) {
    const map = new Map<string, BookingStatus>();
    if (deviceIds.length === 0) return map;
    const now = new Date();
    const active = await this.prisma.machineBooking.findMany({
      where: {
        deviceId: { in: deviceIds },
        OR: [
          { status: BookingStatus.IN_USE },
          {
            status: { in: [BookingStatus.RESERVED, BookingStatus.HOLD] },
            expiresAt: { gt: now },
          },
        ],
      },
      select: { deviceId: true, status: true },
    });
    for (const b of active) {
      if (map.get(b.deviceId) === BookingStatus.IN_USE) continue;
      // HOLD (menunggu bayar) ditampilkan sebagai RESERVED ke pelanggan lain.
      map.set(
        b.deviceId,
        b.status === BookingStatus.HOLD ? BookingStatus.RESERVED : b.status,
      );
    }
    return map;
  }

  /**
   * Status efektif sebuah mesin: booking aktif diprioritaskan (IN_USE/RESERVED),
   * lalu fallback ke status fisik perangkat (OFFLINE/IN_USE), sisanya AVAILABLE.
   */
  private effectiveStatus(deviceStatus: string, bs?: BookingStatus): string {
    // Booking aktif (query sudah mengecualikan yang expired) = sumber kebenaran
    // untuk RESERVED/IN_USE-via-reservasi.
    if (bs === BookingStatus.IN_USE) return "IN_USE";
    if (bs === BookingStatus.RESERVED) return "RESERVED";
    // Status fisik perangkat: OFFLINE (mati) atau IN_USE (mesin benar2 berjalan).
    // 'RESERVED' sengaja TIDAK dibaca dari device agar flag lama tak nyangkut.
    if (deviceStatus === "OFFLINE") return "OFFLINE";
    if (deviceStatus === "IN_USE") return "IN_USE";
    return "AVAILABLE";
  }

  /** Hitung ringkasan keramaian dari daftar status mesin. */
  private occupancyOf(machines: { status: string }[]) {
    const total = machines.length;
    const offline = machines.filter((m) => m.status === "OFFLINE").length;
    const busy = machines.filter(
      (m) => m.status === "IN_USE" || m.status === "RESERVED",
    ).length;
    const available = machines.filter((m) => m.status === "AVAILABLE").length;
    const operational = total - offline;

    let level: string;
    let remark: string;
    if (operational === 0) {
      level = "none";
      remark = "Mesin tidak tersedia";
    } else if (busy === 0) {
      level = "low";
      remark = "Sepi";
    } else {
      const ratio = busy / operational;
      if (ratio < 0.5) {
        level = "medium";
        remark = "Normal";
      } else if (ratio < 1) {
        level = "high";
        remark = "Ramai";
      } else {
        level = "full";
        remark = "Penuh";
      }
    }
    return { total, available, busy, offline, level, remark };
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
          {
            status: { in: [BookingStatus.RESERVED, BookingStatus.HOLD] },
            expiresAt: { gt: now },
          },
        ],
      },
      orderBy: { reservedAt: "desc" },
      include: bookingInclude,
    });
  }
}
