import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('payment-callback')
export class PaymentCallbackProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentCallbackProcessor.name);

  async process(job: Job) {
    this.logger.log(`Processing payment callback job: ${job.name}`);

    switch (job.name) {
      case 'handle-callback':
        await this.handleCallback(job.data);
        break;
      case 'check-status':
        await this.checkPaymentStatus(job.data);
        break;
      default:
        this.logger.warn(`Unknown payment callback job: ${job.name}`);
    }
  }

  private async handleCallback(data: { paymentId: string; status: string; externalId: string }) {
    this.logger.log(`[PAYMENT] Callback for payment ${data.paymentId}: ${data.status}`);
    // TODO: update payment status in database, trigger order status update
  }

  private async checkPaymentStatus(data: { paymentId: string }) {
    this.logger.log(`[PAYMENT] Check status for payment ${data.paymentId}`);
    // TODO: query payment gateway API for payment status
  }
}
