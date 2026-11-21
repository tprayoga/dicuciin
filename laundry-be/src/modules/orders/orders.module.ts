import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PromosModule } from '../promos/promos.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PromosModule, PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
