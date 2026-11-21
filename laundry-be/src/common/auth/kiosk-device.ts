/**
 * Autentikasi perangkat kiosk (Batch 1.5).
 *
 * Kiosk TIDAK memakai JWT: saat enrollment ia menerima token acak 32 byte yang
 * disimpan sebagai hash SHA-256 di `kiosks.deviceTokenHash`. Modul ini adalah
 * satu-satunya tempat token itu diverifikasi — dipakai KiosksService (rute
 * `/kiosks/device/*`) dan `JwtOrKioskDeviceGuard` (rute bersama yang secara
 * eksplisit menerima perangkat kiosk, mis. `/pricing/calculate`).
 */
import { UnauthorizedException } from "@nestjs/common";
import { Kiosk, Outlet } from "@prisma/client";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";

export type AuthenticatedKiosk = Kiosk & { outlet: Outlet };

export function hashKioskSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function bearerToken(authorization?: string | string[]): string {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization;
  return raw?.replace(/^Bearer\s+/i, "").trim() || "";
}

/** Token JWT selalu berbentuk tiga segmen base64url dipisah titik. */
export function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}

export async function authenticateKioskToken(
  prisma: PrismaService,
  deviceToken: string,
): Promise<AuthenticatedKiosk> {
  if (!deviceToken) throw new UnauthorizedException("Device token required");
  const kiosk = await prisma.kiosk.findUnique({
    where: { deviceTokenHash: hashKioskSecret(deviceToken) },
    include: { outlet: true },
  });
  if (!kiosk || kiosk.tokenRevokedAt || kiosk.status !== "ACTIVE") {
    throw new UnauthorizedException(
      "Device token tidak valid atau telah dicabut",
    );
  }
  return kiosk;
}
