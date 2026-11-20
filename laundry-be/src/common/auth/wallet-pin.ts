/**
 * Verifikasi PIN wallet dengan penguncian (Batch 1.5).
 *
 * Dipakai saat saldo customer didebit TANPA sesi login customer — yaitu
 * pembayaran saldo di kiosk, di mana customer hanya diidentifikasi lewat nomor
 * HP / kode member. PIN adalah satu-satunya bukti persetujuan pemilik saldo.
 *
 * Kebijakan: 5 kali salah berturut-turut → terkunci 15 menit (default; bisa
 * diubah lewat WALLET_PIN_MAX_ATTEMPTS / WALLET_PIN_LOCK_MINUTES).
 */
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";

const positive = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function walletPinPolicy() {
  return {
    maxAttempts: positive(process.env.WALLET_PIN_MAX_ATTEMPTS, 5),
    lockMinutes: positive(process.env.WALLET_PIN_LOCK_MINUTES, 15),
  };
}

export async function verifyWalletPinWithLockout(
  prisma: PrismaService,
  customerId: string,
  pin: string | undefined,
  now: Date = new Date(),
): Promise<void> {
  if (!pin) {
    throw new BadRequestException(
      "PIN wallet wajib diisi untuk membayar dengan saldo",
    );
  }
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      walletPinHash: true,
      walletPinLockedUntil: true,
    },
  });
  if (!customer) throw new BadRequestException("PIN salah");
  if (!customer.walletPinHash) {
    throw new BadRequestException(
      "PIN wallet belum diatur. Atur PIN di aplikasi Di.Cuciin terlebih dahulu.",
    );
  }
  if (customer.walletPinLockedUntil && customer.walletPinLockedUntil > now) {
    throw new ForbiddenException(
      "PIN wallet terkunci sementara karena terlalu banyak percobaan salah. Coba lagi nanti.",
    );
  }

  const valid = await bcrypt.compare(pin, customer.walletPinHash);
  if (valid) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { walletPinFailedAttempts: 0, walletPinLockedUntil: null },
    });
    return;
  }

  // Increment atomik: percobaan paralel tetap terhitung semuanya.
  const { maxAttempts, lockMinutes } = walletPinPolicy();
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: { walletPinFailedAttempts: { increment: 1 } },
    select: { walletPinFailedAttempts: true },
  });
  if (updated.walletPinFailedAttempts >= maxAttempts) {
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        walletPinFailedAttempts: 0,
        walletPinLockedUntil: new Date(now.getTime() + lockMinutes * 60_000),
      },
    });
    throw new ForbiddenException(
      "PIN wallet terkunci sementara karena terlalu banyak percobaan salah. Coba lagi nanti.",
    );
  }
  // 400, bukan 401: kiosk memperlakukan 401 sebagai token perangkat dicabut.
  throw new BadRequestException("PIN salah");
}
