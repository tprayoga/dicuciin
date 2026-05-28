import { Injectable, Logger } from '@nestjs/common';

export interface NotificationPayload {
  userId?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * NotificationsService — stub untuk push notification.
 * Saat ini hanya log ke console. Implementasi penuh bisa
 * menggunakan Firebase FCM, OneSignal, atau MQTT push.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async send(payload: NotificationPayload): Promise<void> {
    this.logger.log(
      `[Notification] To: ${payload.userId ?? 'broadcast'} | ${payload.title}: ${payload.body}`,
    );
    // TODO: Implementasi FCM / OneSignal / WebSocket push
  }

  async sendBulk(userIds: string[], payload: Omit<NotificationPayload, 'userId'>): Promise<void> {
    for (const userId of userIds) {
      await this.send({ ...payload, userId });
    }
  }
}
