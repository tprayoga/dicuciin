/**
 * Batch 2 (T9, S2) — pemeliharaan booking & pembayaran terjadwal.
 *
 * Semua job:
 *  - IDEMPOTEN: setiap perubahan bersyarat pada status saat ini, dibaca ulang
 *    di bawah kunci baris → menjalankan ulang / worker paralel tidak
 *    menggandakan efek.
 *  - AMAN MULTI-WORKER: kunci baris PostgreSQL (`FOR UPDATE`, booking
 *    `SKIP LOCKED`), bukan kunci di memori. Urutan kunci selalu
 *    order → booking (sama dengan webhook/pembatalan) → tanpa deadlock.
 *  - Tidak pernah menghapus data keuangan; kejadian penting dicatat di AuditLog.
 */
import { Injectable, Logger } from "@nestjs/common";
import {
  BookingStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  ReconciliationReason,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PaymentsService } from "../payments/payments.service";
import {
  IotMachineService,
  IotCommandStatus,
  START_MACHINE,
} from "../iot/iot-machine.service";
import { completeBookingForOrder } from "../bookings/booking-lifecycle";
import { recordReconciliationInTx } from "../payments/reconciliation-record";

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function maintenanceConfig() {
  return {
    /** Toleransi setelah expiresAt sebelum HOLD dinyatakan kedaluwarsa. */
    holdGraceSeconds: num(process.env.BOOKING_HOLD_GRACE_SECONDS, 30),
    /** Batas durasi pemakaian bila mesin tidak pernah melapor selesai. */
    runTimeoutMinutes: num(process.env.BOOKING_RUN_TIMEOUT_MINUTES, 90),
    /** Event RUNNING yang lebih baru dari ini = mesin masih jalan (jangan diselesaikan). */
    runningFreshMinutes: num(process.env.BOOKING_RUNNING_FRESH_MINUTES, 10),
    /** START yang tidak di-ACK/RUNNING dalam waktu ini → TIMEOUT (boleh dicoba ulang). */
    startAckTimeoutMinutes: num(process.env.IOT_START_ACK_TIMEOUT_MINUTES, 3),
    /** START yang tertinggal PENDING (belum terpublikasi) lebih lama dari ini dipublikasikan ulang. */
    startPendingRepublishSeconds: num(
      process.env.IOT_START_REPUBLISH_SECONDS,
      60,
    ),
    paymentGraceSeconds: num(process.env.PAYMENT_EXPIRY_GRACE_SECONDS, 60),
    batch: num(process.env.OPS_SCHEDULER_BATCH, 100),
  };
}

const ago = (now: Date, ms: number) => new Date(now.getTime() - ms);

@Injectable()
export class BookingMaintenanceService {
  private readonly logger = new Logger(BookingMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly iot: IotMachineService,
  ) {}

