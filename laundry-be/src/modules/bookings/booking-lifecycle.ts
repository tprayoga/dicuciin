/**
 * Siklus hidup booking mesin (Fase 1 Batch 1 — K2/T2).
 *
 *   HOLD ──(order PAID)──> RESERVED ──(scan QR valid → START, mesin lapor RUNNING)──> IN_USE ──> DONE
 *     └─(kedaluwarsa / order dibatalkan)──> CANCELLED
 *
 * Fungsi di sini MURNI terhadap `Prisma.TransactionClient` agar bisa dipakai
 * bersama oleh Orders, Transactions, Payments, dan Bookings tanpa dependensi
 * modul melingkar. Semua penulisan booking mengunci baris mesin
 * (`SELECT … FOR UPDATE`) sehingga pemeriksaan bentrok + penulisan bersifat
 * serial per mesin → tidak ada double booking walau request paralel.
 */
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { BookingStatus, DeviceType, Prisma } from "@prisma/client";
import { notifyCustomerInTx } from "../notifications/notify";

const logger = new Logger("BookingLifecycle");

export const MACHINE_TYPES: DeviceType[] = [
  DeviceType.WASHING_MACHINE,
  DeviceType.DRYER_MACHINE,
];

/** Status booking yang masih "memegang" mesin (bila belum kedaluwarsa). */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.HOLD,
  BookingStatus.RESERVED,
  BookingStatus.IN_USE,
];

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/** Parameter kebijakan booking (bisa diubah via env, nilai default = usulan plan). */
export function bookingConfig() {
  return {
    /** Lama HOLD menunggu pembayaran. */
    holdMinutes: num(process.env.BOOKING_HOLD_MINUTES, 10),
    /** Toleransi setelah jadwal untuk mulai memakai mesin (scan). */
    graceMinutes: num(process.env.BOOKING_GRACE_MINUTES, 30),
    /** Durasi slot yang ditahan per booking (pemeriksaan bentrok). */
    slotMinutes: num(process.env.BOOKING_SLOT_MINUTES, 60),
    /** Seberapa awal scan diterima sebelum jadwal. */
    scanEarlyMinutes: num(process.env.BOOKING_SCAN_EARLY_MINUTES, 15),
    /** Maksimal percobaan START per order (mis. command sebelumnya FAILED). */
    maxStartAttempts: num(process.env.BOOKING_MAX_START_ATTEMPTS, 3),
  };
}

const minutes = (m: number) => m * 60_000;

type BookingLike = {
  id: string;
  status: BookingStatus;
  scheduledAt: Date | null;
  reservedAt: Date;
  expiresAt: Date;
};

/** Awal slot booking: jadwal, atau saat dibuat bila "sekarang". */
export function slotStart(
  b: Pick<BookingLike, "scheduledAt" | "reservedAt">,
): Date {
  return b.scheduledAt ?? b.reservedAt;
}

/** Apakah booking masih memegang mesin pada waktu `now`. */
export function isBookingActive(
  b: Pick<BookingLike, "status" | "expiresAt">,
  now: Date,
): boolean {
  if (b.status === BookingStatus.IN_USE) return true;
  if (b.status === BookingStatus.HOLD || b.status === BookingStatus.RESERVED) {
    return b.expiresAt.getTime() > now.getTime();
  }
  return false;
}

/** Kunci baris mesin sampai transaksi selesai (serialisasi penulisan booking per mesin). */
export async function lockDevice(
  tx: Prisma.TransactionClient,
  deviceId: string,
) {
  await tx.$queryRaw`SELECT id FROM iot_devices WHERE id = ${deviceId} FOR UPDATE`;
}

