import { Module } from '@nestjs/common';
import { PointService } from './point.service';
import { PointsController } from './points.controller';
import { VouchersModule } from '../vouchers/vouchers.module';

@Module({
  imports: [VouchersModule],
  controllers: [PointsController],
  providers: [PointService],
  exports: [PointService],
})
export class PointsModule {}
