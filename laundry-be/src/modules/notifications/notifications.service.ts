import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface NotificationPayload {
  userId?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Notifikasi pengguna.
 *
 * Batch 6 (R1): kotak notifikasi dalam aplikasi berbasis tabel `notifications`
 * (ditulis lewat `notifyUserInTx` di transaksi kejadiannya). Push (FCM/OneSignal)
 * BELUM ada — `send()` tetap hanya mencatat log.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(payload: NotificationPayload): Promise<void> {
    this.logger.log(
      `[Notification] To: ${payload.userId ?? 'broadcast'} | ${payload.title}: ${payload.body}`,
    );
  }

  async sendBulk(userIds: string[], payload: Omit<NotificationPayload, 'userId'>): Promise<void> {
    for (const userId of userIds) {
      await this.send({ ...payload, userId });
    }
  }

  async listForUser(userId: string, limit = 30, before?: string) {
    const take = Math.min(Math.max(limit, 1), 100);
    const beforeDate = before ? new Date(before) : undefined;
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: {
          userId,
          ...(beforeDate && !Number.isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unreadCount };
  }

  async markRead(userId: string, id: string) {
    const r = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (r.count === 0) {
      // Milik orang lain / tidak ada → 404 (tidak membocorkan keberadaan).
      const own = await this.prisma.notification.count({ where: { id, userId } });
      if (!own) throw new NotFoundException('Notifikasi tidak ditemukan');
    }
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const r = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: r.count };
  }
}
