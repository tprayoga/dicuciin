/** Nomor order/member unik di bawah request paralel (PostgreSQL nyata). */
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { generateDailySequence } from '../../src/common/utils/sequence.util';
import { createCustomer, createOutlet, resetDb } from './helpers';

describe('generateDailySequence — konkurensi', () => {
  const prisma = new PrismaService();
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(() => resetDb(prisma));

  it('30 pemanggilan paralel → 30 nomor unik dan berurutan', async () => {
    const codes = await Promise.all(
      Array.from({ length: 30 }, () => generateDailySequence(prisma, 'ORD', 'order', 'orderNumber', 6)),
    );
    expect(new Set(codes).size).toBe(30);
    const seqs = codes.map((c) => Number(c.split('-').pop())).sort((a, b) => a - b);
    expect(seqs[0]).toBe(1);
    expect(seqs[29]).toBe(30);
  });

  it('melanjutkan nomor yang sudah ada sebelum tabel penghitung dipakai', async () => {
    const outlet = await createOutlet(prisma);
    const c = await createCustomer(prisma);
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await prisma.order.create({
      data: {
        orderNumber: `ORD-${day}-000041`, customerId: c.customer.id, outletId: outlet.id,
        sourcePlatform: 'MOBILE_APP', subtotal: 0, totalAmount: 0,
      },
    });
    expect(await generateDailySequence(prisma, 'ORD', 'order', 'orderNumber', 6)).toBe(`ORD-${day}-000042`);
  });
});
