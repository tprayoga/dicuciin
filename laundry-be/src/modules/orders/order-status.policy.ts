import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

/**
 * Status yang hanya boleh dihasilkan alur sistem, bukan diubah manual lewat
 * PATCH /orders/:id/status:
 * - PAID: hanya dari pembayaran terverifikasi (webhook gateway / saldo).
 * - REFUNDED: hanya dari alur refund.
 * - CANCELLED: lewat POST /orders/:id/cancel (aturan sendiri).
 * - DRAFT / WAITING_PAYMENT: status awal, tidak boleh dikembalikan.
 */
export const SYSTEM_ONLY_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.DRAFT,
  OrderStatus.WAITING_PAYMENT,
  OrderStatus.PAID,
  OrderStatus.REFUNDED,
  OrderStatus.CANCELLED,
]);

/** Status sumber yang boleh diproses manual oleh staf (order sudah dibayar). */
export const MANUAL_SOURCE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PAID,
  OrderStatus.RECEIVED,
  OrderStatus.WASHING,
  OrderStatus.DRYING,
  OrderStatus.IRONING,
  OrderStatus.PACKING,
  OrderStatus.READY_PICKUP,
  OrderStatus.OUT_FOR_DELIVERY,
]);

/** Status order yang belum dibayar (boleh dibatalkan customer sendiri). */
export const UNPAID_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.DRAFT,
  OrderStatus.WAITING_PAYMENT,
]);

/** Status final: tidak bisa diubah/dibatalkan lagi. */
export const FINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
]);

export function assertManualTransition(from: OrderStatus, to: OrderStatus): void {
  if (SYSTEM_ONLY_STATUSES.has(to)) {
    throw new BadRequestException(
      `Status ${to} tidak bisa diubah manual (hanya dari alur pembayaran/refund/pembatalan)`,
    );
  }
  if (!MANUAL_SOURCE_STATUSES.has(from)) {
    throw new BadRequestException(
      `Order berstatus ${from} tidak bisa diproses manual (harus sudah dibayar dan belum final)`,
    );
  }
}
