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
    };
    const ordersService = { create: jest.fn() };
    const bookingsService = { listOutletMachines: jest.fn() };
    const paymentsService = {
      createKioskGatewayPayment: jest.fn(),
      getStatus: jest.fn(),
      simulatePaid: jest.fn(),
    };
    const config = { get: jest.fn().mockReturnValue('development') };
    return {
      prisma,
      service: new KiosksService(
        prisma as any,
        ordersService as any,
        bookingsService as any,
        paymentsService as any,
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
});
