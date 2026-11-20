import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Prisma, UserRole, OtpPurpose } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { generateDailySequence } from '../../common/utils/sequence.util';
import { OtpService } from './otp.service';
import {
  looksLikePhone,
  normalizePhone,
  phoneCandidates,
} from '../../common/utils/phone.util';
import {
  SessionDb,
  SessionRevokeReason,
  revokeSession,
  revokeUserSessions,
} from '../../common/auth/sessions';
import type { AuthUser } from '../../common/auth/access-policy';

/** Info perangkat untuk daftar sesi (bukan untuk keputusan keamanan). */
export interface ClientInfo {
  userAgent?: string | null;
  ip?: string | null;
}

type PasswordCheck =
  | { outcome: 'OK' }
  | { outcome: 'WRONG' }
  | { outcome: 'LOCKED'; until: Date };

/** Hash bcrypt tiruan agar waktu respons login sama walau user tidak ada. */
const DUMMY_HASH = bcrypt.hashSync('dicuciin-dummy-password', 10);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private otpService: OtpService,
  ) {}

  // ---------------------------------------------------------------- config

  private int(key: string, fallback: number): number {
    const v = parseInt(this.configService.get<string>(key) ?? '', 10);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  }

  private get loginMaxAttempts() {
    return this.int('AUTH_LOGIN_MAX_ATTEMPTS', 10);
  }
  private get loginLockMinutes() {
    return this.int('AUTH_LOGIN_LOCK_MINUTES', 15);
  }
  /** Refresh token yang sudah dirotasi dipakai lagi setelah jeda ini → sesi dicabut. */
  private get reuseGraceSeconds() {
    return this.int('AUTH_REFRESH_REUSE_GRACE_SECONDS', 30);
  }
  /** Umur maksimum sesi (hari); 0 = tanpa batas (hanya dibatasi umur refresh token). */
  private get sessionMaxDays() {
    return this.int('AUTH_SESSION_MAX_DAYS', 0);
  }
  private get saltRounds() {
    return this.int('BCRYPT_SALT_ROUNDS', 10) || 10;
  }

  // -------------------------------------------------------------- register

  async register(registerDto: RegisterDto, client: ClientInfo = {}) {
    const {
      name,
      email,
      password,
      role = UserRole.CUSTOMER,
      verificationToken,
      birthDate,
      gender,
      occupation,
    } = registerDto;

    // Registrasi publik HANYA untuk pelanggan. Akun staf/admin dibuat lewat
    // POST /users oleh SUPER_ADMIN/OWNER (sebelumnya `role` publik bisa
    // membuat SUPER_ADMIN tanpa OTP).
    if (role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Registrasi publik hanya untuk pelanggan');
    }
    if (!registerDto.phone) {
      throw new BadRequestException('Phone is required for customer registration');
    }
    const phone = normalizePhone(registerDto.phone);
    if (!phone) throw new BadRequestException('Nomor HP tidak valid');
    if (!verificationToken) {
      throw new BadRequestException('Verification token is required');
    }
    await this.otpService.assertVerifiedPhone(verificationToken, phone, OtpPurpose.REGISTER);

    const normalizedEmail = email?.trim().toLowerCase() || undefined;
    if (normalizedEmail) {
      const existingEmail = await this.prisma.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existingEmail) throw new ConflictException('Email already exists');
    }
    const existingPhone = await this.prisma.user.findFirst({
      where: { phone: { in: phoneCandidates(phone) } },
      select: { id: true },
    });
    if (existingPhone) throw new ConflictException('Phone already exists');

    const passwordHash = await bcrypt.hash(password, this.saltRounds);
    const memberCode = await generateDailySequence(this.prisma, 'MBR', 'customer', 'memberCode', 6);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name,
            email: normalizedEmail,
            phone,
            passwordHash,
            role: UserRole.CUSTOMER,
            phoneVerifiedAt: new Date(),
            passwordChangedAt: new Date(),
          },
        });
        await tx.customer.create({
          data: {
            userId: user.id,
            memberCode,
            birthDate: birthDate ? new Date(birthDate) : null,
            gender: gender ?? null,
            occupation: occupation ?? null,
            wallet: { create: { balance: 0 } },
          },
        });
        const tokens = await this.startSession(tx, user, client);
        return { user: this.publicUser(user), ...tokens };
      });
    } catch (err) {
      // Dua registrasi paralel untuk nomor/email yang sama → satu menang.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Phone or email already exists');
      }
      throw err;
    }
  }

  // ----------------------------------------------------------------- login

  async login(loginDto: LoginDto, client: ClientInfo = {}) {
    const identifier = loginDto.identifier.trim();
    const { password } = loginDto;

    const candidates = await this.findLoginCandidates(identifier);
    if (candidates.length === 0) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Normalnya satu kandidat. Lebih dari satu hanya bila data lama menyimpan
    // nomor yang sama dalam format berbeda (lihat scripts/normalize-user-phones.ts).
    const matched: string[] = [];
    let lockedUntil: Date | null = null;
    for (const c of candidates) {
      const r = await this.checkPassword(c.id, password);
      if (r.outcome === 'OK') matched.push(c.id);
      else if (r.outcome === 'LOCKED') lockedUntil = r.until;
    }
    if (matched.length !== 1) {
      if (matched.length > 1) {
        this.logger.warn(`Login ambigu: ${matched.length} akun cocok untuk satu nomor`);
      }
      if (lockedUntil && matched.length === 0) throw this.lockedError(lockedUntil);
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: matched[0] },
      include: {
        outletUsers: {
          include: { outlet: { select: { id: true, name: true, code: true } } },
        },
      },
    });
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');

    const tokens = await this.startSession(this.prisma, user, client);
    return { user: this.publicUser(user), ...tokens };
  }

  private async findLoginCandidates(identifier: string) {
    if (!identifier) return [];
    if (identifier.includes('@')) {
      return this.prisma.user.findMany({
        where: { email: { equals: identifier, mode: 'insensitive' } },
        select: { id: true },
        take: 3,
      });
    }
    if (looksLikePhone(identifier)) {
      const phones = phoneCandidates(identifier);
      if (phones.length === 0) return [];
      return this.prisma.user.findMany({
        where: { phone: { in: phones } },
        select: { id: true },
        take: 3,
      });
    }
    return this.prisma.user.findMany({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
      select: { id: true },
      take: 3,
    });
  }

  /**
   * Cek password dengan penguncian per akun. Baris user dikunci (FOR UPDATE)
   * sehingga tebakan paralel dievaluasi satu per satu dan penghitung selalu
   * akurat; hasil di-commit sebelum error dilempar.
   */
  private async checkPassword(userId: string, password: string): Promise<PasswordCheck> {
    const max = this.loginMaxAttempts;
    const lockMs = this.loginLockMinutes * 60_000;
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { passwordHash: string; failedLoginAttempts: number; loginLockedUntil: Date | null }[]
      >`SELECT "passwordHash", "failedLoginAttempts", "loginLockedUntil" FROM users WHERE id = ${userId} FOR UPDATE`;
      const row = rows[0];
      if (!row) return { outcome: 'WRONG' } as PasswordCheck;
      const now = new Date();
      if (row.loginLockedUntil && row.loginLockedUntil > now) {
        return { outcome: 'LOCKED', until: row.loginLockedUntil } as PasswordCheck;
      }
      const ok = await bcrypt.compare(password, row.passwordHash);
      if (ok) {
        if (row.failedLoginAttempts !== 0 || row.loginLockedUntil) {
          await tx.user.update({
            where: { id: userId },
            data: { failedLoginAttempts: 0, loginLockedUntil: null },
          });
        }
        return { outcome: 'OK' } as PasswordCheck;
      }
      const attempts = row.failedLoginAttempts + 1;
      if (max > 0 && attempts >= max) {
        const until = new Date(now.getTime() + lockMs);
        await tx.user.update({
          where: { id: userId },
          data: { failedLoginAttempts: 0, loginLockedUntil: until },
        });
        return { outcome: 'LOCKED', until } as PasswordCheck;
      }
      await tx.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: attempts },
      });
      return { outcome: 'WRONG' } as PasswordCheck;
    });
  }

  private lockedError(until: Date) {
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
    return new HttpException(
      `Terlalu banyak percobaan masuk yang salah. Akun dikunci sementara, coba lagi dalam ${minutes} menit atau atur ulang kata sandi.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  // --------------------------------------------------------------- refresh

  /**
   * Rotasi refresh token, atomik:
   *  - baris token dikunci (FOR UPDATE) → dua refresh paralel dengan token yang
   *    sama menghasilkan tepat satu pasangan token baru;
   *  - token yang sudah dirotasi dipakai lagi setelah jeda
   *    AUTH_REFRESH_REUSE_GRACE_SECONDS → indikasi token dicuri → SELURUH sesi
   *    dicabut (pemegang token baru ikut keluar);
   *  - token lama tanpa sesi (sebelum Batch 5) dipindahkan ke sesi baru.
   */
  async refreshToken(token: string, client: ClientInfo = {}) {
    let payload: { sub?: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const tokenHash = this.hashToken(token);
    const graceMs = this.reuseGraceSeconds * 1000;

    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM refresh_tokens WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
      if (!rows[0]) return { error: 'Refresh token not found' } as const;
      const stored = await tx.refreshToken.findUniqueOrThrow({ where: { id: rows[0].id } });
      const now = new Date();

      if (stored.userId !== payload.sub) return { error: 'Invalid refresh token' } as const;

      if (stored.revokedAt) {
        if (
          stored.rotatedAt &&
          stored.sessionId &&
          now.getTime() - stored.rotatedAt.getTime() > graceMs
        ) {
          const revoked = await revokeSession(tx, stored.sessionId, SessionRevokeReason.REFRESH_REUSE);
          if (revoked) {
            await tx.auditLog.create({
              data: {
                userId: stored.userId,
                action: 'AUTH_REFRESH_REUSE_DETECTED',
                entity: 'AuthSession',
                entityId: stored.sessionId,
                changes: { refreshTokenId: stored.id },
              },
            });
          }
        }
        return { error: 'Refresh token has been revoked' } as const;
      }
      if (stored.expiresAt < now) return { error: 'Refresh token expired' } as const;

      const user = await tx.user.findUnique({ where: { id: stored.userId } });
      if (!user || !user.isActive) return { error: 'Invalid refresh token' } as const;

      let sessionId = stored.sessionId;
      if (sessionId) {
        const session = await tx.authSession.findUnique({ where: { id: sessionId } });
        if (!session || session.revokedAt || (session.expiresAt && session.expiresAt < now)) {
          return { error: 'Sesi berakhir. Silakan masuk lagi.' } as const;
        }
        await tx.authSession.update({
          where: { id: sessionId },
          data: {
            lastUsedAt: now,
            ...(client.userAgent ? { userAgent: client.userAgent.slice(0, 255) } : {}),
            ...(client.ip ? { ipAddress: client.ip.slice(0, 64) } : {}),
          },
        });
      } else {
        sessionId = (await this.createSessionRow(tx, user.id, client)).id;
      }

      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: now, rotatedAt: now, sessionId },
      });
      const tokens = await this.issueTokens(tx, user, sessionId);
      return { tokens } as const;
    });

    if ('error' in result) throw new UnauthorizedException(result.error);
    await this.cleanupExpiredTokens(payload.sub!).catch(() => undefined);
    return result.tokens;
  }

  // ------------------------------------------------------- password & logout

  /**
   * Reset password via OTP. Token verifikasi hanya berlaku sekali: token yang
   * terbit sebelum password terakhir diubah ditolak. Semua sesi dicabut dan
   * penguncian login dibuka.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const { newPassword, verificationToken } = dto;
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('Nomor HP tidak valid');

    const verified = await this.otpService.assertVerifiedPhone(
      verificationToken,
      phone,
      OtpPurpose.RESET_PASSWORD,
    );

    const users = await this.prisma.user.findMany({
      where: { phone: { in: phoneCandidates(phone) } },
      take: 2,
    });
    if (users.length === 0) throw new NotFoundException('User tidak ditemukan');
    if (users.length > 1) {
      throw new ConflictException(
        'Nomor HP terdaftar di lebih dari satu akun. Hubungi layanan pelanggan.',
      );
    }
    const user = users[0];
    if (
      user.passwordChangedAt &&
      verified.issuedAt &&
      verified.issuedAt.getTime() < user.passwordChangedAt.getTime()
    ) {
      throw new BadRequestException('Token verifikasi sudah dipakai. Minta kode OTP baru.');
    }

    const passwordHash = await bcrypt.hash(newPassword, this.saltRounds);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        },
      });
      await revokeUserSessions(tx, user.id, SessionRevokeReason.PASSWORD_RESET);
      await tx.auditLog.create({
        data: { userId: user.id, action: 'AUTH_PASSWORD_RESET', entity: 'User', entityId: user.id },
      });
    });

    return { message: 'Password berhasil direset. Silakan login dengan password baru.' };
  }

  /**
   * Batch 6: re-autentikasi untuk tindakan sensitif (mis. hapus akun) —
   * password + penguncian login yang sama dengan login.
   */
  async verifyPasswordForSensitiveAction(userId: string, password: string) {
    const check = await this.checkPassword(userId, password);
    if (check.outcome === 'LOCKED') throw this.lockedError(check.until);
    if (check.outcome !== 'OK') throw new BadRequestException('Kata sandi salah');
  }

  /** Ganti password dari aplikasi: wajib password lama; sesi lain dicabut. */
  async changePassword(actor: AuthUser, currentPassword: string, newPassword: string) {
    if (currentPassword === newPassword) {
      throw new BadRequestException('Kata sandi baru harus berbeda dari kata sandi lama');
    }
    const check = await this.checkPassword(actor.userId, currentPassword);
    if (check.outcome === 'LOCKED') throw this.lockedError(check.until);
    if (check.outcome !== 'OK') throw new BadRequestException('Kata sandi lama salah');

    const passwordHash = await bcrypt.hash(newPassword, this.saltRounds);
    const keep = actor.sessionId ?? null;
    const revoked = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: actor.userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      const n = await revokeUserSessions(tx, actor.userId, SessionRevokeReason.PASSWORD_CHANGED, keep);
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'AUTH_PASSWORD_CHANGED',
          entity: 'User',
          entityId: actor.userId,
          changes: { revokedSessions: n },
        },
      });
      return n;
    });
    return {
      message: 'Kata sandi berhasil diubah. Perangkat lain telah dikeluarkan.',
      revokedSessions: revoked,
    };
  }

  async logout(actor: AuthUser, refreshToken?: string) {
    if (refreshToken) {
      const stored = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: this.hashToken(refreshToken) },
      });
      // Token milik user lain diabaikan (tidak boleh mencabut sesi orang lain).
      if (stored && stored.userId === actor.userId) {
        if (stored.sessionId) {
          await revokeSession(this.prisma, stored.sessionId, SessionRevokeReason.LOGOUT);
        } else {
          await this.prisma.refreshToken.updateMany({
            where: { id: stored.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
      if (actor.sessionId) {
        await revokeSession(this.prisma, actor.sessionId, SessionRevokeReason.LOGOUT);
      }
    } else if (actor.sessionId) {
      await revokeSession(this.prisma, actor.sessionId, SessionRevokeReason.LOGOUT);
    } else {
      // Klien lama tanpa refresh token & token tanpa sesi: perilaku lama
      // (keluar dari semua perangkat).
      await revokeUserSessions(this.prisma, actor.userId, SessionRevokeReason.LOGOUT_ALL);
    }
    return { message: 'Logged out successfully' };
  }

  async logoutAll(actor: AuthUser) {
    const n = await revokeUserSessions(this.prisma, actor.userId, SessionRevokeReason.LOGOUT_ALL);
    return { message: 'Semua perangkat telah dikeluarkan', revokedSessions: n };
  }

  async listSessions(actor: AuthUser) {
    const sessions = await this.prisma.authSession.findMany({
      where: { userId: actor.userId, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
      take: 50,
      select: { id: true, createdAt: true, lastUsedAt: true, userAgent: true, ipAddress: true },
    });
    return sessions.map((s) => ({ ...s, current: s.id === actor.sessionId }));
  }

  async revokeOwnSession(actor: AuthUser, sessionId: string) {
    const session = await this.prisma.authSession.findUnique({ where: { id: sessionId } });
    // Sesi orang lain → 404 (tidak membocorkan keberadaannya).
    if (!session || session.userId !== actor.userId) {
      throw new NotFoundException('Sesi tidak ditemukan');
    }
    await revokeSession(this.prisma, sessionId, SessionRevokeReason.USER_REVOKED);
    return { message: 'Sesi dicabut', current: sessionId === actor.sessionId };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        customer: { include: { wallet: true } },
        b2bPartner: { include: { wallet: true, membershipStatus: true } },
        outletUsers: {
          include: {
            outlet: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const { customer, b2bPartner, ...rest } = this.publicUser(user) as typeof user;

    // Jangan bocorkan hash PIN; cukup ekspos flag apakah PIN sudah diset.
    if (customer) {
      const { walletPinHash, ...customerRest } = customer;
      return {
        ...rest,
        customer: { ...customerRest, hasWalletPin: !!walletPinHash },
        b2bPartner,
      };
    }

    return { ...rest, customer: null, b2bPartner };
  }

  // ----------------------------------------------------------------- tokens

  /** Field user yang tidak boleh keluar dari API. */
  private publicUser<T extends Record<string, any>>(user: T) {
    const {
      passwordHash: _p,
      failedLoginAttempts: _f,
      loginLockedUntil: _l,
      ...rest
    } = user as any;
    return rest as Omit<T, 'passwordHash' | 'failedLoginAttempts' | 'loginLockedUntil'>;
  }

  private async createSessionRow(db: SessionDb, userId: string, client: ClientInfo) {
    const maxDays = this.sessionMaxDays;
    return db.authSession.create({
      data: {
        userId,
        userAgent: client.userAgent?.slice(0, 255) ?? null,
        ipAddress: client.ip?.slice(0, 64) ?? null,
        expiresAt: maxDays > 0 ? new Date(Date.now() + maxDays * 86_400_000) : null,
      },
    });
  }

  private async startSession(
    db: SessionDb,
    user: { id: string; email: string | null; role: UserRole },
    client: ClientInfo,
  ) {
    const session = await this.createSessionRow(db, user.id, client);
    return this.issueTokens(db, user, session.id);
  }

  private async issueTokens(
    db: SessionDb,
    user: { id: string; email: string | null; role: UserRole },
    sessionId: string,
  ) {
    const payload = { sub: user.id, email: user.email, role: user.role, sid: sessionId };

    const accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');

    // jwtid acak: dua token yang terbit pada detik yang sama tetap berbeda
    // (sebelumnya hash refresh token bisa bentrok → 500 pada login/refresh paralel).
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn as any,
        jwtid: crypto.randomUUID(),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn as any,
        jwtid: crypto.randomUUID(),
      }),
    ]);

    await db.refreshToken.create({
      data: {
        userId: user.id,
        sessionId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: this.parseExpiresIn(refreshExpiresIn),
      },
    });

    return { accessToken, refreshToken };
  }

  /** Hash token dengan SHA-256 sebelum disimpan ke DB */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Parse expires string seperti "7d", "15m" ke Date */
  private parseExpiresIn(expiresIn: string): Date {
    const now = new Date();
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(now.getTime() + value * (multipliers[unit] ?? 0));
  }

  /**
   * Hapus refresh token yang sudah KEDALUWARSA. Token yang dicabut/dirotasi
   * tetap disimpan sampai kedaluwarsa agar pemakaian ulang bisa dideteksi.
   */
  private async cleanupExpiredTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
  }
}
