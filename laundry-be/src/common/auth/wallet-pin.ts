/**
 * Keamanan PIN wallet (Batch 1.5 → diperkuat Batch 4, temuan S5).
 *
 * SATU modul untuk semua kanal (mobile, kiosk, rute lama):
 *  - Hash bcrypt (cost 10); PIN tidak pernah dicatat/dikembalikan.
 *  - Verifikasi di bawah KUNCI BARIS customer (`SELECT … FOR UPDATE`):
 *    percobaan paralel dievaluasi satu per satu → penguncian tidak bisa
 *    dilewati dengan membanjiri request (dulu: semua request membaca status
 *    "belum terkunci" sebelum ada yang menambah penghitung).
 *  - 5× salah berturut-turut → terkunci 15 menit (WALLET_PIN_MAX_ATTEMPTS /
 *    WALLET_PIN_LOCK_MINUTES). Penghitung salah DI-COMMIT sebelum error dilempar.
 *  - Ubah PIN yang sudah ada wajib PIN lama (juga terkena penguncian).
 *  - "Bukti PIN" sekali pakai (WALLET_PIN_PROOF_SECONDS, default 120): app lama
 *    memverifikasi PIN lewat /pin/verify lalu membayar tanpa mengirim PIN —
 *    pembayaran mengonsumsi bukti itu sehingga PIN tetap ditegakkan server.
 *    Bukti (`wallet_pin_proofs`) terikat ke CUSTOMER dan SESI (SHA-256 access
 *    token yang dipakai saat verifikasi), dikonsumsi atomik tepat sekali
 *    (`FOR UPDATE SKIP LOCKED` + `consumedAt`), dan dibatalkan saat PIN
 *    terkunci atau diganti.
 *
 * Respons: PIN salah = 400 (bukan 401 — kiosk memperlakukan 401 sebagai token
 * perangkat dicabut), terkunci = 403, belum diatur = 400.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const positive = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function walletPinPolicy() {
  return {
    maxAttempts: positive(process.env.WALLET_PIN_MAX_ATTEMPTS, 5),
    lockMinutes: positive(process.env.WALLET_PIN_LOCK_MINUTES, 15),
    proofSeconds: positive(process.env.WALLET_PIN_PROOF_SECONDS, 120),
  };
}

/** Kunci sesi = hash SHA-256 bearer token (token mentah tidak pernah disimpan). */
export function walletSessionKey(authorization?: string | string[]): string | null {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = raw?.replace(/^Bearer\s+/i, '').trim();
  return token ? createHash('sha256').update(token).digest('hex') : null;
}

const LOCKED_MESSAGE =
  'PIN wallet terkunci sementara karena terlalu banyak percobaan salah. Coba lagi nanti.';

type Outcome = 'OK' | 'WRONG' | 'LOCKED' | 'JUST_LOCKED' | 'NOT_SET' | 'NO_CUSTOMER';

