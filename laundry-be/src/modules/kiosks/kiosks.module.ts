import { Module } from '@nestjs/common';
import { KiosksController } from './kiosks.controller';
import { KiosksService } from './kiosks.service';
import { OrdersModule } from '../orders/orders.module';
import { BookingsModule } from '../bookings/bookings.module';
import { PaymentsModule } from '../payments/payments.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [OrdersModule, BookingsModule, PaymentsModule, TransactionsModule],
  controllers: [KiosksController],
  providers: [KiosksService],
  exports: [KiosksService],
})
export class KiosksModule {}
