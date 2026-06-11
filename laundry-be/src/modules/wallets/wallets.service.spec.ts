import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { WalletsService } from './wallets.service';
import { PrismaService } from '../../common/prisma/prisma.service';

jest.mock('bcrypt');

describe('WalletsService', () => {
  let service: WalletsService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      wallet: {
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      walletTransaction: { create: jest.fn().mockResolvedValue({}) },
      payment: { create: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({ status: OrderStatus.PAID }) },
      orderStatusLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      wallet: { findUnique: jest.fn() },
      order: { findUnique: jest.fn() },
      walletTransaction: { findUnique: jest.fn() },
      customer: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [WalletsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(WalletsService);
  });

  describe('pay', () => {
    const dto = { orderId: 'ord-1', amount: 68400 };

    function setup(opts: {
      walletBalanceAfter?: string;
      orderStatus?: OrderStatus;
      orderCustomerId?: string | null;
      decrementCount?: number;
    }) {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-1',
        customerId: opts.orderCustomerId ?? 'cust-1',
        status: opts.orderStatus ?? OrderStatus.WAITING_PAYMENT,
      });
      tx.wallet.updateMany.mockResolvedValue({ count: opts.decrementCount ?? 1 });
      tx.wallet.findUniqueOrThrow.mockResolvedValue({
        id: 'w-1',
        balance: new Prisma.Decimal(opts.walletBalanceAfter ?? '281600'),
      });
    }

    it('sukses: saldo dipotong, balanceBefore/after eksak, order PAID', async () => {
      setup({ walletBalanceAfter: '281600' });
      const res: any = await service.pay('cust-1', dto);

      // updateMany dipanggil dengan guard saldo >= amount (potong atomik)
      expect(tx.wallet.updateMany).toHaveBeenCalledWith({
        where: { id: 'w-1', balance: { gte: 68400 } },
        data: { balance: { decrement: 68400 } },
      });
      // balanceBefore = after + amount = 281600 + 68400 = 350000
      const txnArg = tx.walletTransaction.create.mock.calls[0][0].data;
      expect(txnArg.balanceBefore.toString()).toBe('350000');
      expect(txnArg.balanceAfter.toString()).toBe('281600');
      expect(txnArg.amount).toBe(-68400);
      expect(res.order.status).toBe(OrderStatus.PAID);
    });

    it('saldo tidak cukup (decrement count 0) → BadRequest', async () => {
      setup({ decrementCount: 0 });
      await expect(service.pay('cust-1', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('order sudah PAID → Conflict (tanpa masuk transaksi)', async () => {
      setup({ orderStatus: OrderStatus.PAID });
      await expect(service.pay('cust-1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('order milik customer lain → Unauthorized', async () => {
      setup({ orderCustomerId: 'cust-LAIN' });
      await expect(service.pay('cust-1', dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('order tidak ada → NotFound', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.pay('cust-1', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('bentrok unik (P2002) di transaksi → Conflict (double-pay)', async () => {
      setup({});
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '5.8.0',
        }),
      );
      await expect(service.pay('cust-1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('topup', () => {
    it('increment atomik; balanceBefore diturunkan dari hasil', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });
      tx.wallet.update.mockResolvedValue({
        id: 'w-1',
        balance: new Prisma.Decimal('331600'),
      });
      await service.topup('cust-1', { amount: 50000 } as any);

      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w-1' },
        data: { balance: { increment: 50000 } },
      });
      const txnArg = tx.walletTransaction.create.mock.calls[0][0].data;
      expect(txnArg.balanceBefore.toString()).toBe('281600'); // 331600 - 50000
      expect(txnArg.balanceAfter.toString()).toBe('331600');
    });

    it('idempotencyKey ganda (P2002) → Conflict', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '5.8.0',
        }),
      );
      await expect(
        service.topup('cust-1', { amount: 50000, idempotencyKey: 'k1' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('verifyPin', () => {
    beforeEach(() => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'cust-1',
        userId: 'user-1',
        walletPinHash: '$2b$10$hash',
      });
    });

    it('PIN benar → valid:true', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(service.verifyPin('cust-1', 'user-1', '123456')).resolves.toEqual({
        valid: true,
      });
    });

    it('PIN salah → Unauthorized', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.verifyPin('cust-1', 'user-1', '000000'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('customer milik user lain → Unauthorized', async () => {
      await expect(
        service.verifyPin('cust-1', 'user-LAIN', '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
