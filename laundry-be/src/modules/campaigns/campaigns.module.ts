import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CampaignService } from './campaign.service';
import { CampaignsController } from './campaigns.controller';
import { HappyHourController } from './happy-hour.controller';
import { CampaignSchedulerProcessor } from './campaign-scheduler.processor';
import { CampaignSchedulerService } from './campaign-scheduler.service';
import { VouchersModule } from '../vouchers/vouchers.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [
    VouchersModule,
    WalletsModule,
    BullModule.registerQueue({ name: 'campaign-scheduler' }),
  ],
  controllers: [CampaignsController, HappyHourController],
  providers: [CampaignService, CampaignSchedulerProcessor, CampaignSchedulerService],
  exports: [CampaignService],
})
export class CampaignsModule {}
