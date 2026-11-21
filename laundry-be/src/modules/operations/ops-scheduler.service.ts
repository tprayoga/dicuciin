import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

export const OPS_QUEUE = "ops-scheduler";
export const OPS_JOBS = [
  "expire-holds",
  "complete-bookings",
  "recover-stuck",
] as const;

/**
 * Mendaftarkan job berulang pemeliharaan booking/pembayaran (Batch 2).
 * `jobId` tetap → restart/instance ganda tidak menumpuk jadwal. Interval
 * via OPS_SCHEDULER_EVERY_MS (default 60 detik); OPS_SCHEDULER_ENABLED=false
 * untuk menonaktifkan pendaftaran (mis. instance khusus API).
 */
@Injectable()
export class OpsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(OpsSchedulerService.name);

  constructor(@InjectQueue(OPS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    if (process.env.OPS_SCHEDULER_ENABLED === "false") {
      this.logger.warn(
        "Ops scheduler dinonaktifkan (OPS_SCHEDULER_ENABLED=false)",
      );
      return;
    }
    const every = Number(process.env.OPS_SCHEDULER_EVERY_MS ?? 60_000);
    for (const name of OPS_JOBS) {
      try {
        await this.queue.add(
          name,
          {},
          {
            repeat: { every },
            jobId: `ops-${name}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 5_000 },
            removeOnComplete: true,
            removeOnFail: 200,
          },
        );
      } catch (err) {
        this.logger.error(
          `Gagal mendaftarkan job ${name}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `Ops scheduler terdaftar (${OPS_JOBS.join(", ")}; setiap ${every} ms)`,
    );
  }
}