async function attempt(
  prisma: PrismaService,
  customerId: string,
  pin: string,
  now: Date,
  opts: { issueProofFor?: string | null } = {},
): Promise<Outcome> {
  const { maxAttempts, lockMinutes, proofSeconds } = walletPinPolicy();
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`;
    const c = await tx.customer.findUnique({
      where: { id: customerId },
      select: { walletPinHash: true, walletPinLockedUntil: true, walletPinFailedAttempts: true },
    });
    if (!c) return 'NO_CUSTOMER';
    if (!c.walletPinHash) return 'NOT_SET';
    if (c.walletPinLockedUntil && c.walletPinLockedUntil > now) return 'LOCKED';

    if (await bcrypt.compare(pin, c.walletPinHash)) {
      await tx.customer.update({
        where: { id: customerId },
        data: { walletPinFailedAttempts: 0, walletPinLockedUntil: null },
      });
      if (opts.issueProofFor) {
        await tx.walletPinProof.create({
          data: {
            customerId,
            sessionHash: opts.issueProofFor,
            expiresAt: new Date(now.getTime() + proofSeconds * 1000),
          },
        });
      }
      return 'OK';
    }
    const failed = c.walletPinFailedAttempts + 1;
    if (failed >= maxAttempts) {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          walletPinFailedAttempts: 0,
          walletPinLockedUntil: new Date(now.getTime() + lockMinutes * 60_000),
        },
      });
      // Terkunci → semua bukti PIN yang belum terpakai dibatalkan.
      await tx.walletPinProof.updateMany({
        where: { customerId, consumedAt: null },
        data: { consumedAt: now },
      });
      return 'JUST_LOCKED';
    }
    await tx.customer.update({
      where: { id: customerId },
      data: { walletPinFailedAttempts: failed },
    });
    return 'WRONG';
  });
}

function throwFor(outcome: Outcome): void {
  switch (outcome) {
    case 'OK':
      return;
    case 'NOT_SET':
      throw new BadRequestException(
        'PIN wallet belum diatur. Atur PIN di aplikasi Di.Cuciin terlebih dahulu.',
      );
    case 'LOCKED':
    case 'JUST_LOCKED':
      throw new ForbiddenException(LOCKED_MESSAGE);
    default:
      throw new BadRequestException('PIN salah');
  }
}

/** Verifikasi PIN (dengan penguncian). Melempar bila salah/terkunci/belum diatur. */
export async function verifyWalletPinWithLockout(
  prisma: PrismaService,
  customerId: string,
  pin: string | undefined,
  now: Date = new Date(),
  /** `issueProofFor` = kunci sesi → terbitkan bukti PIN sekali pakai bila sukses. */
  opts: { issueProofFor?: string | null } = {},
): Promise<void> {
  if (!pin) {
    throw new BadRequestException('PIN wallet wajib diisi untuk membayar dengan saldo');
  }
  throwFor(await attempt(prisma, customerId, pin, now, opts));
}

/**
 * Atur PIN pertama kali, atau ubah PIN (wajib PIN lama yang benar). Penghitung
 * & kunci direset, bukti PIN lama dihapus.
 */
export async function setWalletPin(
  prisma: PrismaService,
  customerId: string,
  newPin: string,
  currentPin?: string,
) {
  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { walletPinHash: true },
  });
  if (!existing) throw new BadRequestException('Customer tidak ditemukan');
  if (existing.walletPinHash) {
    if (!currentPin) {
      throw new BadRequestException('PIN lama wajib diisi untuk mengubah PIN');
    }
    await verifyWalletPinWithLockout(prisma, customerId, currentPin);
  }
  const hash = await bcrypt.hash(newPin, 10);
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      walletPinHash: hash,
      pinSetAt: new Date(),
      walletPinFailedAttempts: 0,
      walletPinLockedUntil: null,
    },
  });
  // PIN diganti → bukti lama tidak berlaku.
  await prisma.walletPinProof.updateMany({
    where: { customerId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}

/**
 * Konsumsi bukti PIN sekali pakai, ATOMIK: satu baris yang cocok (customer +
 * sesi + belum terpakai + belum kedaluwarsa) diklaim dengan `FOR UPDATE SKIP
 * LOCKED` → request paralel tidak bisa memakai bukti yang sama dua kali.
 */
export async function consumeWalletPinProof(
  prisma: PrismaService,
  customerId: string,
  sessionKey: string | null,
  now: Date = new Date(),
) {
  if (!sessionKey) return false;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE wallet_pin_proofs SET "consumedAt" = ${now}
    WHERE id = (
      SELECT id FROM wallet_pin_proofs
      WHERE "customerId" = ${customerId}
        AND "sessionHash" = ${sessionKey}
        AND "consumedAt" IS NULL
        AND "expiresAt" > ${now}
      ORDER BY "createdAt" DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  return rows.length === 1;
}

/**
 * Gerbang SEMUA debit saldo customer: PIN dikirim → diverifikasi (penguncian);
 * tanpa PIN → wajib bukti PIN sekali pakai milik customer ini, dari SESI yang
 * sama, yang baru saja diterbitkan /pin/verify.
 */
export async function requireWalletAuthorization(
  prisma: PrismaService,
  customerId: string,
  pin: string | undefined,
  sessionKey: string | null,
) {
  if (pin) {
    await verifyWalletPinWithLockout(prisma, customerId, pin);
    return;
  }
  const status = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { walletPinLockedUntil: true },
  });
  if (status?.walletPinLockedUntil && status.walletPinLockedUntil > new Date()) {
    throw new ForbiddenException(LOCKED_MESSAGE);
  }
  if (!(await consumeWalletPinProof(prisma, customerId, sessionKey))) {
    throw new ForbiddenException('Konfirmasi PIN wallet diperlukan untuk membayar dengan saldo');
  }
}

/** Status PIN untuk app (tanpa membocorkan hash/penghitung). */
export async function walletPinStatus(prisma: PrismaService, customerId: string) {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { walletPinHash: true, walletPinLockedUntil: true },
  });
  const now = Date.now();
  return {
    hasPin: !!c?.walletPinHash,
    lockedUntil:
      c?.walletPinLockedUntil && c.walletPinLockedUntil.getTime() > now
        ? c.walletPinLockedUntil.toISOString()
        : null,
  };
}