/** Cari booking aktif lain yang slotnya bertabrakan dengan [start, end). */
export async function findConflictingBooking(
  tx: Prisma.TransactionClient,
  deviceId: string,
  start: Date,
  now: Date,
  excludeBookingId?: string,
  /** Batch 3: durasi booking baru (mis. dryer 3 siklus); default slot. */
  durationMinutes?: number | null,
) {
  const { slotMinutes } = bookingConfig();
  const end = new Date(start.getTime() + minutes(durationMinutes || slotMinutes));
  const candidates = await tx.machineBooking.findMany({
    where: {
      deviceId,
      status: { in: ACTIVE_BOOKING_STATUSES },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
  });
  return (
    candidates.find((b) => {
      if (!isBookingActive(b, now)) return false;
      if (b.status === BookingStatus.IN_USE) return true; // dipakai sampai selesai
      const bStart = slotStart(b).getTime();
      const bEnd = bStart + minutes(b.durationMinutes || slotMinutes);
      return bStart < end.getTime() && start.getTime() < bEnd;
    }) ?? null
  );
}

/** Validasi & normalisasi waktu terjadwal (null = sekarang). */
export function parseScheduledAt(
  iso: string | Date | null | undefined,
  now: Date,
): Date | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime()))
    throw new BadRequestException("Waktu terjadwal tidak valid");
  if (d.getTime() < now.getTime() - 60_000) {
    throw new BadRequestException("Waktu terjadwal sudah lewat");
  }
  return d;
}

/** Ambil & validasi mesin yang boleh dibooking. */
/**
 * Status fisik mesin yang dipakai untuk ketersediaan. Mesin mode MANUAL (belum
 * terintegrasi IoT) tidak pernah mengirim heartbeat → status OFFLINE/belum
 * terhubung diabaikan; admin hanya memilih Tersedia (ONLINE) atau MAINTENANCE.
 */
export function physicalDeviceStatus(device: { status: string; controlMode?: string | null }): string {
  if (device.controlMode === "MANUAL") {
    return device.status === "MAINTENANCE" ? "MAINTENANCE" : "ONLINE";
  }
  return device.status;
}

export const isManualDevice = (device: { controlMode?: string | null } | null | undefined) =>
  device?.controlMode === "MANUAL";

export async function resolveBookableDevice(
  tx: Prisma.TransactionClient,
  ref: { deviceId?: string; deviceCode?: string },
  expectedOutletId?: string,
) {
  if (!ref.deviceId && !ref.deviceCode) {
    throw new BadRequestException("deviceId atau deviceCode wajib diisi");
  }
  const device = ref.deviceId
    ? await tx.iotDevice.findUnique({ where: { id: ref.deviceId } })
    : await tx.iotDevice.findUnique({ where: { deviceCode: ref.deviceCode } });
  if (!device) throw new NotFoundException("Mesin tidak ditemukan");
  if (!MACHINE_TYPES.includes(device.deviceType)) {
    throw new BadRequestException("Perangkat ini bukan mesin cuci/pengering");
  }
  if (expectedOutletId && device.outletId !== expectedOutletId) {
    throw new BadRequestException("Mesin tidak berada di outlet order ini");
  }
  const physical = physicalDeviceStatus(device);
  if (physical === "OFFLINE" || physical === "MAINTENANCE") {
    throw new ConflictException("Mesin sedang tidak tersedia");
  }
  return device;
}

/**
 * Buat booking untuk order (atau HOLD tanpa order untuk API lama) secara atomik
 * dalam `tx`. Bila customer sudah punya HOLD tanpa order untuk mesin & jadwal
 * yang sama (alur app lama: reserve lalu buat order), HOLD itu DIPAKAI ULANG
 * — bukan membuat booking ganda.
 */
