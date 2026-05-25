import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('notification')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  async process(job: Job) {
    this.logger.log(`Processing notification job: ${job.name}`);

    switch (job.name) {
      case 'send-email':
        await this.sendEmail(job.data);
        break;
      case 'send-sms':
        await this.sendSms(job.data);
        break;
      case 'send-push':
        await this.sendPush(job.data);
        break;
      default:
        this.logger.warn(`Unknown notification job: ${job.name}`);
    }
  }

  private async sendEmail(data: { to: string; subject: string; body: string }) {
    this.logger.log(`[EMAIL] To: ${data.to} | Subject: ${data.subject}`);
    // TODO: integrate email provider (Nodemailer, SendGrid, etc.)
  }

  private async sendSms(data: { to: string; message: string }) {
    this.logger.log(`[SMS] To: ${data.to} | Message: ${data.message}`);
    // TODO: integrate SMS provider (Twilio, etc.)
  }

  private async sendPush(data: { userId: string; title: string; body: string }) {
    this.logger.log(`[PUSH] UserId: ${data.userId} | Title: ${data.title}`);
    // TODO: integrate FCM/APNs
  }
}
