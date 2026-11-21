import { Prisma } from '@prisma/client';

/**
 * Batch 6 (R1) — notifikasi dalam aplikasi.
 *
 * Ditulis di DALAM transaksi kejadiannya (order lunas, cucian selesai, top-up
 * masuk), sehingga notifikasi ada bila & hanya bila kejadiannya ter-commit.
 * `dedupeKey` unik + ON CONFLICT DO NOTHING → webhook/scheduler yang diulang
 * tidak menggandakan notifikasi dan tidak pernah menggagalkan transaksi.
 */
export type NotificationType = 'ORDER_PAID' | 'ORDER_COMPLETED' | 'TOPUP_PAID' | 'ORDER_REFUNDED';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  dedupeKey: string;
}

export async function notifyUserInTx(tx: Prisma.TransactionClient, userId: string | null | undefined, n: NotificationInput) {
  if (!userId) return;
  await tx.notification.createMany({
    data: [
      {
        userId,
        type: n.type,
        title: n.title,
        body: n.body,
        data: (n.data ?? undefined) as Prisma.InputJsonValue | undefined,
        dedupeKey: n.dedupeKey,
      },
    ],
    skipDuplicates: true,
  });
}

/** Notifikasi ke pemilik customer (order tamu kiosk tanpa customer → dilewati). */
export async function notifyCustomerInTx(
  tx: Prisma.TransactionClient,
  customerId: string | null | undefined,
  n: NotificationInput,
) {
  if (!customerId) return;
  const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { userId: true } });
  await notifyUserInTx(tx, customer?.userId, n);
}

export const rupiah = (value: unknown) =>
  `Rp${Math.round(Number(value ?? 0)).toLocaleString('id-ID')}`;
