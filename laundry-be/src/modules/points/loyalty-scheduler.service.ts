import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

/**
 * Mendaftarkan repeatable job harian untuk kedaluwarsa poin (default cron 01:30).
 * Cron bisa di-override via env LOYALTY_EXPIRY_CRON. `jobId` tetap → tidak menumpuk
 * job duplikat saat restart. Pola sama dengan CampaignSchedulerService.
 */
@Injectable()
export class LoyaltySchedulerService implements OnModuleInit {
  private readonly logger = new Logger(LoyaltySchedulerService.name);

  constructor(@InjectQueue('loyalty-scheduler') private readonly queue: Queue) {}

  async onModuleInit() {
    const pattern = process.env.LOYALTY_EXPIRY_CRON ?? '30 1 * * *';
    try {
      await this.queue.add(
        'point-expiry',
        {},
        {
          repeat: { pattern },
          jobId: 'loyalty-point-expiry',
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
      this.logger.log(`Loyalty point-expiry scheduler terdaftar (cron: ${pattern})`);
    } catch (err) {
      // Jangan gagalkan boot bila Redis belum siap; scheduler bisa didaftar ulang.
      this.logger.error(
        `Gagal mendaftarkan loyalty point-expiry scheduler: ${(err as Error).message}`,
      );
    }
  }
}