export async function createBookingInTx(
  tx: Prisma.TransactionClient,
  input: {
    /** null = booking tamu kiosk (order kiosk tanpa akun customer). */
    customerId: string | null;
    deviceId: string;
    orderId: string | null;
    scheduledAt: Date | null;
    status: "HOLD" | "RESERVED";
    bookingCode: string;
    now?: Date;
    /** Batch 3: lama pemakaian (menit) dari estimasi server. */
    durationMinutes?: number | null;
  },
) {
  const now = input.now ?? new Date();
  const cfg = bookingConfig();
  await lockDevice(tx, input.deviceId);

  const start = input.scheduledAt ?? now;
  const expiresAt =
    input.status === BookingStatus.HOLD
      ? new Date(now.getTime() + minutes(cfg.holdMinutes))
      : new Date(
          Math.max(start.getTime(), now.getTime()) + minutes(cfg.graceMinutes),
        );

  if (input.orderId && input.customerId) {
    // Pakai ulang HOLD tanpa order milik customer ini untuk slot yang sama.
    const ownHolds = await tx.machineBooking.findMany({
      where: {
        deviceId: input.deviceId,
        customerId: input.customerId,
        orderId: null,
        status: BookingStatus.HOLD,
        expiresAt: { gt: now },
      },
    });
    const reusable = ownHolds.find(
      (b) =>
        Math.abs(slotStart(b).getTime() - start.getTime()) <= 60_000 ||
        (!b.scheduledAt && !input.scheduledAt),
    );
    if (reusable) {
      return tx.machineBooking.update({
        where: { id: reusable.id },
        data: {
          orderId: input.orderId,
          status: input.status,
          expiresAt,
          durationMinutes: input.durationMinutes ?? null,
        },
      });
    }
  }

  const conflict = await findConflictingBooking(
    tx,
    input.deviceId,
    start,
    now,
    undefined,
    input.durationMinutes,
  );
  if (conflict) {
    throw new ConflictException("Mesin sudah dibooking pada waktu tersebut");
  }

  return tx.machineBooking.create({
    data: {
      deviceId: input.deviceId,
      customerId: input.customerId,
      orderId: input.orderId,
      bookingCode: input.bookingCode,
      status: input.status,
      scheduledAt: input.scheduledAt,
      expiresAt,
      durationMinutes: input.durationMinutes ?? null,
    },
  });
}

/**
 * Dipanggil di DALAM transaksi pembayaran saat order menjadi PAID:
 * booking HOLD → RESERVED. Bila HOLD sudah kedaluwarsa dan slot keburu diambil
 * orang lain, booking dibatalkan dan dikembalikan `{ promoted: false }` agar
 * pemanggil mencatatnya (order tetap PAID — perlu tindak lanjut admin/refund).
 */
export async function promoteBookingOnPaidInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  now: Date = new Date(),
): Promise<{ bookingId: string | null; promoted: boolean }> {
  const booking = await tx.machineBooking.findUnique({ where: { orderId } });
  if (!booking) return { bookingId: null, promoted: false };
  if (booking.status !== BookingStatus.HOLD) {
    return {
      bookingId: booking.id,
      promoted: booking.status === BookingStatus.RESERVED,
    };
  }

  await lockDevice(tx, booking.deviceId);
  const start = booking.scheduledAt ?? now;
  const conflict = await findConflictingBooking(
    tx,
    booking.deviceId,
    start,
    now,
    booking.id,
    booking.durationMinutes,
  );
  if (conflict) {
    await tx.machineBooking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED },
    });
    logger.error(
      `Order ${orderId} PAID tetapi slot mesin sudah diambil booking ${conflict.id} — perlu tindak lanjut admin`,
    );
    return { bookingId: booking.id, promoted: false };
  }

  const { graceMinutes } = bookingConfig();
  await tx.machineBooking.update({
    where: { id: booking.id },
    data: {
      status: BookingStatus.RESERVED,
      expiresAt: new Date(
        Math.max(start.getTime(), now.getTime()) + minutes(graceMinutes),
      ),
    },
  });
  return { bookingId: booking.id, promoted: true };
}

/** Lepas booking yang belum dipakai saat order dibatalkan. */
export async function releaseBookingForOrderInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  return tx.machineBooking.updateMany({
    where: {
      orderId,
      status: { in: [BookingStatus.HOLD, BookingStatus.RESERVED] },
    },
    data: { status: BookingStatus.CANCELLED },
  });
}

const MACHINE_TYPE_TO_DEVICE: Record<string, DeviceType> = {
  WASHER: DeviceType.WASHING_MACHINE,
  DRYER: DeviceType.DRYER_MACHINE,
};

