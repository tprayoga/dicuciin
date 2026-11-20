import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

const SESSION_ENDED = 'Sesi berakhir. Silakan masuk lagi.';

/**
 * Access token diverifikasi tanda tangannya oleh passport-jwt, lalu (Batch 5)
 * terhadap database pada setiap request:
 *  - token bersesi (`sid`): sesi harus ada, milik user yang sama, belum dicabut
 *    / kedaluwarsa, dan user masih aktif → logout, ganti password, nonaktifkan
 *    akun, dan pencabutan sesi berlaku SEGERA (bukan menunggu token kedaluwarsa).
 *  - token lama tanpa `sid` (terbit sebelum Batch 5, berumur ≤ JWT_ACCESS_EXPIRES_IN):
 *    user harus aktif dan token terbit setelah password terakhir diubah.
 * Role diambil dari database, bukan dari isi token.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: any) {
    if (!payload?.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.sid) {
      const session = await this.prisma.authSession.findUnique({
        where: { id: String(payload.sid) },
        select: {
          userId: true,
          revokedAt: true,
          expiresAt: true,
          user: { select: { isActive: true, role: true, email: true } },
        },
      });
      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt ||
        (session.expiresAt && session.expiresAt < new Date()) ||
        !session.user.isActive
      ) {
        throw new UnauthorizedException(SESSION_ENDED);
      }
      return {
        userId: payload.sub,
        email: session.user.email,
        role: session.user.role,
        sessionId: String(payload.sid),
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, role: true, email: true, passwordChangedAt: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException(SESSION_ENDED);
    if (
      user.passwordChangedAt &&
      typeof payload.iat === 'number' &&
      payload.iat * 1000 < user.passwordChangedAt.getTime()
    ) {
      throw new UnauthorizedException(SESSION_ENDED);
    }
    return { userId: payload.sub, email: user.email, role: user.role, sessionId: null };
  }
}
