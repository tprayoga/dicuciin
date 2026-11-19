import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';

/** Kosongkan semua tabel aplikasi (kecuali histori migrasi). */
export async function resetDb(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

const short = () => randomUUID().slice(0, 8);

export async function createOutlet(prisma: PrismaClient, name = 'Outlet') {
  return prisma.outlet.create({
    data: { name: `${name} ${short()}`, code: `OUT-${short()}`, address: 'Jl. Uji', phone: '0800' },
  });
}

export async function createUser(prisma: PrismaClient, role: UserRole, name: string = role) {
  return prisma.user.create({
    data: { name, email: `${short()}@uji.test`, passwordHash: 'x', role },
  });
}

export async function createCustomer(prisma: PrismaClient, opts: { balance?: number } = {}) {
  const user = await createUser(prisma, UserRole.CUSTOMER, `Customer ${short()}`);
  const customer = await prisma.customer.create({
    data: { userId: user.id, memberCode: `MBR-${short()}` },
  });
  const wallet = await prisma.wallet.create({
    data: { customerId: customer.id, balance: new Prisma.Decimal(opts.balance ?? 0) },
  });
  return { user, customer, wallet, auth: { userId: user.id, role: UserRole.CUSTOMER } };
}

export async function createMachine(
  prisma: PrismaClient,
  outletId: string,
  type: 'WASHING_MACHINE' | 'DRYER_MACHINE' = 'WASHING_MACHINE',
) {
  return prisma.iotDevice.create({
    data: {
      outletId,
      deviceCode: `M-${short()}`,
      deviceType: type,
      name: 'Mesin Uji',
      status: 'ONLINE',
    },
  });
}

export async function createServiceWithPrice(prisma: PrismaClient, outletId: string, price = 10000) {
  const service = await prisma.service.create({
    data: { name: `Cuci ${short()}`, serviceType: 'WASH', machineType: 'WASHER', estimateMinutes: 25 },
  });
  await prisma.servicePrice.create({
    data: { serviceId: service.id, outletId, pricingType: 'FIXED', price: new Prisma.Decimal(price), unit: 'CYCLE' },
  });
  return service;
}

export const inMinutes = (m: number) => new Date(Date.now() + m * 60_000);
