import { Injectable } from '@nestjs/common';

/**
 * Sumber konfigurasi loyalty terpusat (wrapper env). Tujuan: hentikan pembacaan
 * `process.env` langsung yang tersebar (mis. point rate di pricing & payments).
 *
 * Backward compatible: setiap getter punya default yang sama dengan perilaku lama.
 * Belum memakai tabel DB — bila nanti perlu config per-tenant/runtime, getter ini
 * jadi satu titik yang diganti ke `LoyaltyConfig` tabel tanpa mengubah pemanggil.
 */
@Injectable()
export class LoyaltyConfigService {
  private num(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private bool(value: string | undefined, fallback: boolean): boolean {
    if (value == null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }

  /** Rupiah per 1 poin saat earn. Default 1000 (perilaku lama dipertahankan). */
  get pointEarnRate(): number {
    return this.num(process.env.LOYALTY_POINT_RATE, 1000);
  }

  /**
   * Masa berlaku poin (hari). Default 365. CATATAN: saat ini earn TIDAK menyetel
   * `expiresAt` (tidak ada perilaku expiry). Nilai ini disediakan untuk job
   * point-expiry (Phase E); tidak diterapkan otomatis agar backward compatible.
   */
  get pointExpiryDays(): number {
    return this.num(process.env.LOYALTY_POINT_EXPIRY_DAYS, 365);
  }

  /**
   * Saat refund, balikkan (debit) cashback bonus tier yang sempat dikreditkan.
   * Default false → perilaku lama (cashback bonus TIDAK ditarik balik saat refund).
   */
  get reverseTierCashbackOnRefund(): boolean {
    return this.bool(process.env.LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND, false);
  }
}