  /** Kunci booking (lewati bila sedang dipegang worker lain). */
  private async lockBooking(tx: Prisma.TransactionClient, bookingId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM machine_bookings WHERE id = ${bookingId} FOR UPDATE SKIP LOCKED`;
    if (rows.length === 0) return null;
    return tx.machineBooking.findUnique({ where: { id: bookingId } });
  }

  private async audit(
    tx: Prisma.TransactionClient | PrismaService,
    action: string,
    entity: string,
    entityId: string,
    changes: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        changes: changes as Prisma.InputJsonValue,
      },
    });
  }

  // ── A. HOLD kedaluwarsa ────────────────────────────────────────────────
  /**
   * HOLD yang lewat batas & belum dibayar → EXPIRED, order belum-bayar →
   * CANCELLED, percobaan pembayaran aktif → EXPIRED (lalu di-expire di
   * gateway). HOLD yang ordernya masih punya tagihan aktif dilewati.
   */
  async expireHolds(now = new Date()) {
    const cfg = maintenanceConfig();
    const cutoff = ago(now, cfg.holdGraceSeconds * 1000);
    const candidates = await this.prisma.machineBooking.findMany({
      where: { status: BookingStatus.HOLD, expiresAt: { lt: cutoff } },
      select: { id: true, orderId: true },
      orderBy: { expiresAt: "asc" },
      take: cfg.batch,
    });
    let expired = 0;
    let skipped = 0;
    const retired: { id: string; paymentNumber: string }[] = [];

    for (const c of candidates) {
      const r = await this.prisma.$transaction(async (tx) => {
        if (c.orderId) {
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${c.orderId} FOR UPDATE`;
        }
        const b = await this.lockBooking(tx, c.id);
        if (!b || b.status !== BookingStatus.HOLD || b.expiresAt >= cutoff)
          return "skip";
        if (b.orderId) {
          const order = await tx.order.findUnique({ where: { id: b.orderId } });
          if (
            order &&
            order.status !== OrderStatus.DRAFT &&
            order.status !== OrderStatus.WAITING_PAYMENT
          ) {
            // Sudah dibayar/diproses tetapi HOLD tertinggal → bukan wewenang job ini.
            if (order.status === OrderStatus.PAID) return "skip";
          }
          const active = await tx.payment.findUnique({
            where: { pendingSlot: b.orderId },
          });
          if (
            active &&
            (!active.expiresAt ||
              active.expiresAt.getTime() + cfg.paymentGraceSeconds * 1000 >
                now.getTime())
          ) {
            return "skip"; // pelanggan masih bisa membayar tagihan ini
          }
          if (active) {
            await tx.payment.update({
              where: { id: active.id },
              data: { status: PaymentStatus.EXPIRED, pendingSlot: null },
            });
            if (active.externalId)
              retired.push({
                id: active.id,
                paymentNumber: active.paymentNumber,
              });
          }
          if (
            order &&
            (order.status === OrderStatus.DRAFT ||
              order.status === OrderStatus.WAITING_PAYMENT)
          ) {
            await tx.order.update({
              where: { id: order.id },
              data: {
                status: OrderStatus.CANCELLED,
                cancelledAt: now,
                cancelReason:
                  "Kedaluwarsa: tidak dibayar dalam batas waktu booking",
              },
            });
            await tx.orderStatusLog.create({
              data: {
                orderId: order.id,
                status: OrderStatus.CANCELLED,
                notes:
                  "Dibatalkan otomatis: booking mesin kedaluwarsa sebelum dibayar",
              },
            });
          }
        }
        await tx.machineBooking.update({
          where: { id: b.id },
          data: { status: BookingStatus.EXPIRED },
        });
        return "expired";
      });
      if (r === "expired") expired++;
      else skipped++;
    }
    // Di luar transaksi: expire tagihan di gateway (bila ternyata dibayar →
    // settle → order sudah CANCELLED → rekonsiliasi PAID_AFTER_CANCEL).
    await this.payments.cancelAttemptsAtGateway(retired);
    return { scanned: candidates.length, expired, skipped };
  }

  // ── B. Penyelesaian booking ────────────────────────────────────────────
  /**
   * IN_USE: diselesaikan bila mesin melaporkan COMPLETED (event terlewat),
   * atau — fallback durasi — bila lewat batas DAN tidak ada event RUNNING
   * baru-baru ini. RESERVED yang dibayar tapi tak pernah dipakai → EXPIRED +
   * rekonsiliasi PAID_NOT_USED untuk keputusan admin.
   */
  async completeBookings(now = new Date()) {
    const cfg = maintenanceConfig();
    let completed = 0;
    let stuck = 0;
    let noShow = 0;

    const inUse = await this.prisma.machineBooking.findMany({
      where: {
        status: BookingStatus.IN_USE,
        startedAt: { lt: ago(now, cfg.runTimeoutMinutes * 60_000) },
      },
      select: { id: true, orderId: true, deviceId: true, startedAt: true },
      take: cfg.batch,
    });
    for (const b of inUse) {
      const last = await this.prisma.iotEvent.findFirst({
        where: {
          deviceId: b.deviceId,
          createdAt: { gte: b.startedAt ?? ago(now, 24 * 3600_000) },
          eventType: {
            in: [
              "RUNNING",
              "STARTED",
              "START",
              "COMPLETED",
              "DONE",
              "FINISHED",
            ],
          },
        },
        orderBy: { createdAt: "desc" },
      });
      const lastType = last?.eventType.toUpperCase();
      const finishedByDevice =
        !!lastType && ["COMPLETED", "DONE", "FINISHED"].includes(lastType);
      const stillRunning =
        !!lastType &&
        ["RUNNING", "STARTED", "START"].includes(lastType) &&
        last!.createdAt.getTime() >
          now.getTime() - cfg.runningFreshMinutes * 60_000;
      if (stillRunning) {
        // Mesin masih melapor berjalan → tidak diselesaikan; tandai macet sekali.
        // Advisory lock per booking → "tandai sekali" atomik antar-worker.
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"stuck:" + b.id}))`;
          const flagged = await tx.auditLog.findFirst({
            where: { action: "OPS_BOOKING_STUCK", entityId: b.id },
          });
          if (!flagged) {
            await this.audit(tx, "OPS_BOOKING_STUCK", "MachineBooking", b.id, {
              startedAt: b.startedAt,
              lastEvent: last?.eventType,
              lastEventAt: last?.createdAt,
            });
          }
        });
        stuck++;
        continue;
      }
      const source = finishedByDevice
        ? "IOT_COMPLETED_EVENT"
        : "DURATION_FALLBACK";
      const done = b.orderId
        ? await completeBookingForOrder(this.prisma, b.orderId, source)
        : (
            await this.prisma.machineBooking.updateMany({
              where: { id: b.id, status: BookingStatus.IN_USE },
              data: { status: BookingStatus.DONE, endedAt: now },
            })
          ).count === 1;
      if (done) {
        completed++;
        if (source === "DURATION_FALLBACK") {
          await this.audit(
            this.prisma,
            "OPS_BOOKING_COMPLETED_FALLBACK",
            "MachineBooking",
            b.id,
            {
              startedAt: b.startedAt,
              runTimeoutMinutes: cfg.runTimeoutMinutes,
            },
          );
        }
      }
    }

    // RESERVED (sudah dibayar) yang lewat jendela pakai.
    const reserved = await this.prisma.machineBooking.findMany({
      where: { status: BookingStatus.RESERVED, expiresAt: { lt: now } },
      select: { id: true, orderId: true },
      take: cfg.batch,
    });
    for (const c of reserved) {
      const r = await this.prisma.$transaction(async (tx) => {
        if (c.orderId) {
          await tx.$queryRaw`SELECT id FROM orders WHERE id = ${c.orderId} FOR UPDATE`;
        }
        const b = await this.lockBooking(tx, c.id);
        if (!b || b.status !== BookingStatus.RESERVED || b.expiresAt >= now)
          return false;
        if (b.orderId) {
          // START sedang berjalan → mesin mungkin sudah menyala; jangan disentuh.
          const activeStart = await tx.iotCommand.count({
            where: {
              orderId: b.orderId,
              command: START_MACHINE,
              status: {
                in: [
                  IotCommandStatus.PENDING,
                  IotCommandStatus.PUBLISHED,
                  IotCommandStatus.ACKED,
                  IotCommandStatus.RUNNING,
                ],
              },
            },
          });
          if (activeStart > 0) return false;
        }
        await tx.machineBooking.update({
          where: { id: b.id },
          data: { status: BookingStatus.EXPIRED },
        });
        if (b.orderId) {
          const order = await tx.order.findUnique({ where: { id: b.orderId } });
          const payment = order?.paidPaymentId
            ? await tx.payment.findUnique({
                where: { id: order.paidPaymentId },
              })
            : null;
          if (order && payment && order.status === OrderStatus.PAID) {
            await recordReconciliationInTx(tx, {
              payment,
              order,
              reason: ReconciliationReason.PAID_NOT_USED,
              note: "Booking dibayar tetapi mesin tidak dipakai dalam jendela waktu — keputusan admin (jadwal ulang / refund)",
            });
          }
        }
        return true;
      });
      if (r) noShow++;
    }
    return { completed, stuck, noShow };
  }

  // ── C. Pemulihan kegagalan ─────────────────────────────────────────────
  /**
   * - Pembayaran PENDING lewat batas → verifikasi ke gateway (bisa PAID).
   * - START PENDING tertinggal → publikasi ulang (klaim atomik, tanpa ganda).
   * - START tanpa ACK/RUNNING → TIMEOUT (boleh dicoba ulang; event terlambat diterima).
   */
  async recoverStuck(now = new Date()) {
    const cfg = maintenanceConfig();
    const stalePayments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        OR: [
          { expiresAt: { lt: ago(now, cfg.paymentGraceSeconds * 1000) } },
          {
            expiresAt: null,
            externalId: null,
            createdAt: { lt: ago(now, 5 * 60_000) },
          },
        ],
      },
      select: { id: true },
      take: cfg.batch,
    });
    let paymentsSynced = 0;
    for (const p of stalePayments) {
      try {
        await this.payments.syncPendingPayment(p.id);
        paymentsSynced++;
      } catch (err) {
        this.logger.error(
          `Sinkronisasi pembayaran ${p.id} gagal: ${(err as Error).message}`,
        );
      }
    }

    const pendingStarts = await this.prisma.iotCommand.findMany({
      where: {
        command: START_MACHINE,
        status: IotCommandStatus.PENDING,
        createdAt: { lt: ago(now, cfg.startPendingRepublishSeconds * 1000) },
      },
      select: { id: true },
      take: cfg.batch,
    });
    for (const c of pendingStarts) await this.iot.markPublished(c.id);

    const unacked = await this.prisma.iotCommand.findMany({
      where: {
        command: START_MACHINE,
        status: { in: [IotCommandStatus.PUBLISHED, IotCommandStatus.ACKED] },
        sentAt: { lt: ago(now, cfg.startAckTimeoutMinutes * 60_000) },
      },
      select: { id: true, orderId: true, deviceId: true, status: true },
      take: cfg.batch,
    });
    let timedOut = 0;
    for (const c of unacked) {
      const res = await this.prisma.iotCommand.updateMany({
        where: {
          id: c.id,
          status: { in: [IotCommandStatus.PUBLISHED, IotCommandStatus.ACKED] },
        },
        data: { status: IotCommandStatus.TIMEOUT },
      });
      if (res.count === 1) {
        timedOut++;
        await this.audit(this.prisma, "OPS_START_TIMEOUT", "IotCommand", c.id, {
          orderId: c.orderId,
          deviceId: c.deviceId,
          previousStatus: c.status,
        });
      }
    }
    return {
      paymentsSynced,
      startsRepublished: pendingStarts.length,
      startsTimedOut: timedOut,
    };
  }
}
