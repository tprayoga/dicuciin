import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { IotService } from './iot.service';

// Alur negatif: menghapus mesin tidak boleh ikut menghapus booking pelanggan yang masih berjalan.
describe('IotService.removeDevice', () => {
  let prisma: any;
  let service: IotService;

  beforeEach(() => {
    prisma = {
      iotDevice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'dev-1' }),
        delete: jest.fn().mockResolvedValue({}),
      },
      machineBooking: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new IotService(prisma);
  });

  it('mesin dengan booking aktif (HOLD/RESERVED/IN_USE) ditolak dihapus (409)', async () => {
    prisma.machineBooking.count.mockResolvedValue(1);
    await expect(service.removeDevice('dev-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.iotDevice.delete).not.toHaveBeenCalled();
    expect(prisma.machineBooking.count).toHaveBeenCalledWith({
      where: {
        deviceId: 'dev-1',
        status: { in: [BookingStatus.HOLD, BookingStatus.RESERVED, BookingStatus.IN_USE] },
      },
    });
  });

  it('mesin tanpa booking aktif bisa dihapus', async () => {
    await expect(service.removeDevice('dev-1')).resolves.toEqual({ message: 'Device deleted successfully' });
    expect(prisma.iotDevice.delete).toHaveBeenCalledWith({ where: { id: 'dev-1' } });
  });

  it('mesin yang tidak ada → 404', async () => {
    prisma.iotDevice.findUnique.mockResolvedValue(null);
    await expect(service.removeDevice('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
