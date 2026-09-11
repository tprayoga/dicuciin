import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import {
  CreateChargeInput,
  CreateChargeResult,
  GatewayWebhookResult,
  PaymentGateway,
} from './payment-gateway.interface';

type MidtransAction = { name?: string; url?: string };
type MidtransVa = { bank?: string; va_number?: string };

type MidtransChargeResponse = {
  status_code?: string;
  status_message?: string;
  transaction_id?: string;
  transaction_status?: string;
  order_id?: string;
  expiry_time?: string;
  actions?: MidtransAction[];
  va_numbers?: MidtransVa[];
  permata_va_number?: string;
  bill_key?: string;
  biller_code?: string;
};

const SUPPORTED_VA_BANKS: Record<string, string> = {
  BCA: 'bca',
  BNI: 'bni',
  BRI: 'bri',
  PERMATA: 'permata',
};

@Injectable()
export class MidtransPaymentGateway implements PaymentGateway {
  readonly name = 'midtrans';

  private readonly serverKey: string;
  private readonly baseUrl: string;
  private readonly expiryMinutes: number;

  constructor(private readonly config: ConfigService) {
    this.serverKey = this.config.get<string>('MIDTRANS_SERVER_KEY', '').trim();
    const isProduction =
      this.config.get<string>('MIDTRANS_IS_PRODUCTION', 'false') === 'true';
    this.expiryMinutes = Number(
      this.config.get<string>('MIDTRANS_EXPIRY_MINUTES', '15'),
    );

    if (!this.serverKey) {
      throw new Error(
        'MIDTRANS_SERVER_KEY wajib diisi saat PAYMENT_GATEWAY=midtrans',
      );
    }
    if (!Number.isInteger(this.expiryMinutes) || this.expiryMinutes < 1) {
      throw new Error(
        'MIDTRANS_EXPIRY_MINUTES harus berupa bilangan bulat positif',
      );
    }

    this.baseUrl = isProduction
      ? 'https://api.midtrans.com'
      : 'https://api.sandbox.midtrans.com';
  }

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const paymentNumber = `PG-${input.orderNumber}`;
    const payload: Record<string, unknown> = {
      transaction_details: {
        order_id: paymentNumber,
        gross_amount: Math.round(input.amount),
      },
      custom_expiry: {
        expiry_duration: this.expiryMinutes,
        unit: 'minute',
      },
    };

    if (input.method === 'QRIS') {
      payload.payment_type = 'qris';
      payload.qris = { acquirer: 'gopay' };
    } else {
      const requestedBank = (input.bank ?? '').trim().toUpperCase();
      const bank = SUPPORTED_VA_BANKS[requestedBank];
      if (!bank) {
        throw new BadRequestException(
          `Bank VA '${input.bank ?? ''}' belum didukung. Pilih BCA, BNI, BRI, atau Permata`,
        );
      }
      payload.payment_type = 'bank_transfer';
      payload.bank_transfer = { bank };
    }

    const response = await this.request<MidtransChargeResponse>(
      '/v2/charge',
      payload,
    );
    if (!response.transaction_id) {
      throw new BadGatewayException(
        response.status_message ||
          'Respons Midtrans tidak memiliki transaction_id',
      );
    }

    const expiresAt = new Date(Date.now() + this.expiryMinutes * 60_000);
    if (input.method === 'QRIS') {
      const qrAction =
        response.actions?.find(
          (action) => action.name === 'generate-qr-code-v2',
        ) ??
        response.actions?.find((action) => action.name === 'generate-qr-code');
      if (!qrAction?.url) {
        throw new BadGatewayException('Midtrans tidak mengembalikan URL QRIS');
      }
      return {
        externalId: response.transaction_id,
        qrString: qrAction.url,
        expiresAt,
      };
    }

    const va = response.va_numbers?.[0];
    const vaNumber = va?.va_number ?? response.permata_va_number;
    if (!vaNumber) {
      throw new BadGatewayException(
        'Midtrans tidak mengembalikan nomor Virtual Account',
      );
    }
    return {
      externalId: response.transaction_id,
      vaNumber,
      bank: (va?.bank ?? input.bank)?.toUpperCase(),
      expiresAt,
    };
  }

  parseWebhook(payload: Record<string, unknown>): GatewayWebhookResult {
    const orderId = this.requiredString(payload, 'order_id');
    const statusCode = this.requiredString(payload, 'status_code');
    const grossAmount = this.requiredString(payload, 'gross_amount');
    const signature = this.requiredString(payload, 'signature_key');
    const transactionStatus = this.requiredString(
      payload,
      'transaction_status',
    ).toLowerCase();
    const expected = createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${this.serverKey}`)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Signature webhook Midtrans tidak valid');
    }

    const fraudStatus = String(payload.fraud_status ?? '').toLowerCase();
    let status: GatewayWebhookResult['status'];
    if (
      transactionStatus === 'settlement' ||
      (transactionStatus === 'capture' &&
        (!fraudStatus || fraudStatus === 'accept'))
    ) {
      status = 'PAID';
    } else if (transactionStatus === 'pending') {
      status = 'PENDING';
    } else if (transactionStatus === 'expire') {
      status = 'EXPIRED';
    } else if (['deny', 'cancel', 'failure'].includes(transactionStatus)) {
      status = 'FAILED';
    } else {
      throw new BadRequestException(
        `Status Midtrans '${transactionStatus}' belum didukung`,
      );
    }

    return {
      externalId:
        typeof payload.transaction_id === 'string'
          ? payload.transaction_id
          : undefined,
      paymentNumber: orderId,
      status,
      grossAmount: Number(grossAmount),
      rawStatus: transactionStatus,
    };
  }

  private async request<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = (await response.json()) as MidtransChargeResponse;
      if (!response.ok) {
        throw new BadGatewayException(
          `Midtrans menolak transaksi: ${data.status_message ?? response.status}`,
        );
      }
      return data as T;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadGatewayException(`Gagal terhubung ke Midtrans: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private requiredString(
    payload: Record<string, unknown>,
    key: string,
  ): string {
    const value = payload[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`Payload Midtrans tidak memiliki ${key}`);
    }
    return value;
  }
}
