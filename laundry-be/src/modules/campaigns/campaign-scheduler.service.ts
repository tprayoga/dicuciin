import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Mendaftarkan repeatable job harian untuk kampanye terjadwal (cron 01:00).
 * Cron bisa di-override via env CAMPAIGN_CRON. `jobId` tetap → tidak menumpuk
 * job duplikat saat restart.
 */
@Injectable()
export class CampaignSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CampaignSchedulerService.name);

  constructor(@InjectQueue('campaign-scheduler') private readonly queue: Queue) {}

  async onModuleInit() {
    const pattern = process.env.CAMPAIGN_CRON ?? '0 1 * * *';
    try {
      await this.queue.add(
        'daily',
        {},
        {
          repeat: { pattern },
          jobId: 'campaign-daily',
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
      this.logger.log(`Campaign daily scheduler terdaftar (cron: ${pattern})`);
    } catch (err) {
      // Jangan gagalkan boot bila Redis belum siap; scheduler bisa didaftar ulang.
      this.logger.error(`Gagal mendaftarkan campaign scheduler: ${(err as Error).message}`);
    }
  }
}
