import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma, UserSegment, VoucherStatus, VoucherType } from '@prisma/client';
import { VoucherService } from './voucher.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/** UserVoucher ACTIVE retail nominal 10rb, valid hari ini. */
function userVoucher(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uv1',
    customerId: 'cust-1',
    partnerId: null,
    segment: UserSegment.RETAIL,
    code: 'WELCOME-AAAA',
    status: VoucherStatus.ACTIVE,
    expiresAt: new Date(Date.now() + 86_400_000),
    template: {
      id: 'tpl1',
      voucherType: VoucherType.NOMINAL_DISCOUNT,
      value: new Prisma.Decimal(10000),
      maxDiscount: null,
      minTransaction: null,
      applicableServices: null,
      applicableOutlets: null,
      tierRestriction: null,
      b2bTierRestriction: null,
      isActive: true,
      segment: UserSegment.RETAIL,
    },
    ...overrides,
  };
}

describe('VoucherService.validate', () => {
  let service: VoucherService;
  let prisma: { userVoucher: { findUnique: jest.Mock } };

  const items = [{ serviceId: 'svc-1', subtotal: 50000 }];

  beforeEach(async () => {
    prisma = { userVoucher: { findUnique: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [VoucherService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(VoucherService);
  });

  it('voucher valid → diskon nominal', async () => {
    prisma.userVoucher.findUnique.mockResolvedValue(userVoucher());
    const res = await service.validate({ code: 'WELCOME-AAAA', segment: UserSegment.RETAIL, items });
    expect(res.discount.toNumber()).toBe(10000);
  });

  it('expired voucher rejected', async () => {
    prisma.userVoucher.findUnique.mockResolvedValue(
      userVoucher({ expiresAt: new Date(Date.now() - 86_400_000) }),
    );
    await expect(
      service.validate({ code: 'WELCOME-AAAA', segment: UserSegment.RETAIL, items }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('non-active voucher rejected', async () => {
    prisma.userVoucher.findUnique.mockResolvedValue(
      userVoucher({ status: VoucherStatus.USED }),
    );
    await expect(
      service.validate({ code: 'WELCOME-AAAA', segment: UserSegment.RETAIL, items }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('B2B user cannot use retail-only voucher', async () => {
    prisma.userVoucher.findUnique.mockResolvedValue(
      userVoucher({ segment: UserSegment.RETAIL }),
    );
    await expect(
      service.validate({ code: 'WELCOME-AAAA', segment: UserSegment.B2B, items }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retail user cannot use B2B-only voucher', async () => {
    prisma.userVoucher.findUnique.mockResolvedValue(
      userVoucher({
        segment: UserSegment.B2B,
        template: { ...userVoucher().template, segment: UserSegment.B2B },
      }),
    );
    await expect(
      service.validate({ code: 'WELCOME-AAAA', segment: UserSegment.RETAIL, items }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('VoucherService.redeem', () => {
  let service: VoucherService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    prisma = {};
    tx = {
      voucherRedemption: {
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'red-1', ...data })),
      },
      userVoucher: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [VoucherService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(VoucherService);
  });

  it('satu transaksi tidak bisa pakai lebih dari satu voucher', async () => {
    tx.voucherRedemption.findFirst.mockResolvedValue({
      id: 'red-existing',
      orderId: 'o1',
      userVoucherId: 'uv1',
    });

    const res = await service.redeem(tx, {
      userVoucherId: 'uv2',
      orderId: 'o1',
      customerId: 'cust-1',
      discountApplied: 5000,
    });

    expect(res.id).toBe('red-existing');
    expect(tx.userVoucher.findUnique).not.toHaveBeenCalled();
    expect(tx.userVoucher.update).not.toHaveBeenCalled();
    expect(tx.voucherRedemption.create).not.toHaveBeenCalled();
  });

  it('voucher aktif bisa di-redeem dan dicatat di redemption ledger', async () => {
    tx.voucherRedemption.findFirst.mockResolvedValue(null);
    tx.userVoucher.findUnique.mockResolvedValue({ id: 'uv1', status: VoucherStatus.ACTIVE });

    const res = await service.redeem(tx, {
      userVoucherId: 'uv1',
      orderId: 'o1',
      customerId: 'cust-1',
      discountApplied: new Prisma.Decimal(10000),
    });

    expect(tx.userVoucher.update).toHaveBeenCalledWith({
      where: { id: 'uv1' },
      data: { status: VoucherStatus.USED, usedAt: expect.any(Date) },
    });
    expect(tx.voucherRedemption.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userVoucherId: 'uv1',
        orderId: 'o1',
        status: 'APPLIED',
      }),
    });
    expect(res.discountApplied.toString()).toBe('10000');
  });
});
