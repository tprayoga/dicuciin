import { ConflictException, NotFoundException } from '@nestjs/common';
import { OutletsService } from './outlets.service';

// Alur negatif: hapus outlet tidak boleh merusak transaksi; outlet nonaktif tidak ditawarkan ke pelanggan.
describe('OutletsService (hapus & daftar)', () => {
  let prisma: any;
  let service: OutletsService;

  beforeEach(() => {
    prisma = {
      outlet: {
        findUnique: jest.fn().mockResolvedValue({ id: 'out-1' }),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      order: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new OutletsService(prisma);
  });

  it('outlet yang sudah bertransaksi tidak bisa dihapus (409, pesan jelas)', async () => {
    prisma.order.count.mockResolvedValue(3);
    await expect(service.remove('out-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove('out-1')).rejects.toThrow('Nonaktifkan outlet');
    expect(prisma.outlet.delete).not.toHaveBeenCalled();
  });

  it('outlet tanpa transaksi bisa dihapus', async () => {
    await expect(service.remove('out-1')).resolves.toEqual({ message: 'Outlet deleted successfully' });
    expect(prisma.outlet.delete).toHaveBeenCalledWith({ where: { id: 'out-1' } });
  });

  it('hapus outlet yang tidak ada → 404', async () => {
    prisma.outlet.findUnique.mockResolvedValue(null);
    await expect(service.remove('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('daftar untuk pelanggan hanya berisi outlet aktif; admin melihat semua + jumlah staf & mesin', async () => {
    await service.findAll(1, 10, true);
    expect(prisma.outlet.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
    expect(prisma.outlet.count).toHaveBeenCalledWith({ where: { isActive: true } });

    await service.findAll(1, 10, false);
    const adminQuery = prisma.outlet.findMany.mock.calls[1][0];
    expect(adminQuery.where).toEqual({});
    expect(adminQuery.include._count.select.iotDevices).toBe(true);
    expect(adminQuery.include._count.select.outletUsers).toEqual({ where: { user: { isActive: true } } });
  });
});
