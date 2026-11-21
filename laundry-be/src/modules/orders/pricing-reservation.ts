/**
 * Batch 3 (T10) — reservasi diskon yang dipegang sebuah order.
 *
 * Harga order dihitung SEKALI oleh mesin pricing tunggal saat order dibuat
 * (voucher, happy hour, B2B, promo) dan apa pun metode bayarnya (QRIS, VA,
 * saldo) total itulah yang ditagih. Agar pelunasan tidak pernah gagal SETELAH
 * uang diterima, sumber diskon yang terbatas DIRESERVASI saat order dibuat:
 *
 *   order dibuat ──reserve──> voucher USED + redemption RESERVED, kuota happy hour terpakai
 *   order PAID   ──confirm──> redemption APPLIED, pemakaian aturan B2B dicatat
 *   order batal  ──release──> voucher ACTIVE lagi, kuota dikembalikan (sekali)
 *
 * Semua fungsi berjalan di DALAM transaksi pemanggil (yang mengunci baris order).
 * `voucher_redemptions.userVoucherId` unik → satu voucher tidak bisa dipegang
 * dua order sekaligus walau request paralel.
 */
import { ConflictException } from "@nestjs/common";
import { Prisma, VoucherStatus } from "@prisma/client";

export interface OrderPricingSnapshot {
  version: 1;
  segment: string;
  basePrice: number;
  b2bDiscount: number;
  happyHourDiscount: number;
  voucherDiscount: number;
  promoDiscount: number;
  deliveryFee: number;
  spendingAmount: number;
  finalAmount: number;
  pointsToEarn: number;
  cashbackToCredit: number;
  voucherId?: string | null;
  voucherCode?: string | null;
  promoId?: string | null;
  happyHourRules: {
    ruleId: string;
    quantity: number;
    discountAmount: number;
  }[];
  b2bPricingRules: { ruleId: string; discountAmount: number }[];
  /** Estimasi durasi pemakaian mesin (menit) — dihitung server. */
  estimatedMinutes: number | null;
}

export function readSnapshot(
  value: Prisma.JsonValue | null | undefined,
): OrderPricingSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return v.version === 1 ? (v as unknown as OrderPricingSnapshot) : null;
}

export async function reserveOrderPricingInTx(
  tx: Prisma.TransactionClient,
  input: { orderId: string; snapshot: OrderPricingSnapshot },
) {
  const { snapshot } = input;
  for (const rule of snapshot.happyHourRules) {
    const quantity = rule.quantity || 1;
    const updated = await tx.$executeRaw`
      UPDATE "happy_hour_rules"
      SET "usedQuota" = "usedQuota" + ${quantity}
      WHERE "id" = ${rule.ruleId}
        AND ("quota" IS NULL OR "usedQuota" + ${quantity} <= "quota")`;
    if (Number(updated) === 0) {
      throw new ConflictException(
        "Kuota happy hour sudah habis. Muat ulang harga.",
      );
    }
  }

  if (snapshot.voucherId) {
    await tx.$queryRaw`SELECT id FROM user_vouchers WHERE id = ${snapshot.voucherId} FOR UPDATE`;
    const voucher = await tx.userVoucher.findUnique({
      where: { id: snapshot.voucherId },
    });
    if (!voucher || voucher.status !== VoucherStatus.ACTIVE) {
      throw new ConflictException(
        "Voucher sudah dipakai di pesanan lain atau tidak aktif.",
      );
    }
    if (voucher.expiresAt && voucher.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException("Voucher sudah kedaluwarsa.");
    }
    await tx.userVoucher.update({
      where: { id: voucher.id },
      data: { status: VoucherStatus.USED, usedAt: new Date() },
    });
    const previous = await tx.voucherRedemption.findUnique({
      where: { userVoucherId: voucher.id },
    });
    const data = {
      orderId: input.orderId,
      customerId: voucher.customerId,
      partnerId: voucher.partnerId,
      discountApplied: new Prisma.Decimal(snapshot.voucherDiscount),
      status: "RESERVED",
      redeemedAt: new Date(),
      reversedAt: null,
    };
    if (previous) {
      // Baris lama (reservasi dilepas / redemption dibalik) dipakai ulang —
      // userVoucherId unik. Riwayat order lama tetap di order_status_logs.
      if (previous.status === "RESERVED" || previous.status === "APPLIED") {
        throw new ConflictException("Voucher sudah dipakai di pesanan lain.");
      }
      await tx.voucherRedemption.update({ where: { id: previous.id }, data });
    } else {
      await tx.voucherRedemption.create({
        data: { userVoucherId: voucher.id, ...data },
      });
    }
  }
}

/** Order PAID: reservasi menjadi pemakaian final. Idempoten. */
export async function confirmOrderPricingInTx(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    partnerId: string | null;
    pricingSnapshot: Prisma.JsonValue | null;
  },
) {
  const snapshot = readSnapshot(order.pricingSnapshot);
  if (!snapshot) return;
  await tx.voucherRedemption.updateMany({
    where: { orderId: order.id, status: "RESERVED" },
    data: { status: "APPLIED", redeemedAt: new Date() },
  });
  if (snapshot.b2bPricingRules.length && order.partnerId) {
    await tx.b2BPricingRuleUsage.createMany({
      data: snapshot.b2bPricingRules.map((rule) => ({
        orderId: order.id,
        ruleId: rule.ruleId,
        partnerId: order.partnerId!,
        discountAmount: new Prisma.Decimal(rule.discountAmount),
      })),
      skipDuplicates: true,
    });
  }
}

/** Order batal/kedaluwarsa sebelum dibayar: kembalikan voucher & kuota. Sekali saja. */
export async function releaseOrderPricingInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      pricingSnapshot: true,
      pricingReleasedAt: true,
      paidPaymentId: true,
    },
  });
  const snapshot = readSnapshot(order?.pricingSnapshot);
  if (!order || !snapshot || order.pricingReleasedAt || order.paidPaymentId)
    return false;

  for (const rule of snapshot.happyHourRules) {
    const quantity = rule.quantity || 1;
    await tx.$executeRaw`
      UPDATE "happy_hour_rules"
      SET "usedQuota" = GREATEST(0, "usedQuota" - ${quantity})
      WHERE "id" = ${rule.ruleId}`;
  }
  const reserved = await tx.voucherRedemption.findMany({
    where: { orderId, status: "RESERVED" },
  });
  for (const r of reserved) {
    await tx.voucherRedemption.update({
      where: { id: r.id },
      data: { status: "RELEASED", reversedAt: new Date() },
    });
    const voucher = await tx.userVoucher.findUnique({
      where: { id: r.userVoucherId },
    });
    if (voucher && voucher.status === VoucherStatus.USED) {
      const expired =
        !!voucher.expiresAt && voucher.expiresAt.getTime() <= Date.now();
      await tx.userVoucher.update({
        where: { id: voucher.id },
        data: {
          status: expired ? VoucherStatus.EXPIRED : VoucherStatus.ACTIVE,
          usedAt: null,
        },
      });
    }
  }
  await tx.order.update({
    where: { id: orderId },
    data: { pricingReleasedAt: new Date() },
  });
  return true;
}
