import { Module } from "@nestjs/common";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { IotModule } from "../iot/iot.module";
import { OrdersModule } from "../orders/orders.module";

@Module({
  imports: [IotModule, OrdersModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
