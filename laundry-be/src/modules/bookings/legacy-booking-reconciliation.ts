/**
 * Rekonsiliasi booking lama (Batch 1.5, Prioritas 2).
 *
 * Sebelum Batch 1 booking dibuat lewat `POST /bookings` TANPA order (dan
 * migrasi FK menolkan `orderId` yang menunjuk order yang sudah tidak ada).
 * Modul ini MENGKLASIFIKASIKAN booking tersebut dan hanya mengusulkan
 * transisi yang aman. Prinsip:
 *  - Tidak pernah menghapus baris apa pun (booking, order, payment).
 *  - Tidak pernah menyentuh booking IN_USE (mesin bisa sedang berputar) —
 *    selalu MANUAL_REVIEW.
 *  - Hanya dua aksi otomatis, keduanya untuk booking yang TIDAK lagi memegang
 *    mesin secara fisik:
 *      EXPIRE  — HOLD/RESERVED tanpa order yang sudah lewat `expiresAt`.
 *      CANCEL  — HOLD/RESERVED yang order-nya CANCELLED/REFUNDED.
 *  - Setiap aksi diterapkan per baris di dalam transaksi dengan pemeriksaan
 *    ulang (baris yang berubah sejak dry-run dilewati) + dicatat di AuditLog.
 */
import { BookingStatus, OrderStatus, PrismaClient } from "@prisma/client";

export type LegacyCategory =
  | "IN_USE_NO_ORDER" // mesin mungkin sedang jalan — manual
  | "IN_USE_CLOSED_ORDER" // IN_USE tetapi order batal/refund — manual
  | "ACTIVE_NO_ORDER" // HOLD/RESERVED tanpa order, belum kedaluwarsa — biarkan kedaluwarsa
  | "ABANDONED_NO_ORDER" // HOLD/RESERVED tanpa order, sudah kedaluwarsa → EXPIRE
  | "ACTIVE_CLOSED_ORDER" // HOLD/RESERVED, order CANCELLED/REFUNDED → CANCEL
  | "HISTORICAL_NO_ORDER" // DONE/CANCELLED/EXPIRED tanpa order — arsip, tidak diubah
  | "PAID_ORDER_BOOKING_LOST"; // order PAID tapi booking CANCELLED & mesin tak pernah START — tindak lanjut refund

export type LegacyAction = "EXPIRE" | "CANCEL" | "MANUAL_REVIEW" | "NONE";

export interface LegacyBookingFinding {
  bookingId: string;
  bookingCode: string;
  deviceCode: string;
  outletId: string;
  customerId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderStatus: OrderStatus | null;
  status: BookingStatus;
  expiresAt: string;
  startedAt: string | null;
  category: LegacyCategory;
  action: LegacyAction;
  reason: string;
  /** Bukti mesin berjalan (perintah START aktif/RUNNING atau event RUNNING terakhir). */
  machineEvidence: string | null;
}

export interface LegacyReport {
  generatedAt: string;
  totals: Record<LegacyCategory, number>;
  actions: Record<LegacyAction, number>;
  findings: LegacyBookingFinding[];
  /** Pembayaran PAID atas order CANCELLED/REFUNDED (butuh refund manual). */
  paidOnClosedOrders: {
    paymentNumber: string;
    orderNumber: string;
    orderStatus: OrderStatus;
    amount: number;
    paidAt: string | null;
  }[];
}

const CLOSED: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.REFUNDED];
const HOLDING: BookingStatus[] = [BookingStatus.HOLD, BookingStatus.RESERVED];

