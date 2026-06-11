import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserRole, OtpPurpose } from '@prisma/client';
import { generateDailySequence } from '../../common/utils/sequence.util';
import { OtpService } from './otp.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private otpService: OtpService,
  ) {}

  async register(registerDto: RegisterDto) {
    const {
      name,
      email,
      phone,
      password,
      role = UserRole.CUSTOMER,
      verificationToken,
      birthDate,
      gender,
      occupation,
    } = registerDto;

    if (!email && !phone) {
      throw new BadRequestException('Email or phone is required');
    }

    // Register CUSTOMER (self-service) wajib lewat verifikasi OTP nomor HP.
    if (role === UserRole.CUSTOMER) {
      if (!phone) {
        throw new BadRequestException('Phone is required for customer registration');
      }
      if (!verificationToken) {
        throw new BadRequestException('Verification token is required');
      }
      await this.otpService.assertVerifiedPhone(verificationToken, phone, OtpPurpose.REGISTER);
    }

    if (email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email } });
      if (existingEmail) throw new ConflictException('Email already exists');
    }

    if (phone) {
      const existingPhone = await this.prisma.user.findUnique({ where: { phone } });
      if (existingPhone) throw new ConflictException('Phone already exists');
    }

    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS', '10'));
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role,
        phoneVerifiedAt: role === UserRole.CUSTOMER ? new Date() : null,
      },
    });

    if (role === UserRole.CUSTOMER) {
      const memberCode = await generateDailySequence(
        this.prisma,
        'MBR',
        'customer',
        'memberCode',
        6,
      );
      await this.prisma.customer.create({
        data: {
          userId: user.id,
          memberCode,
          birthDate: birthDate ? new Date(birthDate) : null,
          gender: gender ?? null,
          occupation: occupation ?? null,
          wallet: { create: { balance: 0 } },
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const { passwordHash: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword, ...tokens };
  }

  async login(loginDto: LoginDto) {
    const { identifier, password } = loginDto;

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
      include: {
        outletUsers: {
          include: {
            outlet: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) throw new UnauthorizedException('Account is inactive');

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const { passwordHash: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword, ...tokens };
  }

  async refreshToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new UnauthorizedException('Invalid refresh token');

      // Verifikasi token ada di DB dan belum di-revoke
      const tokenHash = this.hashToken(token);
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
      });

      if (!storedToken) throw new UnauthorizedException('Refresh token not found');
      if (storedToken.revokedAt) throw new UnauthorizedException('Refresh token has been revoked');
      if (storedToken.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

      // Revoke token lama (token rotation)
      await this.prisma.refreshToken.update({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      });

      // Bersihkan token lama yang sudah expired/revoked (housekeeping)
      await this.cleanupExpiredTokens(user.id);

      const tokens = await this.generateTokens(user.id, user.email, user.role);
      return tokens;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Reset password via OTP. Wajib verificationToken hasil verifikasi OTP
   * (purpose RESET_PASSWORD) untuk nomor yang sama. Setelah reset, semua refresh
   * token user di-revoke agar sesi lama tak bisa dipakai.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const { phone, newPassword, verificationToken } = dto;

    await this.otpService.assertVerifiedPhone(
      verificationToken,
      phone,
      OtpPurpose.RESET_PASSWORD,
    );

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const saltRounds = parseInt(
      this.configService.get<string>('BCRYPT_SALT_ROUNDS', '10'),
    );
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Password berhasil direset. Silakan login dengan password baru.' };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      // Revoke token spesifik
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken
        .update({
          where: { tokenHash },
          data: { revokedAt: new Date() },
        })
        .catch(() => {
          // Token mungkin sudah tidak ada, abaikan
        });
    } else {
      // Revoke semua refresh token user (logout dari semua device)
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { message: 'Logged out successfully' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        customer: { include: { wallet: true } },
        outletUsers: {
          include: {
            outlet: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const { passwordHash: _, customer, ...rest } = user;

    // Jangan bocorkan hash PIN; cukup ekspos flag apakah PIN sudah diset.
    if (customer) {
      const { walletPinHash, ...customerRest } = customer;
      return { ...rest, customer: { ...customerRest, hasWalletPin: !!walletPinHash } };
    }

    return { ...rest, customer: null };
  }

  private async generateTokens(userId: string, email: string | null, role: UserRole) {
    const payload = { sub: userId, email, role };

    const accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn,
      }),
    ]);

    // Simpan refresh token hash ke DB
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = this.parseExpiresIn(refreshExpiresIn);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
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

  /** Hapus token expired/revoked lama untuk menjaga tabel tetap bersih */
  private async cleanupExpiredTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } },
        ],
      },
    });
  }
}
