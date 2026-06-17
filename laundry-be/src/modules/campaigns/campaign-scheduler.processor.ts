import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CampaignService } from './campaign.service';

/**
 * Worker kampanye terjadwal (BullMQ). Job `daily` mengeksekusi semua kampanye
 * berbasis tanggal (birthday/anniversary/LTNS, + monthly-tier di tanggal 1).
 * Mengikuti pola processor di modules/queues/processors.
 */
@Processor('campaign-scheduler')
export class CampaignSchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignSchedulerProcessor.name);

  constructor(private readonly campaignService: CampaignService) {
    super();
  }

  async process(job: Job) {
    this.logger.log(`Processing campaign job: ${job.name}`);
    switch (job.name) {
      case 'daily':
        await this.campaignService.runDaily(new Date());
        break;
      default:
        this.logger.warn(`Unknown campaign job: ${job.name}`);
    }
  }
}
