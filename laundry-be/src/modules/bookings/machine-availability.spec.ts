import { BookingStatus } from '@prisma/client';
import { effectiveMachineStatus, machineStatsByOutlet, occupancyOf } from './machine-availability';
import { IotService } from '../iot/iot.service';
import { OutletsService } from '../outlets/outlets.service';
import { CustomersService } from '../customers/customers.service';

// Admin & aplikasi harus menghitung mesin dengan aturan yang sama.
// Kasus nyata produksi (alam sutera): 5 mesin IoT AVAILABLE, 1 manual ONLINE,
// 2 mesin baru OFFLINE → aplikasi "6 dari 8 tersedia"; admin dulu menampilkan
// 5 mesin AVAILABLE sebagai "Offline".
const ALAM_SUTERA = [
  { id: 'w1', outletId: 'o1', status: 'AVAILABLE', controlMode: 'IOT' },
  { id: 'w2', outletId: 'o1', status: 'AVAILABLE', controlMode: 'IOT' },
  { id: 'w3', outletId: 'o1', status: 'AVAILABLE', controlMode: 'IOT' },
  { id: 'w4', outletId: 'o1', status: 'AVAILABLE', controlMode: 'IOT' },
  { id: 'd1', outletId: 'o1', status: 'AVAILABLE', controlMode: 'IOT' },
  { id: 'd2', outletId: 'o1', status: 'ONLINE', controlMode: 'MANUAL' },
  { id: 'w5', outletId: 'o1', status: 'OFFLINE', controlMode: 'IOT' },
  { id: 'w6', outletId: 'o1', status: 'OFFLINE', controlMode: 'IOT' },
];

describe('effectiveMachineStatus', () => {
  it('status perangkat IoT AVAILABLE/ONLINE = Tersedia', () => {
    expect(effectiveMachineStatus({ status: 'AVAILABLE', controlMode: 'IOT' })).toBe('AVAILABLE');
    expect(effectiveMachineStatus({ status: 'ONLINE', controlMode: 'IOT' })).toBe('AVAILABLE');
  });
  it('perangkat RUNNING = dipakai, ERROR = offline (bukan "Tersedia")', () => {
    expect(effectiveMachineStatus({ status: 'RUNNING', controlMode: 'IOT' })).toBe('IN_USE');
    expect(effectiveMachineStatus({ status: 'ERROR', controlMode: 'IOT' })).toBe('OFFLINE');
  });
  it('booking aktif menang atas status perangkat', () => {
    expect(effectiveMachineStatus({ status: 'AVAILABLE' }, BookingStatus.RESERVED)).toBe('RESERVED');
    expect(effectiveMachineStatus({ status: 'AVAILABLE' }, BookingStatus.IN_USE)).toBe('IN_USE');
  });
  it('manual: hanya MAINTENANCE yang tidak tersedia; OFFLINE tetap dari perangkat IoT', () => {
    expect(effectiveMachineStatus({ status: 'OFFLINE', controlMode: 'MANUAL' })).toBe('AVAILABLE');
    expect(effectiveMachineStatus({ status: 'MAINTENANCE', controlMode: 'MANUAL' })).toBe('MAINTENANCE');
    expect(effectiveMachineStatus({ status: 'OFFLINE', controlMode: 'IOT' })).toBe('OFFLINE');
  });
});

