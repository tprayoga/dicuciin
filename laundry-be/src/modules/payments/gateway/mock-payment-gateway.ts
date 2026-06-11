import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CreateChargeInput,
  CreateChargeResult,
  PaymentGateway,
} from './payment-gateway.interface';

const CHARGE_TTL_MS = 15 * 60 * 1000; // 15 menit

/**
 * Provider tiruan untuk scaffolding: menghasilkan qrString/vaNumber palsu tanpa
 * memanggil gateway nyata. Pembayaran "dikonfirmasi" lewat endpoint simulate
 * (dev) yang memanggil webhook handler. Ganti dengan provider nyata saat siap.
 */
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock';

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const externalId = `MOCK-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + CHARGE_TTL_MS);

    if (input.method === 'QRIS') {
      return {
        externalId,
        qrString: `MOCK-QRIS|${input.orderNumber}|${input.amount}|${externalId}`,
        expiresAt,
      };
    }

    // VA: nomor 16 digit deterministik-ish (prefix bank dummy + acak).
    const bank = input.bank ?? 'BCA';
    const vaNumber = `8808${Math.floor(1e11 + Math.random() * 9e11)}`;
    return { externalId, vaNumber, bank, expiresAt };
  }
}
