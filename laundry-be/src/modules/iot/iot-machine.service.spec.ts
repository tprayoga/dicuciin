import { BadRequestException } from '@nestjs/common';
import { IotMachineService } from './iot-machine.service';

function makePrisma(): any {
  return {
    order: { findUnique: jest.fn() },
    iotCommand: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(({ data }: any) => ({ id: 'cmd1', ...data })),
      update: jest.fn(({ data }: any) => ({ id: 'cmd1', ...data })),
    },
    iotDevice: { findUnique: jest.fn(), update: jest.fn() },
    iotEvent: { create: jest.fn() },
    machineBooking: { findUnique: jest.fn(), updateMany: jest.fn() },
  };
}

describe('IotMachineService', () => {
  let prisma: any;
  let mqtt: any;
  let service: IotMachineService;

  beforeEach(() => {
    prisma = makePrisma();
    mqtt = { publishCommand: jest.fn().mockReturnValue(true) };
    service = new IotMachineService(prisma, mqtt);
  });

  // ── createStartMachineCommand ──────────────────────────────────────────
  it('tidak bisa START jika order belum PAID', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'DRAFT' });
    await expect(
      service.createStartMachineCommand({ orderId: 'o1', deviceId: 'd1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.iotCommand.create).not.toHaveBeenCalled();
  });

  it('bisa START jika order PAID (membuat command PENDING + idempotencyKey)', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      orderNumber: 'ORD-1',
      status: 'PAID',
    });
    prisma.iotCommand.findUnique.mockResolvedValue(null);
    prisma.iotDevice.findUnique.mockResolvedValue({ id: 'd1', deviceCode: 'WASH-01' });

    const cmd = await service.createStartMachineCommand({ orderId: 'o1', deviceId: 'd1' });

    expect(cmd.status).toBe('PENDING');
    expect(prisma.iotCommand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          command: 'START_MACHINE',
          orderId: 'o1',
          deviceId: 'd1',
          idempotencyKey: 'start-machine-o1',
          status: 'PENDING',
        }),
      }),
    );
  });

  it('idempoten: order yang sama tidak membuat dua command aktif', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'PAID' });
    prisma.iotCommand.findUnique.mockResolvedValue({ id: 'existing', status: 'RUNNING' });

    const cmd = await service.createStartMachineCommand({ orderId: 'o1', deviceId: 'd1' });

    expect(cmd.id).toBe('existing');
    expect(prisma.iotCommand.create).not.toHaveBeenCalled();
  });

  it('publish=true menandai PUBLISHED + publish MQTT', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', orderNumber: 'ORD-1', status: 'PAID' });
    prisma.iotCommand.findUnique
      .mockResolvedValueOnce(null) // cek idempotency
      .mockResolvedValueOnce({
        id: 'cmd1',
        status: 'PENDING',
        command: 'START_MACHINE',
        payload: {},
        device: { deviceCode: 'WASH-01' },
      }); // markPublished load
    prisma.iotDevice.findUnique.mockResolvedValue({ id: 'd1', deviceCode: 'WASH-01' });

    await service.createStartMachineCommand(
      { orderId: 'o1', deviceId: 'd1' },
      { publish: true },
    );

    expect(mqtt.publishCommand).toHaveBeenCalledWith(
      'WASH-01',
      'START_MACHINE',
      expect.objectContaining({ commandId: 'cmd1' }),
    );
    expect(prisma.iotCommand.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PUBLISHED' }) }),
    );
  });

  it('activateMachineForOrder tidak melempar bila order tak terikat mesin (return null)', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', status: 'PAID' });
    prisma.iotCommand.findUnique.mockResolvedValue(null);
    prisma.machineBooking.findUnique.mockResolvedValue(null); // tidak ada device

    const res = await service.activateMachineForOrder('o1');
    expect(res).toBeNull();
    expect(prisma.iotCommand.create).not.toHaveBeenCalled();
  });

  // ── handleDeviceEvent ──────────────────────────────────────────────────
  it('event dari device tak dikenal ditolak (untrusted, tidak dicatat)', async () => {
    prisma.iotDevice.findUnique.mockResolvedValue(null);
    const res: any = await service.handleDeviceEvent({ deviceCode: 'X', eventType: 'ACK' });
    expect(res.trusted).toBe(false);
    expect(prisma.iotEvent.create).not.toHaveBeenCalled();
  });

  it('event ACK → command ACKED', async () => {
    prisma.iotDevice.findUnique.mockResolvedValue({ id: 'd1', deviceCode: 'WASH-01' });
    prisma.iotCommand.findFirst.mockResolvedValue({ id: 'cmd1', status: 'PUBLISHED', orderId: 'o1' });
    const res: any = await service.handleDeviceEvent({ deviceCode: 'WASH-01', eventType: 'ACK' });
    expect(res.status).toBe('ACKED');
    expect(prisma.iotEvent.create).toHaveBeenCalled();
    expect(prisma.iotCommand.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cmd1' }, data: expect.objectContaining({ status: 'ACKED' }) }),
    );
  });

  it('event RUNNING → command RUNNING + booking IN_USE', async () => {
    prisma.iotDevice.findUnique.mockResolvedValue({ id: 'd1', deviceCode: 'WASH-01' });
    prisma.iotCommand.findFirst.mockResolvedValue({ id: 'cmd1', status: 'ACKED', orderId: 'o1' });
    const res: any = await service.handleDeviceEvent({ deviceCode: 'WASH-01', eventType: 'RUNNING' });
    expect(res.status).toBe('RUNNING');
    expect(prisma.machineBooking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IN_USE' }) }),
    );
  });

  it('event COMPLETED → command COMPLETED + booking DONE', async () => {
    prisma.iotDevice.findUnique.mockResolvedValue({ id: 'd1', deviceCode: 'WASH-01' });
    prisma.iotCommand.findFirst.mockResolvedValue({ id: 'cmd1', status: 'RUNNING', orderId: 'o1' });
    const res: any = await service.handleDeviceEvent({ deviceCode: 'WASH-01', eventType: 'COMPLETED' });
    expect(res.status).toBe('COMPLETED');
    expect(prisma.iotCommand.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED', executedAt: expect.any(Date) }) }),
    );
    expect(prisma.machineBooking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }),
    );
  });

  it('event ERROR → command FAILED', async () => {
    prisma.iotDevice.findUnique.mockResolvedValue({ id: 'd1', deviceCode: 'WASH-01' });
    prisma.iotCommand.findFirst.mockResolvedValue({ id: 'cmd1', status: 'RUNNING', orderId: 'o1' });
    const res: any = await service.handleDeviceEvent({ deviceCode: 'WASH-01', eventType: 'ERROR' });
    expect(res.status).toBe('FAILED');
  });

  it('event pada command terminal tidak mengubah status (anti regresi)', async () => {
    prisma.iotDevice.findUnique.mockResolvedValue({ id: 'd1', deviceCode: 'WASH-01' });
    prisma.iotCommand.findFirst.mockResolvedValue({ id: 'cmd1', status: 'COMPLETED', orderId: 'o1' });
    const res: any = await service.handleDeviceEvent({ deviceCode: 'WASH-01', eventType: 'RUNNING' });
    expect(res.commandUpdated).toBe(false);
    expect(prisma.iotCommand.update).not.toHaveBeenCalled();
  });

  it('HEARTBEAT hanya memperbarui device, tidak mengubah command', async () => {
    prisma.iotDevice.findUnique.mockResolvedValue({ id: 'd1', deviceCode: 'WASH-01' });
    const res: any = await service.handleDeviceEvent({ deviceCode: 'WASH-01', eventType: 'HEARTBEAT' });
    expect(res.trusted).toBe(true);
    expect(prisma.iotDevice.update).toHaveBeenCalled();
    expect(prisma.iotCommand.update).not.toHaveBeenCalled();
  });
});
