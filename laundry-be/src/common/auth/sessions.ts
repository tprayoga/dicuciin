import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sesi login (Batch 5). Satu sesi = satu login di satu perangkat; refresh
 * token yang dirotasi tetap berada di sesi yang sama. Access token membawa
 * `sid`, sehingga mencabut sesi langsung mematikan access token-nya juga
 * (diperiksa JwtStrategy pada setiap request).
 */
export type SessionDb = PrismaService | Prisma.TransactionClient;

export const SessionRevokeReason = {
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  USER_REVOKED: 'USER_REVOKED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  REFRESH_REUSE: 'REFRESH_REUSE_DETECTED',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  ADMIN_PASSWORD_SET: 'ADMIN_PASSWORD_SET',
} as const;

/**
 * Cabut semua sesi & refresh token aktif milik user, kecuali satu sesi
 * (mis. sesi yang sedang mengganti password). Refresh token lama tanpa sesi
 * (diterbitkan sebelum Batch 5) ikut dicabut.
 */
export async function revokeUserSessions(
  db: SessionDb,
  userId: string,
  reason: string,
  exceptSessionId?: string | null,
): Promise<number> {
  const now = new Date();
  const sessions = await db.authSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: now, revokedReason: reason },
  });
  await db.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId
        ? { OR: [{ sessionId: null }, { sessionId: { not: exceptSessionId } }] }
        : {}),
    },
    data: { revokedAt: now },
  });
  return sessions.count;
}

/** Cabut satu sesi beserta seluruh refresh token-nya. */
export async function revokeSession(
  db: SessionDb,
  sessionId: string,
  reason: string,
): Promise<boolean> {
  const now = new Date();
  const r = await db.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
  await db.refreshToken.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
  return r.count > 0;
}
