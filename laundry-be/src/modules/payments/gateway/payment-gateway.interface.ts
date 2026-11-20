/**
 * Abstraksi payment gateway agar QRIS/VA tidak terikat ke satu provider.
 * Implementasi nyata (Midtrans/Xendit/dll) tinggal mengganti binding token
 * PAYMENT_GATEWAY di module — service & controller tak perlu berubah.
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export type GatewayMethod = 'QRIS' | 'VA';

export interface CreateChargeInput {
  orderNumber: string;
  /**
   * ID transaksi unik di provider (Midtrans `order_id`) untuk PERCOBAAN ini.
   * Default `PG-<orderNumber>` (percobaan pertama, kompatibel data lama).
   */
  paymentNumber?: string;
  amount: number;
  method: GatewayMethod;
  bank?: string;
}

export interface CreateChargeResult {
  /** ID transaksi di sisi gateway (untuk korelasi webhook). */
  externalId: string;
  /** URL gambar QRIS (atau payload QR provider lain) — untuk method QRIS. */
  qrString?: string;
  /** Nomor Virtual Account — untuk method VA. */
  vaNumber?: string;
  bank?: string;
  expiresAt: Date;
}

export type GatewayWebhookStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';

export interface GatewayWebhookResult {
  /** ID transaksi dari provider, bila tersedia. */
  externalId?: string;
  /** Nomor pembayaran/order yang dikirim ke provider. */
  paymentNumber?: string;
  status: GatewayWebhookStatus;
  grossAmount?: number;
  rawStatus?: string;
}

/** Status tagihan menurut provider (sumber kebenaran untuk kedaluwarsa/settle). */
export type GatewayChargeStatus = GatewayWebhookStatus | 'CANCELLED' | 'NOT_FOUND';

export interface PaymentGateway {
  readonly name: string;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  /**
   * Batalkan/expire tagihan PENDING. Mengembalikan status AKHIR menurut
   * provider — bisa `PAID` bila tagihan keburu dibayar (balapan settle).
   */
  cancelCharge?(paymentNumber: string): Promise<GatewayChargeStatus>;
  /** Tanya status tagihan ke provider (verifikasi server-side). */
  getChargeStatus?(paymentNumber: string): Promise<GatewayChargeStatus>;
  /** Verifikasi autentisitas dan normalisasi webhook provider. */
  parseWebhook?(payload: Record<string, unknown>): GatewayWebhookResult;
}
