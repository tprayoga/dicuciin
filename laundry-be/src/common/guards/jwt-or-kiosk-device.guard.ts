import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  applyDecorators,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../decorators/public.decorator";
import {
  authenticateKioskToken,
  bearerToken,
  looksLikeJwt,
} from "../auth/kiosk-device";

export const ALLOW_KIOSK_DEVICE_KEY = "allowKioskDevice";

/**
 * Guard untuk rute yang dipakai BERSAMA oleh user (JWT) dan perangkat kiosk
 * (token perangkat). Token berbentuk JWT → diverifikasi passport-jwt seperti
 * biasa (req.user). Selain itu → diverifikasi sebagai token kiosk (req.kiosk).
 * Tidak ada jalur tanpa identitas: keduanya gagal → 401.
 */
@Injectable()
export class JwtOrKioskDeviceGuard implements CanActivate {
  private readonly jwt = new (AuthGuard("jwt"))();

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = bearerToken(req.headers?.authorization);
    if (token && !looksLikeJwt(token)) {
      req.kiosk = await authenticateKioskToken(this.prisma, token);
      req.user = undefined;
      return true;
    }
    return (await this.jwt.canActivate(context)) as boolean;
  }
}

/**
 * Tandai rute agar menerima JWT ATAU token perangkat kiosk. Guard JWT global
 * dilewati (via @Public) dan digantikan JwtOrKioskDeviceGuard yang tetap
 * WAJIB salah satu identitas. RolesGuard global tetap berjalan untuk req.user.
 */
export function AllowKioskDevice() {
  return applyDecorators(
    Public(),
    SetMetadata(ALLOW_KIOSK_DEVICE_KEY, true),
    UseGuards(JwtOrKioskDeviceGuard),
  );
}
