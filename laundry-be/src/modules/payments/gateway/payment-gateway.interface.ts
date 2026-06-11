/**
 * Abstraksi payment gateway agar QRIS/VA tidak terikat ke satu provider.
 * Implementasi nyata (Midtrans/Xendit/dll) tinggal mengganti binding token
 * PAYMENT_GATEWAY di module — service & controller tak perlu berubah.
 */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export type GatewayMethod = 'QRIS' | 'VA';

export interface CreateChargeInput {
  orderNumber: string;
  amount: number;
  method: GatewayMethod;
  bank?: string;
}

export interface CreateChargeResult {
  /** ID transaksi di sisi gateway (untuk korelasi webhook). */
  externalId: string;
  /** Payload QRIS (string untuk render QR) — untuk method QRIS. */
  qrString?: string;
  /** Nomor Virtual Account — untuk method VA. */
  vaNumber?: string;
  bank?: string;
  expiresAt: Date;
}

export interface PaymentGateway {
  readonly name: string;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
}
