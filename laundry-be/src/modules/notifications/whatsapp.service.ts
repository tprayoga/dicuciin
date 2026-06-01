import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * WhatsappService — pengirim pesan WhatsApp (mis. untuk OTP).
 *
 * Provider default: Fonnte (https://fonnte.com) — cukup token API.
 * Konfigurasi via env:
 *   WA_PROVIDER  (default: "fonnte")
 *   WA_API_KEY   (token provider)
 *   WA_SENDER    (opsional, nomor pengirim/device)
 *
 * Dev fallback: bila WA_API_KEY kosong, pesan hanya di-log ke console
 * supaya alur OTP bisa diuji tanpa biaya / kredensial.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly configService: ConfigService) {}

  /** Kirim pesan teks ke nomor (format internasional tanpa '+', mis. 6281234567890). */
  async sendText(phone: string, message: string): Promise<void> {
    const apiKey = this.configService.get<string>('WA_API_KEY');
    const provider = this.configService.get<string>('WA_PROVIDER', 'fonnte');

    if (!apiKey) {
      this.logger.warn(
        `[WA dev-fallback] WA_API_KEY kosong — pesan tidak benar-benar dikirim. To: ${phone} | ${message}`,
      );
      return;
    }

    const target = this.normalizePhone(phone);

    try {
      if (provider === 'fonnte') {
        await this.sendViaFonnte(apiKey, target, message);
      } else {
        this.logger.error(`WA provider '${provider}' belum didukung.`);
        throw new Error(`Unsupported WA provider: ${provider}`);
      }
    } catch (err) {
      this.logger.error(
        `Gagal kirim WhatsApp ke ${target}: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }

  private async sendViaFonnte(apiKey: string, target: string, message: string): Promise<void> {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target, message }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Fonnte HTTP ${response.status}: ${text}`);
    }

    const result = (await response.json().catch(() => null)) as { status?: boolean } | null;
    if (result && result.status === false) {
      throw new Error(`Fonnte menolak pengiriman: ${JSON.stringify(result)}`);
    }
  }

  /** Normalisasi ke format Fonnte: digit saja, awalan 62 (Indonesia). */
  private normalizePhone(phone: string): string {
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = `62${digits.slice(1)}`;
    }
    return digits;
  }
}
