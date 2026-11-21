/**
 * Batch 4 — kebijakan voucher saat refund (dapat dikonfigurasi & diaudit).
 *
 * Voucher DIKEMBALIKAN setelah refund hanya bila:
 *  1. kebijakan aktif (`REFUND_RESTORE_VOUCHER`, default `true`);
 *  2. manfaat layanan BELUM dikonsumsi — tidak ada booking IN_USE/DONE, tidak
 *     pernah ada perintah START terkirim, dan order belum diproses melewati PAID;
 *  3. voucher masih berlaku (belum kedaluwarsa).
 * Selain itu voucher tetap terpakai. Setiap keputusan dicatat di audit_logs
 * (VOUCHER_RESTORED / VOUCHER_RESTORE_SKIPPED + alasan). Idempoten: redemption
 * hanya berpindah APPLIED → REVERSED sekali (update bersyarat).
 */
import { Prisma, VoucherStatus } from "@prisma/client";

export function voucherRefundPolicy() {
  return {
    restoreOnRefund: (process.env.REFUND_RESTORE_VOUCHER ?? "true") !== "false",
  };
}

const CONSUMED_BOOKING = ["IN_USE", "DONE"];
const STARTED_COMMAND = [
  "PUBLISHED",
  "ACKED",
  "RUNNING",
  "COMPLETED",
  "TIMEOUT",
];
const PROCESSED_ORDER = [
  "RECEIVED",
  "WASHING",
  "DRYING",
  "IRONING",
  "PACKING",
  "READY_PICKUP",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
];

export type VoucherRestoreResult =
  | { restored: true }
  | {
      restored: false;
      reason:
        | "NO_APPLIED_VOUCHER"
        | "POLICY_DISABLED"
        | "SERVICE_CONSUMED"
        | "VOUCHER_EXPIRED"
        | "ALREADY_REVERSED";
    };

/**
 * Panggil di DALAM transaksi refund, SEBELUM status order diubah ke REFUNDED
 * (status order sebelumnya dipakai untuk menilai konsumsi layanan).
 */
export async function restoreVoucherAfterRefundInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  actorUserId?: string,
  now: Date = new Date(),
): Promise<VoucherRestoreResult> {
  const redemption = await tx.voucherRedemption.findUnique({
    where: { orderId },
    include: { userVoucher: true },
  });
  if (!redemption || redemption.status !== "APPLIED") {
    return { restored: false, reason: "NO_APPLIED_VOUCHER" };
  }
  const audit = (action: string, changes: Record<string, unknown>) =>
    tx.auditLog.create({
      data: {
        userId: actorUserId ?? null,
        action,
        entity: "VoucherRedemption",
        entityId: redemption.id,
        changes: {
          orderId,
          userVoucherId: redemption.userVoucherId,
          ...changes,
        } as Prisma.InputJsonValue,
      },
    });
  const skip = async (
    reason: Exclude<VoucherRestoreResult, { restored: true }>["reason"],
  ) => {
    await audit("VOUCHER_RESTORE_SKIPPED", { reason });
    return { restored: false as const, reason };
  };

  if (!voucherRefundPolicy().restoreOnRefund) return skip("POLICY_DISABLED");

  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { status: true, machineBooking: { select: { status: true } } },
  });
  const started = await tx.iotCommand.count({
    where: {
      orderId,
      command: "START_MACHINE",
      status: { in: STARTED_COMMAND },
    },
  });
  const consumed =
    (order?.machineBooking &&
      CONSUMED_BOOKING.includes(order.machineBooking.status)) ||
    started > 0 ||
    (order && PROCESSED_ORDER.includes(order.status));
  if (consumed) return skip("SERVICE_CONSUMED");

  const v = redemption.userVoucher;
  if (v.expiresAt && v.expiresAt.getTime() <= now.getTime())
    return skip("VOUCHER_EXPIRED");

  const reversed = await tx.voucherRedemption.updateMany({
    where: { id: redemption.id, status: "APPLIED" },
    data: { status: "REVERSED", reversedAt: now },
  });
  if (reversed.count !== 1)
    return { restored: false, reason: "ALREADY_REVERSED" };
  await tx.userVoucher.update({
    where: { id: v.id },
    data: { status: VoucherStatus.ACTIVE, usedAt: null },
  });
  await audit("VOUCHER_RESTORED", { reason: "REFUND_SERVICE_NOT_CONSUMED" });
  return { restored: true };
}
