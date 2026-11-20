// Batch 4: verifikasi PIN asli (kunci baris, penguncian) diuji di integration;
// di sini PIN '123456' = benar, lainnya salah.
jest.mock('../../common/auth/wallet-pin', () => {
  const { BadRequestException } = jest.requireActual('@nestjs/common');
  return {
    verifyWalletPinWithLockout: jest.fn(async (_p: unknown, _c: string, pin?: string) => {
      if (!pin) throw new BadRequestException('PIN wallet wajib diisi untuk membayar dengan saldo');
      if (pin !== '123456') throw new BadRequestException('PIN salah');
    }),
  };
});
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { KiosksService } from './kiosks.service';

describe('KiosksService enrollment', () => {
  const baseKiosk = {
    id: 'kiosk-1',
    outletId: 'outlet-1',
    kioskCode: 'KSK-001',
    name: 'Kiosk Utama',
    location: 'Lobby',
    status: 'ACTIVE',
    lastHeartbeat: null,
    enrollmentCodeHash: null,
    enrollmentCodeExpiresAt: null,
    deviceTokenHash: 'hash',
    deviceId: 'device-1',
    enrolledAt: new Date(),
    tokenRevokedAt: null,
    scheduleEnabled: false,
    scheduleDays: '1,2,3,4,5,6,7',
    scheduleOpenTime: '07:00',
    scheduleCloseTime: '22:00',
    timezone: 'Asia/Jakarta',
    createdAt: new Date(),
    updatedAt: new Date(),
    outlet: { id: 'outlet-1', name: 'Outlet A', code: 'OUT-001' },
  };

  function setup() {
    const prisma = {
      kiosk: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      kioskSession: {
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      customer: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payment: { findUnique: jest.fn() },
      order: { findUnique: jest.fn() },
    };
    const ordersService = { create: jest.fn() };
    const bookingsService = { listOutletMachines: jest.fn() };
    const paymentsService = {
      createKioskGatewayPayment: jest.fn(),
      getStatus: jest.fn(),
      simulatePaid: jest.fn(),
    };
    const transactionService = { checkout: jest.fn(), createOrder: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('development') };
    return {
      prisma,
      transactionService,
      ordersService,
      service: new KiosksService(
        prisma as any,
        ordersService as any,
        bookingsService as any,
        paymentsService as any,
        transactionService as any,
        config as any,
        { getMachineStatusForOrder: jest.fn(), startKioskOrder: jest.fn() } as any,
      ),
    };
  }

  it('menolak kode enrollment yang tidak valid', async () => {
    const { prisma, service } = setup();
    prisma.kiosk.findFirst.mockResolvedValue(null);

    await expect(service.enroll('123456', 'device-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('memulihkan kiosk enrolled tanpa login staff', async () => {
    const { prisma, service } = setup();
    prisma.kiosk.findUnique.mockResolvedValue(baseKiosk);

    const result = await service.bootstrap('device-token');

    expect(result.kiosk.id).toBe('kiosk-1');
    expect(result.kiosk.isEnrolled).toBe(true);
    expect(result.kiosk.deviceTokenHash).toBeUndefined();
    expect(result.schedule.isOpen).toBe(true);
  });

  it('menolak runtime session ketika jadwal tidak aktif', async () => {
    const { prisma, service } = setup();
    prisma.kiosk.findUnique.mockResolvedValue({
      ...baseKiosk,
      scheduleEnabled: true,
      scheduleDays: '',
    });

    await expect(
      service.startDeviceSession('device-token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // Batch 1.5: checkout kiosk = bayar SALDO → wajib mesin + PIN wallet.
  const PIN = '123456';
  const pinHash = require('bcrypt').hashSync(PIN, 4);

  it('checkout device memakai outlet/kiosk dari device token + mesin terpilih', async () => {
    const { prisma, service, transactionService } = setup();
    prisma.kiosk.findUnique.mockResolvedValue(baseKiosk);
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
    prisma.customer.findUnique.mockResolvedValue({
      walletPinHash: pinHash,
      walletPinLockedUntil: null,
    });
    transactionService.checkout.mockResolvedValue({ orderId: 'o1' });

    await service.checkoutDeviceOrder('device-token', {
      customerId: 'cust-1',
      items: [{ serviceId: 'svc-1', quantity: 1 }],
      voucherCode: 'WELCOME',
      deviceId: 'dev-1',
      pin: PIN,
    });

    expect(transactionService.checkout).toHaveBeenCalledWith({
      customerId: 'cust-1',
      partnerId: undefined,
      outletId: 'outlet-1',
      kioskId: 'kiosk-1',
      sourcePlatform: 'KIOSK',
      items: [{ serviceId: 'svc-1', quantity: 1 }],
      voucherCode: 'WELCOME',
      promoCode: undefined,
      deviceId: 'dev-1',
      deviceCode: undefined,
    });
  });

  it('checkout device resolve customer dari phone/member code', async () => {
    const { prisma, service, transactionService } = setup();
    prisma.kiosk.findUnique.mockResolvedValue(baseKiosk);
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-lookup' });
    prisma.customer.findUnique.mockResolvedValue({
      walletPinHash: pinHash,
      walletPinLockedUntil: null,
    });
    transactionService.checkout.mockResolvedValue({ orderId: 'o1' });

    await service.checkoutDeviceOrder('device-token', {
      customerLookup: '08123456789',
      items: [{ serviceId: 'svc-1', quantity: 1 }],
      deviceId: 'dev-1',
      pin: PIN,
    });

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: '08123456789' },
          { memberCode: '08123456789' },
          // Batch 5 (T6): semua format nomor yang setara.
          {
            user: {
              phone: { in: ['628123456789', '08123456789', '+628123456789', '8123456789'] },
            },
          },
          { user: { email: '08123456789' } },
        ],
      },
      select: { id: true },
    });
    expect(transactionService.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-lookup' }),
    );
  });

  it('checkout saldo tanpa PIN / PIN salah ditolak, saldo tidak disentuh', async () => {
    const { prisma, service, transactionService } = setup();
    prisma.kiosk.findUnique.mockResolvedValue(baseKiosk);
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
    prisma.customer.findUnique.mockResolvedValue({
      walletPinHash: pinHash,
      walletPinLockedUntil: null,
    });
    prisma.customer.update.mockResolvedValue({ walletPinFailedAttempts: 1 });
    const base = {
      customerLookup: '0812',
      items: [{ serviceId: 'svc-1', quantity: 1 }],
      deviceId: 'dev-1',
    };

    await expect(service.checkoutDeviceOrder('device-token', base)).rejects.toThrow(
      'PIN wallet wajib',
    );
    await expect(
      service.checkoutDeviceOrder('device-token', { ...base, pin: '000000' }),
    ).rejects.toThrow('PIN salah');
    expect(transactionService.checkout).not.toHaveBeenCalled();
  });

  it('order/checkout kiosk tanpa mesin ditolak (kiosk versi lama)', async () => {
    const { prisma, service, transactionService, ordersService } = setup();
    prisma.kiosk.findUnique.mockResolvedValue(baseKiosk);
    await expect(
      service.createDeviceOrder('device-token', {
        outletId: 'x',
        sourcePlatform: 'KIOSK',
        items: [{ serviceId: 'svc-1', quantity: 1 }],
        notes: 'Mesin W1 (WM-01)',
      } as any),
    ).rejects.toThrow('Pilih mesin');
    await expect(
      service.checkoutDeviceOrder('device-token', {
        customerLookup: '0812',
        items: [{ serviceId: 'svc-1', quantity: 1 }],
        pin: PIN,
      }),
    ).rejects.toThrow('Pilih mesin');
    expect(ordersService.create).not.toHaveBeenCalled();
    expect(transactionService.createOrder).not.toHaveBeenCalled();
    expect(transactionService.checkout).not.toHaveBeenCalled();
  });

  it('order kiosk mengikat mesin & mengabaikan jadwal/identitas kiosk/voucher dari klien', async () => {
    const { prisma, service, transactionService } = setup();
    prisma.kiosk.findUnique.mockResolvedValue(baseKiosk);
    transactionService.createOrder.mockResolvedValue({ id: 'o1' });
    await service.createDeviceOrder('device-token', {
      outletId: 'outlet-lain',
      kioskId: 'kiosk-lain',
      sourcePlatform: 'MOBILE_APP',
      items: [{ serviceId: 'svc-1', quantity: 1 }],
      deviceId: 'dev-1',
      scheduledAt: '2099-01-01T00:00:00Z',
      voucherCode: 'VOUCHER-ORANG',
    } as any);
    // Batch 3: harga terpadu lewat TransactionService.createOrder.
    expect(transactionService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        outletId: 'outlet-1',
        kioskId: 'kiosk-1',
        sourcePlatform: 'KIOSK',
        deviceId: 'dev-1',
        scheduledAt: undefined,
        voucherCode: undefined,
      }),
    );
  });


  it('status pembayaran/order kiosk lain → 404/403', async () => {
    const { prisma, service } = setup();
    prisma.kiosk.findUnique.mockResolvedValue(baseKiosk);
    prisma.payment.findUnique.mockResolvedValue({ order: { kioskId: 'kiosk-2' } });
    prisma.order.findUnique.mockResolvedValue({ kioskId: 'kiosk-2' });
    await expect(service.devicePaymentStatus('device-token', 'PAY-1')).rejects.toThrow(
      'Payment not found',
    );
    await expect(service.simulateDevicePayment('device-token', 'PAY-1')).rejects.toThrow(
      'Payment not found',
    );
    await expect(service.deviceMachineStatus('device-token', 'o-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.retryDeviceMachineStart('device-token', 'o-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
