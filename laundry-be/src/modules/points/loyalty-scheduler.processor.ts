import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PointService } from './point.service';

/**
 * Worker terjadwal loyalty (BullMQ). Job `point-expiry` men-debit poin yang sudah
 * `expiresAt <= now` secara idempoten. Observability: log start/result/failed +
 * jumlah item diproses. Mengikuti pola CampaignSchedulerProcessor.
 */
@Processor('loyalty-scheduler')
export class LoyaltySchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(LoyaltySchedulerProcessor.name);

  constructor(private readonly pointService: PointService) {
    super();
  }

  async process(job: Job) {
    this.logger.log(`Processing loyalty job: ${job.name}`);
    switch (job.name) {
      case 'point-expiry': {
        const result = await this.pointService.expireDuePoints(new Date());
        this.logger.log(
          `point-expiry selesai: scanned=${result.scanned} expiredLedgers=${result.expiredLedgers} expiredPoints=${result.expiredPoints}`,
        );
        return result;
      }
      default:
        this.logger.warn(`Unknown loyalty job: ${job.name}`);
    }
  }
}
