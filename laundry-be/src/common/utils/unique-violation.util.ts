import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Kolom yang bentrok pada pelanggaran unik Prisma (P2002). */
export function uniqueViolationFields(err: unknown): string[] | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
  const t = (err.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(t)) return t.map(String);
  if (typeof t === 'string') return [t];
  return [];
}

/**
 * Terjemahkan P2002 menjadi 409 dengan pesan sesuai kolom yang bentrok.
 * Dulu semua P2002 saat registrasi dilaporkan sebagai "Phone or email already
 * exists" — termasuk bentrok kode member (temuan uji 2026-11-21).
 * Mengembalikan null bila [err] bukan P2002 (pemanggil melempar ulang).
 */
export function conflictFromUniqueViolation(err: unknown): ConflictException | null {
  const fields = uniqueViolationFields(err);
  if (!fields) return null;
  const has = (f: string) => fields.some((x) => x === f || x.includes(`_${f}_`) || x.endsWith(`_${f}_key`));
  if (has('phone')) return new ConflictException('Nomor HP sudah terdaftar');
  if (has('email')) return new ConflictException('Email sudah terdaftar');
  return new ConflictException('Data bentrok dengan proses lain. Silakan coba lagi.');
}
