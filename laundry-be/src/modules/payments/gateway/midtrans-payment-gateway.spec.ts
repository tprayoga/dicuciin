import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { MidtransPaymentGateway } from './midtrans-payment-gateway';

describe('MidtransPaymentGateway', () => {
  const serverKey = 'SB-test-key';

  function gateway(overrides: Record<string, string> = {}) {
    return new MidtransPaymentGateway(
      new ConfigService({
        MIDTRANS_SERVER_KEY: serverKey,
        MIDTRANS_IS_PRODUCTION: 'false',
        MIDTRANS_EXPIRY_MINUTES: '15',
        ...overrides,
      }),
    );
  }

  afterEach(() => jest.restoreAllMocks());

  it('membuat charge QRIS dan mengambil URL QR v2', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        transaction_id: 'trx-1',
        actions: [
          { name: 'generate-qr-code', url: 'https://example.test/qr-v1' },
          { name: 'generate-qr-code-v2', url: 'https://example.test/qr-v2' },
        ],
      }),
    } as Response);

    const result = await gateway().createCharge({
      orderNumber: 'ORD-1',
      amount: 25000,
      method: 'QRIS',
    });

    expect(result.externalId).toBe('trx-1');
    expect(result.qrString).toBe('https://example.test/qr-v2');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.sandbox.midtrans.com/v2/charge',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      payment_type: 'qris',
      transaction_details: { order_id: 'PG-ORD-1', gross_amount: 25000 },
    });
  });

  it('membuat charge BCA VA', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        transaction_id: 'trx-2',
        va_numbers: [{ bank: 'bca', va_number: '1234567890' }],
      }),
    } as Response);

    const result = await gateway().createCharge({
      orderNumber: 'ORD-2',
      amount: 30000,
      method: 'VA',
      bank: 'BCA',
    });

    expect(result.vaNumber).toBe('1234567890');
    expect(result.bank).toBe('BCA');
  });

  it('menolak bank yang belum didukung', async () => {
    await expect(
      gateway().createCharge({
        orderNumber: 'ORD-3',
        amount: 30000,
        method: 'VA',
        bank: 'MANDIRI',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('memverifikasi signature dan memetakan settlement ke PAID', () => {
    const payload = {
      order_id: 'PG-ORD-4',
      status_code: '200',
      gross_amount: '40000.00',
      transaction_id: 'trx-4',
      transaction_status: 'settlement',
    };
    const signatureKey = createHash('sha512')
      .update(
        `${payload.order_id}${payload.status_code}${payload.gross_amount}${serverKey}`,
      )
      .digest('hex');

    expect(
      gateway().parseWebhook({ ...payload, signature_key: signatureKey }),
    ).toMatchObject({
      paymentNumber: 'PG-ORD-4',
      externalId: 'trx-4',
      status: 'PAID',
      grossAmount: 40000,
    });
  });

  it('menolak signature webhook palsu', () => {
    expect(() =>
      gateway().parseWebhook({
        order_id: 'PG-ORD-5',
        status_code: '200',
        gross_amount: '50000.00',
        transaction_status: 'settlement',
        signature_key: 'invalid',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('mewajibkan Server Key', () => {
    expect(() => gateway({ MIDTRANS_SERVER_KEY: '' })).toThrow(
      'MIDTRANS_SERVER_KEY wajib diisi',
    );
  });
});