export async function buildLegacyBookingReport(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<LegacyReport> {
  const bookings = await prisma.machineBooking.findMany({
    where: {
      OR: [
        { orderId: null },
        {
          order: { status: { in: CLOSED } },
          status: { in: [...HOLDING, BookingStatus.IN_USE] },
        },
        {
          order: { status: OrderStatus.PAID },
          status: BookingStatus.CANCELLED,
        },
      ],
    },
    include: {
      device: { select: { deviceCode: true, outletId: true } },
      order: { select: { id: true, orderNumber: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const findings: LegacyBookingFinding[] = [];
  for (const b of bookings) {
    const evidence = await machineEvidence(prisma, b.deviceId);
    const base = {
      bookingId: b.id,
      bookingCode: b.bookingCode,
      deviceCode: b.device.deviceCode,
      outletId: b.device.outletId,
      customerId: b.customerId,
      orderId: b.orderId,
      orderNumber: b.order?.orderNumber ?? null,
      orderStatus: b.order?.status ?? null,
      status: b.status,
      expiresAt: b.expiresAt.toISOString(),
      startedAt: b.startedAt?.toISOString() ?? null,
      machineEvidence: evidence,
    };
    const closed = !!b.order && CLOSED.includes(b.order.status);

    if (b.status === BookingStatus.IN_USE) {
      findings.push({
        ...base,
        category: closed ? "IN_USE_CLOSED_ORDER" : "IN_USE_NO_ORDER",
        action: "MANUAL_REVIEW",
        reason:
          "Booking IN_USE tidak pernah dilepas otomatis — periksa mesin secara fisik lalu putuskan manual.",
      });
    } else if (HOLDING.includes(b.status) && closed) {
      findings.push({
        ...base,
        category: "ACTIVE_CLOSED_ORDER",
        action: evidence ? "MANUAL_REVIEW" : "CANCEL",
        reason: evidence
          ? "Order sudah batal/refund tetapi ada indikasi mesin berjalan — manual."
          : "Order sudah batal/refund; booking masih memegang mesin → batalkan.",
      });
    } else if (HOLDING.includes(b.status) && !b.orderId) {
      const expired = b.expiresAt.getTime() <= now.getTime();
      findings.push({
        ...base,
        category: expired ? "ABANDONED_NO_ORDER" : "ACTIVE_NO_ORDER",
        action: expired ? (evidence ? "MANUAL_REVIEW" : "EXPIRE") : "NONE",
        reason: expired
          ? "Reservasi lama tanpa order & tanpa pembayaran yang sudah kedaluwarsa (tidak lagi memblokir mesin) → tandai EXPIRED."
          : "Reservasi lama tanpa order yang belum kedaluwarsa: tidak bisa dipakai (scan wajib bayar) dan akan kedaluwarsa sendiri.",
      });
    } else if (
      b.status === BookingStatus.CANCELLED &&
      b.order?.status === OrderStatus.PAID
    ) {
      const started = await prisma.iotCommand.count({
        where: {
          orderId: b.orderId!,
          command: "START_MACHINE",
          status: { in: ["PUBLISHED", "ACKED", "RUNNING", "COMPLETED"] },
        },
      });
      if (started > 0) continue; // mesin sempat dipakai — bukan temuan
      findings.push({
        ...base,
        category: "PAID_ORDER_BOOKING_LOST",
        action: "MANUAL_REVIEW",
        reason:
          "Order sudah dibayar tetapi booking dibatalkan (slot terambil / kedaluwarsa) dan mesin tidak pernah START — jadwalkan ulang atau refund.",
      });
    } else {
      findings.push({
        ...base,
        category: "HISTORICAL_NO_ORDER",
        action: "NONE",
        reason: "Riwayat booking lama (selesai/batal) — disimpan apa adanya.",
      });
    }
  }

  const paid = await prisma.payment.findMany({
    where: { status: "PAID", order: { status: { in: CLOSED } } },
    include: { order: { select: { orderNumber: true, status: true } } },
    orderBy: { paidAt: "asc" },
  });

  const totals = Object.fromEntries(
    (
      [
        "IN_USE_NO_ORDER",
        "IN_USE_CLOSED_ORDER",
        "ACTIVE_NO_ORDER",
        "ABANDONED_NO_ORDER",
        "ACTIVE_CLOSED_ORDER",
        "HISTORICAL_NO_ORDER",
        "PAID_ORDER_BOOKING_LOST",
      ] as LegacyCategory[]
    ).map((c) => [c, findings.filter((f) => f.category === c).length]),
  ) as Record<LegacyCategory, number>;
  const actions = Object.fromEntries(
    (["EXPIRE", "CANCEL", "MANUAL_REVIEW", "NONE"] as LegacyAction[]).map(
      (a) => [a, findings.filter((f) => f.action === a).length],
    ),
  ) as Record<LegacyAction, number>;

  return {
    generatedAt: now.toISOString(),
    totals,
    actions,
    findings,
    paidOnClosedOrders: paid.map((p) => ({
      paymentNumber: p.paymentNumber,
      orderNumber: p.order.orderNumber,
      orderStatus: p.order.status,
      amount: Number(p.amount),
      paidAt: p.paidAt?.toISOString() ?? null,
    })),
  };
}

/** Indikasi mesin berjalan: perintah aktif/RUNNING, atau event RUNNING tanpa COMPLETED sesudahnya. */
async function machineEvidence(
  prisma: PrismaClient,
  deviceId: string,
): Promise<string | null> {
  // Sengaja per MESIN (bukan per order): booking lama tidak punya order, jadi
  // perintah aktif apa pun di mesin itu dianggap indikasi → MANUAL_REVIEW.
  const active = await prisma.iotCommand.findFirst({
    where: {
      deviceId,
      status: { in: ["PUBLISHED", "ACKED", "RUNNING"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (active)
    return `perintah ${active.command} berstatus ${active.status} (${active.createdAt.toISOString()})`;
  const lastEvent = await prisma.iotEvent.findFirst({
    where: {
      deviceId,
      eventType: {
        in: ["RUNNING", "STARTED", "START", "COMPLETED", "DONE", "FINISHED"],
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (
    lastEvent &&
    ["RUNNING", "STARTED", "START"].includes(lastEvent.eventType.toUpperCase())
  ) {
    return `event terakhir ${lastEvent.eventType} (${lastEvent.createdAt.toISOString()})`;
  }
  return null;
}

/**
 * Terapkan HANYA aksi EXPIRE/CANCEL dari laporan. Per baris: transaksi,
 * pemeriksaan ulang kondisi, update status, AuditLog. Baris yang kondisinya
 * berubah sejak laporan dibuat dilewati (dilaporkan sebagai `skipped`).
 */
export async function applyLegacyBookingActions(
  prisma: PrismaClient,
  report: LegacyReport,
  actor: string,
  now: Date = new Date(),
) {
  const applied: {
    bookingId: string;
    from: BookingStatus;
    to: BookingStatus;
  }[] = [];
  const skipped: { bookingId: string; reason: string }[] = [];

  for (const f of report.findings) {
    if (f.action !== "EXPIRE" && f.action !== "CANCEL") continue;
    const target =
      f.action === "EXPIRE" ? BookingStatus.EXPIRED : BookingStatus.CANCELLED;
    const result = await prisma.$transaction(async (tx) => {
      const b = await tx.machineBooking.findUnique({
        where: { id: f.bookingId },
        include: { order: { select: { status: true } } },
      });
      if (!b || !HOLDING.includes(b.status) || b.status !== f.status) {
        return { ok: false as const, reason: "status berubah sejak dry-run" };
      }
      if (
        f.action === "EXPIRE" &&
        (b.orderId || b.expiresAt.getTime() > now.getTime())
      ) {
        return {
          ok: false as const,
          reason: "tidak lagi memenuhi syarat EXPIRE",
        };
      }
      if (
        f.action === "CANCEL" &&
        !(b.order && CLOSED.includes(b.order.status))
      ) {
        return { ok: false as const, reason: "order tidak lagi batal/refund" };
      }
      await tx.machineBooking.update({
        where: { id: b.id },
        data: { status: target },
      });
      await tx.auditLog.create({
        data: {
          action: `LEGACY_BOOKING_${f.action}`,
          entity: "MachineBooking",
          entityId: b.id,
          changes: {
            from: b.status,
            to: target,
            category: f.category,
            actor,
            reason: f.reason,
          },
        },
      });
      return { ok: true as const, from: b.status };
    });
    if (result.ok)
      applied.push({ bookingId: f.bookingId, from: result.from, to: target });
    else skipped.push({ bookingId: f.bookingId, reason: result.reason });
  }
  return { applied, skipped };
}
