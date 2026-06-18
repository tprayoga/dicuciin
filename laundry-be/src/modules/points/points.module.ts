import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PointService } from './point.service';
import { PointsController } from './points.controller';
import { VouchersModule } from '../vouchers/vouchers.module';
import { LoyaltySchedulerService } from './loyalty-scheduler.service';
import { LoyaltySchedulerProcessor } from './loyalty-scheduler.processor';

@Module({
  imports: [VouchersModule, BullModule.registerQueue({ name: 'loyalty-scheduler' })],
  controllers: [PointsController],
  providers: [PointService, LoyaltySchedulerService, LoyaltySchedulerProcessor],
  exports: [PointService],
})
export class PointsModule {}
