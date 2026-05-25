import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueuesService {
  constructor(
    @InjectQueue('notification') private notificationQueue: Queue,
    @InjectQueue('iot-command') private iotCommandQueue: Queue,
    @InjectQueue('payment-callback') private paymentCallbackQueue: Queue,
  ) {}

  async sendEmailNotification(to: string, subject: string, body: string) {
    return this.notificationQueue.add('send-email', { to, subject, body });
  }

  async sendSmsNotification(to: string, message: string) {
    return this.notificationQueue.add('send-sms', { to, message });
  }

  async sendPushNotification(userId: string, title: string, body: string) {
    return this.notificationQueue.add('send-push', { userId, title, body });
  }

  async publishIotCommand(deviceCode: string, command: string, payload: any) {
    return this.iotCommandQueue.add('publish-command', { deviceCode, command, payload });
  }

  async printReceipt(deviceCode: string, orderId: string) {
    return this.iotCommandQueue.add('print-receipt', { deviceCode, orderId });
  }

  async printLabel(deviceCode: string, orderId: string) {
    return this.iotCommandQueue.add('print-label', { deviceCode, orderId });
  }

  async openLocker(deviceCode: string, lockerId: string) {
    return this.iotCommandQueue.add('open-locker', { deviceCode, lockerId });
  }

  async handlePaymentCallback(paymentId: string, status: string, externalId: string) {
    return this.paymentCallbackQueue.add('handle-callback', { paymentId, status, externalId });
  }

  async checkPaymentStatus(paymentId: string) {
    return this.paymentCallbackQueue.add('check-status', { paymentId });
  }
}
