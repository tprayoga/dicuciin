import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { OtpPurpose } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WhatsappService } from '../notifications/whatsapp.service';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 menit
const OTP_MAX_ATTEMPTS = 5; // maks salah verifikasi per kode
const OTP_RATE_LIMIT = 3; // maks request per jam per nomor
const OTP_RATE_WINDOW_MS = 60 * 60 * 1000;
const OTP_VERIFICATION_TTL = '15m'; // umur verification token
const OTP_VERIFIED_SCOPE = 'otp_verified';

export interface VerificationTokenPayload {
  phone: string;
  purpose: OtpPurpose;
  scope: typeof OTP_VERIFIED_SCOPE;
}

@Injectable()
export class OtpService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private whatsapp: WhatsappService,
  ) {}

  /** Secret khusus verification token — terpisah dari access token agar tidak bisa dipakai sebagai bearer auth. */
  private otpSecret(): string {
    const dedicated = this.configService.get<string>('JWT_OTP_SECRET');
    if (dedicated) return dedicated;
    return `${this.configService.get<string>('JWT_ACCESS_SECRET')}_otp`;
  }

  async requestOtp(phone: string, purpose: OtpPurpose = OtpPurpose.REGISTER) {
    // Untuk REGISTER: nomor belum boleh terdaftar.
    if (purpose === OtpPurpose.REGISTER) {
      const existing = await this.prisma.user.findUnique({ where: { phone } });
      if (existing) throw new ConflictException('Nomor HP sudah terdaftar');
    }

    // Rate limit: maks OTP_RATE_LIMIT request/jam/nomor.
    const since = new Date(Date.now() - OTP_RATE_WINDOW_MS);
    const recentCount = await this.prisma.otpCode.count({
      where: { phone, purpose, createdAt: { gte: since } },
    });
    if (recentCount >= OTP_RATE_LIMIT) {
      throw new HttpException(
        'Terlalu banyak permintaan OTP. Coba lagi dalam 1 jam.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.prisma.otpCode.create({
      data: { phone, codeHash, purpose, expiresAt },
    });

    await this.whatsapp.sendText(
      phone,
      `Kode OTP Dicuciin Anda: ${code}. Berlaku 5 menit. Jangan bagikan kode ini ke siapa pun.`,
    );

    return { message: 'OTP terkirim via WhatsApp', expiresInSeconds: OTP_TTL_MS / 1000 };
  }

  async verifyOtp(phone: string, code: string, purpose: OtpPurpose = OtpPurpose.REGISTER) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new UnauthorizedException('OTP tidak ditemukan. Minta kode baru.');
    if (otp.expiresAt < new Date()) {
      throw new UnauthorizedException('OTP sudah kedaluwarsa. Minta kode baru.');
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('OTP terlalu banyak salah. Minta kode baru.');
    }

    const isValid = await bcrypt.compare(code, otp.codeHash);
    if (!isValid) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Kode OTP salah');
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const payload: VerificationTokenPayload = { phone, purpose, scope: OTP_VERIFIED_SCOPE };
    const verificationToken = await this.jwtService.signAsync(payload, {
      secret: this.otpSecret(),
      expiresIn: OTP_VERIFICATION_TTL,
    });

    return { verificationToken };
  }

  /**
   * Validasi verification token untuk sebuah nomor & purpose.
   * Dipakai AuthService.register() agar register hanya bisa dengan nomor terverifikasi.
   */
  async assertVerifiedPhone(token: string, phone: string, purpose: OtpPurpose): Promise<void> {
    let payload: VerificationTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<VerificationTokenPayload>(token, {
        secret: this.otpSecret(),
      });
    } catch {
      throw new BadRequestException('Token verifikasi tidak valid atau kedaluwarsa');
    }

    if (
      payload.scope !== OTP_VERIFIED_SCOPE ||
      payload.purpose !== purpose ||
      payload.phone !== phone
    ) {
      throw new BadRequestException('Token verifikasi tidak cocok dengan nomor ini');
    }
  }

  private generateCode(): string {
    // 4 digit, 0000-9999.
    return Math.floor(1000 + Math.random() * 9000).toString();
  }
}
