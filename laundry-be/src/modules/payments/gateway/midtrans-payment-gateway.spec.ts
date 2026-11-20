import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
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

  it('memverifikasi signature dengan MIDTRANS_SIGNATURE_KEY bila diisi', () => {
    const signatureSecret = 'Mid-server-signature-secret';
    const payload = {
      order_id: 'PG-ORD-6',
      status_code: '200',
      gross_amount: '10000.00',
      transaction_status: 'settlement',
    };
    const sign = (key: string) =>
      createHash('sha512')
        .update(
          `${payload.order_id}${payload.status_code}${payload.gross_amount}${key}`,
        )
        .digest('hex');
    const gw = gateway({ MIDTRANS_SIGNATURE_KEY: signatureSecret });

    expect(
      gw.parseWebhook({ ...payload, signature_key: sign(signatureSecret) }),
    ).toMatchObject({ status: 'PAID' });
    // Signature yang dibuat dengan Server Key tidak lagi diterima.
    expect(() =>
      gw.parseWebhook({ ...payload, signature_key: sign(serverKey) }),
    ).toThrow(UnauthorizedException);
  });

  it('memakai Signature Secret Key untuk verifikasi, Server Key untuk API', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        transaction_id: 'trx-7',
        va_numbers: [{ bank: 'bni', va_number: '999' }],
      }),
    } as Response);

    await gateway({ MIDTRANS_SIGNATURE_KEY: 'sig-only' }).createCharge({
      orderNumber: 'ORD-7',
      amount: 10000,
      method: 'VA',
      bank: 'BNI',
    });

    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`,
    );
  });

  it('penolakan channel (402 di body) dibalas 422 dengan pesan ramah', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        status_code: '402',
        status_message: 'Payment channel is not activated.',
      }),
    } as Response);

    const promise = gateway().createCharge({
      orderNumber: 'ORD-8',
      amount: 10000,
      method: 'QRIS',
    });
    await expect(promise).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(promise).rejects.toThrow('Metode pembayaran ini belum tersedia');
  });

  it('key ditolak (HTTP 401) dibalas 422, bukan 5xx', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    } as unknown as Response);

    await expect(
      gateway().createCharge({ orderNumber: 'ORD-9', amount: 10000, method: 'QRIS' }),
    ).rejects.toThrow('Pembayaran sedang tidak dapat diproses');
  });

  it('gagal koneksi ke Midtrans dibalas 422', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));

    await expect(
      gateway().createCharge({ orderNumber: 'ORD-10', amount: 10000, method: 'QRIS' }),
    ).rejects.toThrow('Gagal terhubung ke layanan pembayaran');
  });

  it('mewajibkan Server Key', () => {
    expect(() => gateway({ MIDTRANS_SERVER_KEY: '' })).toThrow(
      'MIDTRANS_SERVER_KEY wajib diisi',
    );
  });

  // ── Batch 2: expire/status (adaptor; perilaku sandbox NOT_VERIFIED) ──────
  const res = (body: Record<string, unknown>, ok = true) =>
    ({ ok, json: async () => body }) as Response;

  it('charge memakai paymentNumber percobaan sebagai order_id Midtrans', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      res({ transaction_id: 't', va_numbers: [{ bank: 'bca', va_number: '123' }] }),
    );
    await gateway().createCharge({ orderNumber: 'ORD-1', paymentNumber: 'PG-ORD-1-2', amount: 1000, method: 'VA', bank: 'BCA' });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.transaction_details.order_id).toBe('PG-ORD-1-2');
  });

  it('cancelCharge: expire sukses → EXPIRED (POST /v2/{id}/expire)', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      res({ status_code: '407', transaction_status: 'expire' }),
    );
    await expect(gateway().cancelCharge('PG-ORD-1')).resolves.toBe('EXPIRED');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sandbox.midtrans.com/v2/PG-ORD-1/expire');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('cancelCharge: ditolak karena sudah settlement → cek status → PAID', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(res({ status_code: '412', status_message: 'cannot modify' }, false))
      .mockResolvedValueOnce(res({ status_code: '200', transaction_status: 'settlement' }));
    await expect(gateway().cancelCharge('PG-ORD-1')).resolves.toBe('PAID');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.sandbox.midtrans.com/v2/PG-ORD-1/status');
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('GET');
  });

  it('getChargeStatus: 404 → NOT_FOUND; pending → PENDING; deny → FAILED', async () => {
    const g = gateway();
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(res({ status_code: '404' }, false))
      .mockResolvedValueOnce(res({ status_code: '201', transaction_status: 'pending' }))
      .mockResolvedValueOnce(res({ status_code: '202', transaction_status: 'deny' }));
    await expect(g.getChargeStatus('a')).resolves.toBe('NOT_FOUND');
    await expect(g.getChargeStatus('b')).resolves.toBe('PENDING');
    await expect(g.getChargeStatus('c')).resolves.toBe('FAILED');
  });
});
