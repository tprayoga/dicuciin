import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { BookingMaintenanceService } from "./booking-maintenance.service";
import { OPS_QUEUE } from "./ops-scheduler.service";

/**
 * Worker pemeliharaan. Aman dijalankan di banyak instance sekaligus: logika
 * job memakai kunci baris PostgreSQL + transisi bersyarat (lihat
 * BookingMaintenanceService). Error dilempar ulang → BullMQ mencoba ulang
 * (attempts 3, backoff eksponensial).
 */
@Processor(OPS_QUEUE)
export class OpsSchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(OpsSchedulerProcessor.name);

  constructor(private readonly maintenance: BookingMaintenanceService) {
    super();
  }

  async process(job: Job) {
    switch (job.name) {
      case "expire-holds":
        return this.log(job.name, await this.maintenance.expireHolds());
      case "complete-bookings":
        return this.log(job.name, await this.maintenance.completeBookings());
      case "recover-stuck":
        return this.log(job.name, await this.maintenance.recoverStuck());
      default:
        this.logger.warn(`Job ops tidak dikenal: ${job.name}`);
    }
  }

  private log<T extends Record<string, number>>(name: string, result: T) {
    if (Object.values(result).some((v) => v > 0)) {
      this.logger.log(`${name}: ${JSON.stringify(result)}`);
    }
    return result;
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Job ${job.name} gagal (percobaan ${job.attemptsMade}): ${err.message}`,
    );
  }
}
