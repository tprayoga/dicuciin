/**
 * Batch 5 (T6) — normalisasi data lama `users.phone` ke bentuk kanonik `628…`.
 *
 * Kode Batch 5 sudah menerima semua format saat login/OTP/lookup, jadi
 * normalisasi data TIDAK wajib untuk berjalan; ini merapikan data dan
 * menampakkan duplikat (satu nomor terdaftar di lebih dari satu akun).
 *
 * Laporan dibuat baca-saja. `applyPhoneNormalization` hanya mengubah baris
 * kategori NORMALIZE (tanpa bentrok), satu per satu dengan pemeriksaan ulang
 * dan AuditLog. Baris CONFLICT / INVALID tidak pernah diubah otomatis.
 */
import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../../common/utils/phone.util';

export type PhoneRowCategory = 'CANONICAL' | 'NORMALIZE' | 'CONFLICT' | 'INVALID';

export interface PhoneRow {
  userId: string;
  role: string;
  isActive: boolean;
  phone: string;
  canonical: string | null;
  category: PhoneRowCategory;
  /** Akun lain yang nomornya setara (hanya untuk CONFLICT). */
  conflictsWith?: string[];
}

export interface PhoneNormalizationReport {
  generatedAt: string;
  totals: Record<PhoneRowCategory, number>;
  rows: PhoneRow[];
}

export async function buildPhoneNormalizationReport(
  prisma: PrismaClient,
): Promise<PhoneNormalizationReport> {
  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true, role: true, isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  const byCanonical = new Map<string, string[]>();
  for (const u of users) {
    const c = normalizePhone(u.phone);
    if (c) byCanonical.set(c, [...(byCanonical.get(c) ?? []), u.id]);
  }

  const rows: PhoneRow[] = users.map((u) => {
    const canonical = normalizePhone(u.phone);
    if (!canonical) {
      return { userId: u.id, role: u.role, isActive: u.isActive, phone: u.phone!, canonical, category: 'INVALID' };
    }
    const owners = byCanonical.get(canonical) ?? [];
    if (owners.length > 1) {
      return {
        userId: u.id,
        role: u.role,
        isActive: u.isActive,
        phone: u.phone!,
        canonical,
        category: 'CONFLICT',
        conflictsWith: owners.filter((id) => id !== u.id),
      };
    }
    return {
      userId: u.id,
      role: u.role,
      isActive: u.isActive,
      phone: u.phone!,
      canonical,
      category: u.phone === canonical ? 'CANONICAL' : 'NORMALIZE',
    };
  });

  const totals: Record<PhoneRowCategory, number> = { CANONICAL: 0, NORMALIZE: 0, CONFLICT: 0, INVALID: 0 };
  for (const r of rows) totals[r.category]++;
  return { generatedAt: new Date().toISOString(), totals, rows };
}

export async function applyPhoneNormalization(
  prisma: PrismaClient,
  report: PhoneNormalizationReport,
  actor: string,
): Promise<{ updated: number; skipped: { userId: string; reason: string }[] }> {
  let updated = 0;
  const skipped: { userId: string; reason: string }[] = [];
  for (const row of report.rows) {
    if (row.category !== 'NORMALIZE' || !row.canonical) continue;
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: row.userId }, select: { phone: true } });
      if (!current || current.phone !== row.phone) return 'CHANGED_SINCE_REPORT';
      const taken = await tx.user.findFirst({
        where: { phone: row.canonical!, id: { not: row.userId } },
        select: { id: true },
      });
      if (taken) return 'CANONICAL_TAKEN';
      await tx.user.update({ where: { id: row.userId }, data: { phone: row.canonical! } });
      await tx.auditLog.create({
        data: {
          action: 'USER_PHONE_NORMALIZED',
          entity: 'User',
          entityId: row.userId,
          changes: { from: row.phone, to: row.canonical, actor },
        },
      });
      return 'OK';
    });
    if (result === 'OK') updated++;
    else skipped.push({ userId: row.userId, reason: result });
  }
  return { updated, skipped };
}
