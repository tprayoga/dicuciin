import { Module } from '@nestjs/common';
import { KiosksController } from './kiosks.controller';
import { KiosksService } from './kiosks.service';
import { OrdersModule } from '../orders/orders.module';
import { BookingsModule } from '../bookings/bookings.module';
import { PaymentsModule } from '../payments/payments.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { IotModule } from '../iot/iot.module';

@Module({
  imports: [OrdersModule, BookingsModule, PaymentsModule, TransactionsModule, IotModule],
  controllers: [KiosksController],
  providers: [KiosksService],
  exports: [KiosksService],
})
export class KiosksModule {}
