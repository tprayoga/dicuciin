import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../common/prisma/prisma.service';

jest.mock('../../common/utils/sequence.util', () => ({
  generateDailySequence: jest.fn().mockResolvedValue('ORD-TEST-001'),
}));

describe('OrdersService.create', () => {
  let service: OrdersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      outlet: { findUnique: jest.fn().mockResolvedValue({ id: 'out-1' }) },
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
      servicePrice: {
        findMany: jest.fn().mockResolvedValue([
          {
            serviceId: 'svc-1',
            price: new Prisma.Decimal('85500'),
            unit: 'kg',
            service: { name: 'Cuci Setrika' },
          },
        ]),
      },
      promo: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      order: { create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'ord-1', ...data })) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  const baseDto = {
    outletId: 'out-1',
    customerId: 'cust-1',
    sourcePlatform: 'APP',
    items: [{ serviceId: 'svc-1', quantity: 1 }],
  } as any;

  it('menghitung subtotal/total eksak tanpa promo', async () => {
    await service.create(baseDto);
    const data = prisma.order.create.mock.calls[0][0].data;
    expect(data.subtotal.toString()).toBe('85500');
    expect(data.discountAmount.toString()).toBe('0');
    expect(data.totalAmount.toString()).toBe('85500');
  });

  it('promo PERCENTAGE 20% → diskon 17100, total 68400 (eksak)', async () => {
    const now = new Date();
    prisma.promo.findUnique.mockResolvedValue({
      id: 'promo-1',
      isActive: true,
      startDate: new Date(now.getTime() - 86_400_000),
      endDate: new Date(now.getTime() + 86_400_000),
      quota: null,
      usedCount: 0,
      promoType: 'PERCENTAGE',
      value: new Prisma.Decimal(20),
      rules: [],
    });
    await service.create({ ...baseDto, promoCode: 'WELCOME20' });
    const data = prisma.order.create.mock.calls[0][0].data;
    expect(data.subtotal.toString()).toBe('85500');
    expect(data.discountAmount.toString()).toBe('17100');
    expect(data.totalAmount.toString()).toBe('68400');
    // kuota promo dinaikkan
    expect(prisma.promo.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: { usedCount: { increment: 1 } },
    });
  });

  it('deliveryFee ditambahkan ke total', async () => {
    await service.create({ ...baseDto, deliveryFee: 10000 });
    const data = prisma.order.create.mock.calls[0][0].data;
    expect(data.totalAmount.toString()).toBe('95500'); // 85500 + 10000
  });

  it('outlet tidak ada → NotFound', async () => {
    prisma.outlet.findUnique.mockResolvedValue(null);
    await expect(service.create(baseDto)).rejects.toBeInstanceOf(NotFoundException);
  });
});
