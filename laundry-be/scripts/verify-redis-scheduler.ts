/**
 * Verifikasi runtime scheduler (READ-ONLY). Tidak menghapus queue, tidak flush Redis,
 * tidak reset DB, tidak menyentuh campaign/voucher/point existing.
 *
 * Cek:
 *  - Redis reachable
 *  - Queue & repeatable jobs terdaftar (campaign-scheduler, loyalty-scheduler)
 *  - Point expiry DRY-RUN (hanya menghitung, tidak mutasi)
 *  - Status campaign scheduler (cron)
 *
 * Jalankan: npm run verify:redis-scheduler
 * Bila Redis mati: output error jelas + exit code 1 (tidak crash diam-diam).
 */
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PointService } from '../src/modules/points/point.service';
import { VoucherService } from '../src/modules/vouchers/voucher.service';
import { LoyaltyConfigService } from '../src/modules/loyalty-config/loyalty-config.service';

const QUEUES = ['campaign-scheduler', 'loyalty-scheduler'];

async function main() {
  const host = process.env.REDIS_HOST ?? 'localhost';
  const port = Number(process.env.REDIS_PORT ?? 6379);

  const result: Record<string, unknown> = {
    redis: { host, port, reachable: false },
    queues: {},
  };

  // 1) Redis reachable (fail-fast, tanpa retry tak berujung).
  const redis = new Redis({
    host,
    port,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    const pong = await redis.ping();
    (result.redis as any).reachable = pong === 'PONG';
  } catch (err) {
    (result.redis as any).reachable = false;
    (result.redis as any).error = (err as Error).message;
  }

  if (!(result.redis as any).reachable) {
    redis.disconnect();
    console.error(
      JSON.stringify(
        {
          ok: false,
          ...result,
          hint:
            'Redis tidak terjangkau. Hidupkan dengan: npm run docker:up (atau `docker compose up -d redis`), lalu ulangi.',
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  // 2) Repeatable jobs terdaftar (read-only). Terdaftar saat app booting.
  const queues: Record<string, unknown> = {};
  for (const name of QUEUES) {
    const q = new Queue(name, { connection: { host, port } });
    try {
      const repeatables = await q.getRepeatableJobs();
      queues[name] = repeatables.map((r) => ({
        name: r.name,
        pattern: r.pattern,
        next: r.next ? new Date(r.next).toISOString() : null,
      }));
    } finally {
      await q.close();
    }
  }
  result.queues = queues;
  result.campaignScheduler = {
    cron: process.env.CAMPAIGN_CRON ?? '0 1 * * *',
    registered: ((queues['campaign-scheduler'] as unknown[]) ?? []).length > 0,
  };
  result.loyaltyScheduler = {
    cron: process.env.LOYALTY_EXPIRY_CRON ?? '30 1 * * *',
    registered: ((queues['loyalty-scheduler'] as unknown[]) ?? []).length > 0,
  };
  if (
    !(result.campaignScheduler as any).registered ||
    !(result.loyaltyScheduler as any).registered
  ) {
    (result as any).note =
      'Repeatable job didaftarkan saat aplikasi NestJS booting (OnModuleInit). Jika kosong, jalankan `npm run start` minimal sekali dengan Redis hidup.';
  }

  // 3) Point expiry DRY-RUN (butuh DB; bila tak ada, skip dengan alasan jelas).
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const point = new PointService(
      prisma,
      new VoucherService(prisma),
      new LoyaltyConfigService(),
    );
    result.pointExpiryDryRun = await point.expireDuePoints(new Date(), { dryRun: true });
  } catch (err) {
    result.pointExpiryDryRun = { skipped: true, reason: (err as Error).message };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }

  redis.disconnect();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