describe('machineStatsByOutlet (angka kartu outlet admin = angka aplikasi)', () => {
  const db = (bookings: any[] = []) => ({
    iotDevice: { findMany: jest.fn().mockResolvedValue(ALAM_SUTERA) },
    machineBooking: { findMany: jest.fn().mockResolvedValue(bookings) },
  });

  it('kasus produksi: 6 dari 8 tersedia, 2 nonaktif', async () => {
    const stats = await machineStatsByOutlet(db() as any, ['o1', 'o2']);
    expect(stats.get('o1')).toMatchObject({ total: 8, available: 6, busy: 0, offline: 2 });
    expect(stats.get('o2')).toMatchObject({ total: 0, available: 0 });
  });

  it('mesin yang dipesan/dipakai tidak dihitung tersedia', async () => {
    const stats = await machineStatsByOutlet(
      db([{ deviceId: 'w1', status: BookingStatus.HOLD }, { deviceId: 'w2', status: BookingStatus.IN_USE }]) as any,
      ['o1'],
    );
    expect(stats.get('o1')).toMatchObject({ total: 8, available: 4, busy: 2, offline: 2 });
  });

  it('hanya mesin cuci & pengering yang dihitung', async () => {
    const d = db();
    await machineStatsByOutlet(d as any, ['o1']);
    expect(d.iotDevice.findMany.mock.calls[0][0].where.deviceType).toEqual({ in: ['WASHING_MACHINE', 'DRYER_MACHINE'] });
  });

  it('occupancyOf konsisten dengan aplikasi', () => {
    expect(occupancyOf([{ status: 'AVAILABLE' }, { status: 'OFFLINE' }])).toMatchObject({ total: 2, available: 1, offline: 1, remark: 'Sepi' });
  });
});

describe('Kelola Mesin & kartu outlet memakai status yang sama', () => {
  it('GET /iot/devices menyertakan availability (kiosk → null)', async () => {
    const prisma: any = {
      iotDevice: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'w1', deviceType: 'WASHING_MACHINE', status: 'AVAILABLE', controlMode: 'IOT' },
          { id: 'k1', deviceType: 'KIOSK', status: 'ONLINE', controlMode: 'IOT' },
        ]),
        count: jest.fn().mockResolvedValue(2),
      },
      machineBooking: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const res = await new IotService(prisma).findAllDevices(1, 100);
    expect(res.data.map((d: any) => d.availability)).toEqual(['AVAILABLE', null]);
  });

  it('GET /outlets menyertakan machineStats', async () => {
    const prisma: any = {
      outlet: { findMany: jest.fn().mockResolvedValue([{ id: 'o1' }]), count: jest.fn().mockResolvedValue(1) },
      iotDevice: { findMany: jest.fn().mockResolvedValue(ALAM_SUTERA) },
      machineBooking: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const res = await new OutletsService(prisma).findAll(1, 50);
    expect((res.data[0] as any).machineStats).toMatchObject({ total: 8, available: 6, offline: 2 });
  });
});

describe('Kelola Member: pencarian & segmen di server', () => {
  const make = () => {
    const prisma: any = {
      customer: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      wallet: { aggregate: jest.fn().mockResolvedValue({ _sum: { balance: 125000 } }) },
    };
    return { prisma, svc: new CustomersService(prisma, {} as any) };
  };
  const whereOf = (prisma: any) => prisma.customer.findMany.mock.calls[0][0].where.AND;

  it('segmen "Punya saldo" menyaring saldo > 0', async () => {
    const { prisma, svc } = make();
    await svc.findAll(1, 20, { segment: 'balance' });
    expect(whereOf(prisma)[1]).toEqual({ wallet: { balance: { gt: 0 } } });
  });

  it('cari "0812" juga mencocokkan nomor tersimpan 62812…', async () => {
    const { prisma, svc } = make();
    await svc.findAll(1, 20, { search: '0812' });
    const or = whereOf(prisma)[2].OR;
    expect(or).toEqual(expect.arrayContaining([
      { user: { phone: { contains: '0812' } } },
      { user: { phone: { contains: '62812' } } },
    ]));
  });

  it('ringkasan kartu statistik dihitung terpisah dari filter', async () => {
    const { prisma, svc } = make();
    prisma.customer.count.mockResolvedValueOnce(3).mockResolvedValueOnce(40).mockResolvedValueOnce(5).mockResolvedValueOnce(12);
    const res = await svc.findAll(1, 20, { segment: 'new' });
    expect(res.meta.total).toBe(3);
    expect(res.meta.summary).toEqual({ totalMembers: 40, newThisMonth: 5, active30d: 12, totalBalance: 125000 });
  });
});
