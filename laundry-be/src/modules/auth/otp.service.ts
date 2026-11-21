import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { OtpPurpose } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WhatsappService } from '../notifications/whatsapp.service';
import { normalizePhone, phoneCandidates } from '../../common/utils/phone.util';

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
  iat?: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

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

  private canonical(phone: string): string {
    const p = normalizePhone(phone);
    if (!p) throw new BadRequestException('Nomor HP tidak valid');
    return p;
  }

  async requestOtp(rawPhone: string, purpose: OtpPurpose = OtpPurpose.REGISTER) {
    const phone = this.canonical(rawPhone);
    const variants = phoneCandidates(phone);

    // Untuk REGISTER: nomor belum boleh terdaftar (dalam format apa pun).
    if (purpose === OtpPurpose.REGISTER) {
      const existing = await this.prisma.user.findFirst({
        where: { phone: { in: variants } },
        select: { id: true },
      });
      if (existing) throw new ConflictException('Nomor HP sudah terdaftar');
    }

    // Untuk RESET_PASSWORD / LOGIN: nomor HARUS sudah terdaftar.
    if (
      purpose === OtpPurpose.RESET_PASSWORD ||
      purpose === OtpPurpose.LOGIN ||
      purpose === OtpPurpose.ACCOUNT_DELETION
    ) {
      const existing = await this.prisma.user.findFirst({
        where: { phone: { in: variants }, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Nomor HP tidak terdaftar');
    }

    // Rate limit: maks OTP_RATE_LIMIT request/jam/nomor (semua format).
    const since = new Date(Date.now() - OTP_RATE_WINDOW_MS);
    const recentCount = await this.prisma.otpCode.count({
      where: { phone: { in: variants }, purpose, createdAt: { gte: since } },
    });
    if (recentCount >= OTP_RATE_LIMIT) {
      throw new HttpException(
        'Terlalu banyak permintaan OTP. Coba lagi dalam 1 jam.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Jangan membuat kode bila tidak mungkin dikirim (produksi tanpa kunci WA).
    if (!this.whatsapp.isConfigured() && !this.whatsapp.devFallbackAllowed()) {
      this.logger.error('OTP diminta tetapi WA_API_KEY belum diatur di production');
      throw new ServiceUnavailableException(
        'Layanan pengiriman OTP sedang tidak tersedia. Coba lagi nanti.',
      );
    }

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    const otp = await this.prisma.otpCode.create({
      data: { phone, codeHash, purpose, expiresAt },
    });

    try {
      await this.whatsapp.sendText(
        phone,
        `Kode OTP Dicuciin Anda: ${code}. Berlaku 5 menit. Jangan bagikan kode ini ke siapa pun.`,
      );
    } catch {
      // Kode tidak pernah sampai: hapus agar tidak bisa diverifikasi dan tidak
      // menghabiskan kuota per jam; klien mendapat error yang jelas (bukan
      // "OTP terkirim").
      await this.prisma.otpCode.delete({ where: { id: otp.id } }).catch(() => undefined);
      throw new ServiceUnavailableException(
        'Gagal mengirim OTP via WhatsApp. Periksa nomor Anda dan coba lagi.',
      );
    }

    return { message: 'OTP terkirim via WhatsApp', expiresInSeconds: OTP_TTL_MS / 1000 };
  }

  /**
   * Verifikasi OTP. Baris OTP dikunci (FOR UPDATE) sehingga tebakan paralel
   * dihitung satu per satu (batas 5 per kode tidak bisa dilewati) dan satu
   * kode hanya menghasilkan satu verification token.
   */
  async verifyOtp(rawPhone: string, code: string, purpose: OtpPurpose = OtpPurpose.REGISTER) {
    const phone = this.canonical(rawPhone);
    const variants = phoneCandidates(phone);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.otpCode.findFirst({
        where: { phone: { in: variants }, purpose, consumedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!latest) return 'NOT_FOUND' as const;
      await tx.$queryRaw`SELECT id FROM otp_codes WHERE id = ${latest.id} FOR UPDATE`;
      const otp = await tx.otpCode.findUniqueOrThrow({ where: { id: latest.id } });

      if (otp.consumedAt) return 'NOT_FOUND' as const;
      if (otp.expiresAt < new Date()) return 'EXPIRED' as const;
      if (otp.attempts >= OTP_MAX_ATTEMPTS) return 'TOO_MANY' as const;

      const isValid = await bcrypt.compare(code, otp.codeHash);
      if (!isValid) {
        await tx.otpCode.update({
          where: { id: otp.id },
          data: { attempts: { increment: 1 } },
        });
        return 'WRONG' as const;
      }
      await tx.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
      return 'OK' as const;
    });

    switch (outcome) {
      case 'NOT_FOUND':
        throw new UnauthorizedException('OTP tidak ditemukan. Minta kode baru.');
      case 'EXPIRED':
        throw new UnauthorizedException('OTP sudah kedaluwarsa. Minta kode baru.');
      case 'TOO_MANY':
        throw new UnauthorizedException('OTP terlalu banyak salah. Minta kode baru.');
      case 'WRONG':
        throw new UnauthorizedException('Kode OTP salah');
    }

    const payload: VerificationTokenPayload = { phone, purpose, scope: OTP_VERIFIED_SCOPE };
    const verificationToken = await this.jwtService.signAsync(payload, {
      secret: this.otpSecret(),
      expiresIn: OTP_VERIFICATION_TTL,
    });

    return { verificationToken };
  }

  /**
   * Validasi verification token untuk sebuah nomor & purpose. Nomor dibandingkan
   * dalam bentuk kanonik (token dari app lama memuat nomor mentah `08…`).
   */
  async assertVerifiedPhone(
    token: string,
    phone: string,
    purpose: OtpPurpose,
  ): Promise<{ issuedAt: Date | null }> {
    let payload: VerificationTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<VerificationTokenPayload>(token, {
        secret: this.otpSecret(),
      });
    } catch {
      throw new BadRequestException('Token verifikasi tidak valid atau kedaluwarsa');
    }

    const tokenPhone = normalizePhone(payload.phone);
    const wanted = normalizePhone(phone);
    if (
      payload.scope !== OTP_VERIFIED_SCOPE ||
      payload.purpose !== purpose ||
      !tokenPhone ||
      tokenPhone !== wanted
    ) {
      throw new BadRequestException('Token verifikasi tidak cocok dengan nomor ini');
    }
    return { issuedAt: typeof payload.iat === 'number' ? new Date(payload.iat * 1000) : null };
  }

  private generateCode(): string {
    // 4 digit (aplikasi meminta 4 digit), dari CSPRNG.
    return randomInt(0, 10_000).toString().padStart(4, '0');
  }
}
