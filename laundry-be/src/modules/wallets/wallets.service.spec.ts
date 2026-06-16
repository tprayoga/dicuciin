import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, OrderStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { WalletsService } from './wallets.service';
import { PromosService } from '../promos/promos.service';
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
      payment: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
      order: {
        update: jest.fn().mockResolvedValue({ status: OrderStatus.PAID }),
      },
      orderStatusLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      wallet: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        upsert: jest.fn(),
      },
      order: { findUnique: jest.fn() },
      walletTransaction: { findUnique: jest.fn() },
      customer: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PromosService, useValue: { commitUsage: jest.fn() } },
      ],
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
      tx.wallet.updateMany.mockResolvedValue({
        count: opts.decrementCount ?? 1,
      });
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

    it('membuat wallet saldo nol untuk customer lama yang belum punya wallet', async () => {
      prisma.wallet.findUnique.mockResolvedValue(null);
      prisma.customer.findUnique.mockResolvedValue({ id: 'cust-1' });
      prisma.wallet.upsert.mockResolvedValue({ id: 'w-new', balance: 0 });
      tx.wallet.update.mockResolvedValue({
        id: 'w-new',
        balance: new Prisma.Decimal('50000'),
      });

      await service.topup('cust-1', { amount: 50000 } as any);

      expect(prisma.wallet.upsert).toHaveBeenCalledWith({
        where: { customerId: 'cust-1' },
        update: {},
        create: { customerId: 'cust-1', balance: 0 },
      });
      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w-new' },
        data: { balance: { increment: 50000 } },
      });
    });
  });

  describe('refund', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({
        role: UserRole.SUPER_ADMIN,
        outletUsers: [],
      });
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-1',
        customerId: 'cust-1',
        status: OrderStatus.PAID,
        customer: { userId: 'user-1' },
        payments: [
          {
            id: 'pay-1',
            amount: new Prisma.Decimal('68400'),
            status: 'PAID',
          },
        ],
      });
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      tx.wallet.update.mockResolvedValue({
        id: 'w-1',
        balance: new Prisma.Decimal('350000'),
      });
    });

    it('mengembalikan nominal payment ke wallet dan menandai order refunded', async () => {
      await service.refund('cust-1', 'user-1', {
        orderId: 'ord-1',
        description: 'Salah memilih layanan',
      });

      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-1', status: 'PAID' },
        data: {
          status: 'REFUNDED',
          notes: 'Salah memilih layanan',
        },
      });
      expect(tx.wallet.update).toHaveBeenCalledWith({
        where: { id: 'w-1' },
        data: { balance: { increment: new Prisma.Decimal('68400') } },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'ord-1' },
        data: {
          status: OrderStatus.REFUNDED,
          cancelReason: 'Salah memilih layanan',
        },
      });
    });

    it('menolak refund order milik customer lain', async () => {
      await expect(
        service.refund('cust-1', 'user-lain', {
          orderId: 'ord-1',
          description: 'Salah memilih layanan',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('menolak refund setelah proses laundry dimulai', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        customerId: 'cust-1',
        status: OrderStatus.WASHING,
        customer: { userId: 'user-1' },
        payments: [{ id: 'pay-1', amount: new Prisma.Decimal('68400') }],
      });

      await expect(
        service.refund('cust-1', 'user-1', {
          orderId: 'ord-1',
          description: 'Salah memilih layanan',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('admin dapat refund order customer dan tercatat sebagai pelaku', async () => {
      await service.refundByAdmin('ord-1', 'admin-1', 'Refund disetujui admin');

      expect(tx.orderStatusLog.create).toHaveBeenCalledWith({
        data: {
          orderId: 'ord-1',
          status: OrderStatus.REFUNDED,
          notes: 'Refund disetujui admin',
          createdBy: 'admin-1',
        },
      });
    });

    it('admin outlet tidak dapat refund order dari outlet lain', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: UserRole.ADMIN_OUTLET,
        outletUsers: [{ outletId: 'outlet-lain' }],
      });

      await expect(
        service.refundByAdmin('ord-1', 'admin-1', 'Refund disetujui admin'),
      ).rejects.toBeInstanceOf(ForbiddenException);
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
      await expect(
        service.verifyPin('cust-1', 'user-1', '123456'),
      ).resolves.toEqual({
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