/**
 * Kompatibilitas aplikasi mobile versi lama (Batch 1.5).
 *
 * App lama memesan mesin dengan `POST /bookings` (HOLD tanpa order) LALU membuat
 * order tanpa `deviceId`. Agar alur itu tetap berfungsi TANPA membuka kembali
 * aktivasi tanpa bayar, HOLD tersebut diikat ke order baru bila dan hanya bila:
 *  - milik customer yang sama, belum punya order, status HOLD, belum kedaluwarsa;
 *  - mesinnya di outlet order dan jenisnya cocok dengan `machineType` item order;
 *  - kandidatnya TEPAT SATU (ambigu → tidak diikat).
 * Setelah terikat, aturan Batch 1 berlaku penuh: HOLD → RESERVED hanya saat
 * order PAID, dan mesin hanya START lewat scan QR pemilik.
 */
export async function bindLegacyHoldToOrderInTx(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    outletId: string;
    orderId: string;
    machineTypes: (string | null | undefined)[];
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const deviceTypes = input.machineTypes
    .map((t) => (t ? MACHINE_TYPE_TO_DEVICE[t.toUpperCase()] : undefined))
    .filter((t): t is DeviceType => !!t);
  if (deviceTypes.length === 0) return null;

  const candidates = await tx.machineBooking.findMany({
    where: {
      customerId: input.customerId,
      orderId: null,
      status: BookingStatus.HOLD,
      expiresAt: { gt: now },
      device: { outletId: input.outletId, deviceType: { in: deviceTypes } },
    },
  });
  if (candidates.length !== 1) {
    if (candidates.length > 1) {
      logger.warn(
        `Order ${input.orderId}: ${candidates.length} HOLD lama cocok — tidak diikat (ambigu)`,
      );
    }
    return null;
  }
  const hold = candidates[0];
  await lockDevice(tx, hold.deviceId);
  const bound = await tx.machineBooking.updateMany({
    where: { id: hold.id, orderId: null, status: BookingStatus.HOLD },
    data: { orderId: input.orderId },
  });
  return bound.count === 1 ? hold.id : null;
}

/**
 * Selesaikan booking & order secara konsisten (Batch 2): booking
 * RESERVED/IN_USE → DONE dan order PAID → COMPLETED, dalam SATU transaksi
 * dengan urutan kunci order → booking (sama dengan webhook & scheduler →
 * tidak ada deadlock). Idempoten: booking yang sudah DONE dilewati.
 */
export async function completeBookingForOrder(
  prisma: {
    $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  },
  orderId: string,
  source: "IOT_COMPLETED_EVENT" | "DURATION_FALLBACK" | "MANUAL_DURATION",
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
    const done = await tx.machineBooking.updateMany({
      where: {
        orderId,
        status: { in: [BookingStatus.RESERVED, BookingStatus.IN_USE] },
      },
      data: { status: BookingStatus.DONE, endedAt: new Date() },
    });
    if (done.count === 0) return false;
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (order?.status === "PAID") {
      await tx.order.update({
        where: { id: orderId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      // Batch 6 (R1, S8): cucian selesai → minta ulasan (sekali per order).
      await notifyCustomerInTx(tx, order.customerId, {
        type: "ORDER_COMPLETED",
        title: "Cucian selesai",
        body: `Order ${order.orderNumber} selesai. Ambil cucianmu, lalu beri ulasan untuk layanan kami.`,
        data: { orderId, orderNumber: order.orderNumber, reviewRequested: true },
        dedupeKey: `order-completed-${orderId}`,
      });
      await tx.orderStatusLog.create({
        data: {
          orderId,
          status: "COMPLETED",
          notes:
            source === "IOT_COMPLETED_EVENT"
              ? "Mesin melaporkan selesai"
              : source === "MANUAL_DURATION"
                ? "Selesai otomatis (mesin mode manual, sesuai estimasi durasi)"
                : "Selesai otomatis (batas durasi, tanpa event mesin)",
        },
      });
    }
    return true;
  });
}
