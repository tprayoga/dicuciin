import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { PaymentsModule } from "../payments/payments.module";
import { IotModule } from "../iot/iot.module";
import { BookingMaintenanceService } from "./booking-maintenance.service";
import { OpsSchedulerService, OPS_QUEUE } from "./ops-scheduler.service";
import { OpsSchedulerProcessor } from "./ops-scheduler.processor";

@Module({
  imports: [
    PaymentsModule,
    IotModule,
    BullModule.registerQueue({ name: OPS_QUEUE }),
  ],
  providers: [
    BookingMaintenanceService,
    OpsSchedulerService,
    OpsSchedulerProcessor,
  ],
  exports: [BookingMaintenanceService],
})
export class OperationsModule {}
