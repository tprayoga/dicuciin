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
      },
    };
    const ordersService = { create: jest.fn() };
    const bookingsService = { listOutletMachines: jest.fn() };
    const paymentsService = {
      createKioskGatewayPayment: jest.fn(),
      getStatus: jest.fn(),
      simulatePaid: jest.fn(),
    };
    const transactionService = { checkout: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('development') };
    return {
      prisma,
      transactionService,
      service: new KiosksService(
        prisma as any,
        ordersService as any,
        bookingsService as any,
        paymentsService as any,
        transactionService as any,
        config as any,
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

  it('checkout device memakai outlet/kiosk dari device token', async () => {
    const { prisma, service, transactionService } = setup();
    prisma.kiosk.findUnique.mockResolvedValue(baseKiosk);
    transactionService.checkout.mockResolvedValue({ orderId: 'o1' });

    await service.checkoutDeviceOrder('device-token', {
      customerId: 'cust-1',
      items: [{ serviceId: 'svc-1', quantity: 1 }],
      voucherCode: 'WELCOME',
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
    });
  });

  it('checkout device resolve customer dari phone/member code', async () => {
    const { prisma, service, transactionService } = setup();
    prisma.kiosk.findUnique.mockResolvedValue(baseKiosk);
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-lookup' });
    transactionService.checkout.mockResolvedValue({ orderId: 'o1' });

    await service.checkoutDeviceOrder('device-token', {
      customerLookup: '08123456789',
      items: [{ serviceId: 'svc-1', quantity: 1 }],
    });

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { memberCode: '08123456789' },
          { user: { phone: '08123456789' } },
          { user: { email: '08123456789' } },
        ],
      },
      select: { id: true },
    });
    expect(transactionService.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-lookup' }),
    );
  });
});
