/**
 * Batch 5 (T6) — laporan & penerapan normalisasi nomor HP data lama
 * (PostgreSQL nyata).
 */
import { PrismaClient, UserRole } from '@prisma/client';
import {
  applyPhoneNormalization,
  buildPhoneNormalizationReport,
} from '../../src/modules/users/phone-normalization';
import { resetDb } from './helpers';

describe('Batch 5 — normalisasi nomor HP data lama (PostgreSQL nyata)', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());
  beforeEach(() => resetDb(prisma));

  const mk = (phone: string | null, name = 'U') =>
    prisma.user.create({ data: { name, phone, passwordHash: 'x', role: UserRole.CUSTOMER } });

  it('laporan dry-run mengelompokkan baris & TIDAK mengubah data', async () => {
    const a = await mk('6281200000001');
    const b = await mk('081200000002');
    const c = await mk('+62 812-0000-0003');
    const d1 = await mk('081200000004');
    const d2 = await mk('+6281200000004');
    const e = await mk('12345');
    await mk(null);

    const report = await buildPhoneNormalizationReport(prisma);
    expect(report.totals).toEqual({ CANONICAL: 1, NORMALIZE: 2, CONFLICT: 2, INVALID: 1 });
    const cat = Object.fromEntries(report.rows.map((r) => [r.userId, r.category]));
    expect(cat[a.id]).toBe('CANONICAL');
    expect(cat[b.id]).toBe('NORMALIZE');
    expect(cat[c.id]).toBe('NORMALIZE');
    expect(cat[d1.id]).toBe('CONFLICT');
    expect(cat[d2.id]).toBe('CONFLICT');
    expect(cat[e.id]).toBe('INVALID');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).phone).toBe('081200000002');
  });

  it('apply hanya mengubah NORMALIZE, dengan audit; CONFLICT/INVALID dibiarkan; baris yang berubah sejak laporan dilewati', async () => {
    const b = await mk('081200000002');
    const c = await mk('081200000003');
    const d1 = await mk('081200000004');
    const d2 = await mk('6281200000004');
    const e = await mk('12345');
    const report = await buildPhoneNormalizationReport(prisma);

    await prisma.user.update({ where: { id: c.id }, data: { phone: '081299999999' } });
    const result = await applyPhoneNormalization(prisma, report, 'uji');

    expect(result.updated).toBe(1);
    expect(result.skipped).toEqual([{ userId: c.id, reason: 'CHANGED_SINCE_REPORT' }]);
    const phone = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).phone;
    expect(await phone(b.id)).toBe('6281200000002');
    expect(await phone(c.id)).toBe('081299999999');
    expect(await phone(d1.id)).toBe('081200000004');
    expect(await phone(d2.id)).toBe('6281200000004');
    expect(await phone(e.id)).toBe('12345');
    expect(await prisma.auditLog.count({ where: { action: 'USER_PHONE_NORMALIZED' } })).toBe(1);

    // Laporan baru menangkap baris yang berubah tadi; sesudah itu idempoten.
    const again = await applyPhoneNormalization(prisma, await buildPhoneNormalizationReport(prisma), 'uji');
    expect(again.updated).toBe(1);
    expect(await phone(c.id)).toBe('6281299999999');
    const third = await applyPhoneNormalization(prisma, await buildPhoneNormalizationReport(prisma), 'uji');
    expect(third.updated).toBe(0);
  });
});
