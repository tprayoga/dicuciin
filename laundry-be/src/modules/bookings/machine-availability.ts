/**
 * Satu-satunya aturan "status mesin" yang dilihat pelanggan (aplikasi & kiosk)
 * DAN admin (Kelola Mesin, kartu outlet). Dulu admin menghitung sendiri dari
 * `iotDevice.status` sehingga mesin IoT berstatus AVAILABLE tampil "Offline"
 * di admin padahal "Tersedia" di aplikasi — jumlah mesin aktif jadi beda.
 *
 * Status efektif: IN_USE > RESERVED (booking aktif) > OFFLINE > MAINTENANCE > IN_USE (fisik) > AVAILABLE.
 */
import { BookingStatus, Prisma } from "@prisma/client";
import { MACHINE_TYPES, physicalDeviceStatus } from "./booking-lifecycle";

export type MachineStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "IN_USE"
  | "MAINTENANCE"
  | "OFFLINE";

type Db = Pick<Prisma.TransactionClient, "machineBooking" | "iotDevice">;

/** Peta deviceId → status booking aktif (IN_USE diprioritaskan atas RESERVED). */
export async function activeBookingStatusByDevice(
  db: Db,
  deviceIds: string[],
): Promise<Map<string, BookingStatus>> {
  const map = new Map<string, BookingStatus>();
  if (deviceIds.length === 0) return map;
  const active = await db.machineBooking.findMany({
    where: {
      deviceId: { in: deviceIds },
      OR: [
        { status: BookingStatus.IN_USE },
        {
          status: { in: [BookingStatus.RESERVED, BookingStatus.HOLD] },
          expiresAt: { gt: new Date() },
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
 * lalu fallback ke status fisik perangkat (OFFLINE/MAINTENANCE/IN_USE), sisanya AVAILABLE.
 */
export function effectiveMachineStatus(
  device: { status: string; controlMode?: string | null },
  bs?: BookingStatus,
): MachineStatus {
  const deviceStatus = physicalDeviceStatus(device);
  if (bs === BookingStatus.IN_USE) return "IN_USE";
  if (bs === BookingStatus.RESERVED) return "RESERVED";
  // 'RESERVED' sengaja TIDAK dibaca dari device agar flag lama tak nyangkut.
  // ERROR = perangkat melapor rusak → jangan ditawarkan ke pelanggan.
  if (deviceStatus === "OFFLINE" || deviceStatus === "ERROR") return "OFFLINE";
  if (deviceStatus === "MAINTENANCE") return "MAINTENANCE";
  // Mesin benar-benar berjalan (RUNNING dipakai sebagian firmware/data lama).
  if (deviceStatus === "IN_USE" || deviceStatus === "RUNNING") return "IN_USE";
  return "AVAILABLE";
}

/** Ringkasan keramaian dari daftar status mesin. */
export function occupancyOf(machines: { status: string }[]) {
  const total = machines.length;
  const offline = machines.filter(
    (m) => m.status === "OFFLINE" || m.status === "MAINTENANCE",
  ).length;
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

export type Occupancy = ReturnType<typeof occupancyOf>;

/** Ringkasan mesin (cuci & pengering saja) per outlet — angka yang sama dengan aplikasi. */
export async function machineStatsByOutlet(
  db: Db,
  outletIds: string[],
): Promise<Map<string, Occupancy>> {
  const result = new Map<string, Occupancy>();
  if (outletIds.length === 0) return result;
  const devices = await db.iotDevice.findMany({
    where: { outletId: { in: outletIds }, deviceType: { in: MACHINE_TYPES } },
    select: { id: true, outletId: true, status: true, controlMode: true },
  });
  const byDevice = await activeBookingStatusByDevice(
    db,
    devices.map((d) => d.id),
  );
  for (const id of outletIds) {
    result.set(
      id,
      occupancyOf(
        devices
          .filter((d) => d.outletId === id)
          .map((d) => ({ status: effectiveMachineStatus(d, byDevice.get(d.id)) })),
      ),
    );
  }
  return result;
}
