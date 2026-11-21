/**
 * Pencatatan rekonsiliasi keuangan (Batch 2) — dipakai DI DALAM transaksi
 * pemanggil (settlement, scheduler). Idempoten: satu baris per
 * (paymentId, reason) lewat `createMany({ skipDuplicates })` (ON CONFLICT DO
 * NOTHING) sehingga webhook/job ganda tidak menggandakan catatan dan tidak
 * menggagalkan transaksi.
 */
import {
  Prisma,
  ReconciliationReason,
  ReconciliationStatus,
} from "@prisma/client";

export interface ReconciliationInput {
  payment: {
    id: string;
    amount: Prisma.Decimal;
    provider?: string | null;
    externalId?: string | null;
  };
  order: { id: string; customerId: string | null };
  reason: ReconciliationReason;
  note: string;
  status?: ReconciliationStatus;
  requestedBy?: string;
  refundAmount?: Prisma.Decimal;
}

export async function recordReconciliationInTx(
  tx: Prisma.TransactionClient,
  input: ReconciliationInput,
) {
  const created = await tx.paymentReconciliation.createMany({
    data: [
      {
        paymentId: input.payment.id,
        orderId: input.order.id,
        customerId: input.order.customerId,
        amount: input.payment.amount,
        refundAmount: input.refundAmount ?? input.payment.amount,
        provider: input.payment.provider ?? null,
        providerRef: input.payment.externalId ?? null,
        reason: input.reason,
        status: input.status ?? ReconciliationStatus.OPEN,
        note: input.note,
        requestedBy: input.requestedBy ?? null,
      },
    ],
    skipDuplicates: true,
  });
  const row = await tx.paymentReconciliation.findUniqueOrThrow({
    where: {
      paymentId_reason: { paymentId: input.payment.id, reason: input.reason },
    },
  });
  if (created.count === 1) {
    await tx.auditLog.create({
      data: {
        userId: input.requestedBy ?? null,
        action: "RECONCILIATION_CREATED",
        entity: "PaymentReconciliation",
        entityId: row.id,
        changes: {
          reason: input.reason,
          status: row.status,
          paymentId: input.payment.id,
          orderId: input.order.id,
          amount: input.payment.amount.toString(),
          note: input.note,
        },
      },
    });
  }
  return { row, created: created.count === 1 };
}

/** Alasan yang berarti order-nya sendiri yang di-refund (bukan kelebihan dana). */
export const ORDER_REFUND_REASONS: ReconciliationReason[] = [
  ReconciliationReason.CUSTOMER_REQUEST,
  ReconciliationReason.PAID_BOOKING_UNAVAILABLE,
  ReconciliationReason.PAID_NOT_USED,
];
