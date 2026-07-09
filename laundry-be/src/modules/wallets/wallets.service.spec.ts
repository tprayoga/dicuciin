import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Prisma,
  OrderStatus,
  UserRole,
  WalletType,
  LedgerDirection,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { WalletsService } from './wallets.service';
import { PromosService } from '../promos/promos.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { PrismaService } from '../../common/prisma/prisma.service';

jest.mock('bcrypt');

/**
 * Mutasi saldo didelegasikan ke WalletLedgerService (di-mock di sini). Atomicity
 * & guard saldo diuji di wallet-ledger.service.spec.ts. Spec ini fokus pada
 * orkestrasi WalletsService: validasi, efek order, dan histori wallet_transactions.
 */
describe('WalletsService', () => {
  let service: WalletsService;
  let prisma: any;
  let tx: any;
  let ledger: any;

  const dec = (v: string | number) => new Prisma.Decimal(v);

  // Baris ledger lengkap (WalletLedgerService.create) — respons service kini
  // menurunkan field `transaction` dari sini via mapLedgerToTransaction.
  const fullLedger = (o: Record<string, any>) => ({
    id: 'l-1',
    walletId: 'w-1',
    orderId: null,
    direction: LedgerDirection.CREDIT,
    amount: dec(0),
    balanceBefore: dec(0),
    balanceAfter: dec(0),
    referenceType: 'TOPUP',
    description: null,
    idempotencyKey: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    ...o,
  });

  beforeEach(async () => {
    tx = {
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
        upsert: jest.fn(),
      },
      order: { findUnique: jest.fn() },
      customer: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    ledger = {
      topUp: jest
        .fn()
        .mockResolvedValue(fullLedger({ referenceType: 'TOPUP' })),
      debit: jest.fn().mockResolvedValue(
        fullLedger({ direction: LedgerDirection.DEBIT, referenceType: 'PAYMENT' }),
      ),
      credit: jest
        .fn()
        .mockResolvedValue(fullLedger({ referenceType: 'REFUND' })),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WalletsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PromosService, useValue: { commitUsage: jest.fn() } },
        { provide: WalletLedgerService, useValue: ledger },
      ],
    }).compile();
    service = moduleRef.get(WalletsService);
  });

  describe('pay', () => {
    const dto = { orderId: 'ord-1', amount: 68400 };

    function setup(opts: {
      orderStatus?: OrderStatus;
      orderCustomerId?: string | null;
    }) {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });
      prisma.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-1',
        customerId: opts.orderCustomerId ?? 'cust-1',
        status: opts.orderStatus ?? OrderStatus.WAITING_PAYMENT,
      });
      ledger.debit.mockResolvedValue(
        fullLedger({
          direction: LedgerDirection.DEBIT,
          referenceType: 'PAYMENT',
          orderId: 'ord-1',
          amount: dec('68400'),
          balanceBefore: dec('350000'),
          balanceAfter: dec('281600'),
        }),
      );
    }

    it('sukses: debit MAIN via WalletLedgerService, transaction dari ledger, order PAID', async () => {
      setup({});
      const res: any = await service.pay('cust-1', dto);

      // Mutasi saldo didelegasikan: MAIN_BALANCE, jumlah & ref benar.
      expect(ledger.debit).toHaveBeenCalledWith(
        WalletType.MAIN_BALANCE,
        expect.objectContaining({
          walletId: 'w-1',
          amount: 68400,
          orderId: 'ord-1',
          referenceType: 'PAYMENT',
        }),
      );
      // Respons `transaction` diturunkan dari ledger (amount bertanda negatif).
      expect(res.transaction.transactionType).toBe('PAYMENT');
      expect(res.transaction.amount.toString()).toBe('-68400');
      expect(res.transaction.balanceAfter.toString()).toBe('281600');
      expect(res.order.status).toBe(OrderStatus.PAID);
      expect(res.wallet.balance.toString()).toBe('281600');
    });

    it('saldo tidak cukup (ledger.debit menolak) → BadRequest', async () => {
      setup({});
      ledger.debit.mockRejectedValue(
        new BadRequestException('Saldo tidak mencukupi'),
      );
      await expect(service.pay('cust-1', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      // Efek order tidak terjadi bila mutasi saldo gagal.
      expect(tx.payment.create).not.toHaveBeenCalled();
    });

    it('order sudah PAID → Conflict (tanpa masuk transaksi)', async () => {
      setup({ orderStatus: OrderStatus.PAID });
      await expect(service.pay('cust-1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(ledger.debit).not.toHaveBeenCalled();
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
    it('delegasi ke WalletLedgerService.topUp; transaction & wallet dari ledger', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w-1' });
      ledger.topUp.mockResolvedValue(
        fullLedger({
          referenceType: 'TOPUP',
          amount: dec('50000'),
          balanceBefore: dec('281600'),
          balanceAfter: dec('331600'),
        }),
      );
      const res: any = await service.topup('cust-1', { amount: 50000 } as any);

      expect(ledger.topUp).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: 'w-1',
          amount: 50000,
          referenceType: 'TOPUP',
        }),
      );
      expect(res.transaction.transactionType).toBe('TOPUP');
      expect(res.transaction.amount.toString()).toBe('50000');
      expect(res.transaction.balanceAfter.toString()).toBe('331600');
      expect(res.wallet.balance.toString()).toBe('331600');
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
      ledger.topUp.mockResolvedValue({
        balanceBefore: dec('0'),
        balanceAfter: dec('50000'),
      });

      await service.topup('cust-1', { amount: 50000 } as any);

      expect(prisma.wallet.upsert).toHaveBeenCalledWith({
        where: { customerId: 'cust-1' },
        update: {},
        create: { customerId: 'cust-1', balance: 0 },
      });
      expect(ledger.topUp).toHaveBeenCalledWith(
        expect.objectContaining({ walletId: 'w-new', amount: 50000 }),
      );
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
            amount: dec('68400'),
            status: 'PAID',
          },
        ],
      });
      tx.payment.updateMany.mockResolvedValue({ count: 1 });
      ledger.credit.mockResolvedValue(
        fullLedger({
          referenceType: 'REFUND',
          orderId: 'ord-1',
          amount: dec('68400'),
          balanceBefore: dec('281600'),
          balanceAfter: dec('350000'),
        }),
      );
    });

    it('mengembalikan nominal payment ke wallet (via ledger) dan menandai order refunded', async () => {
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
      expect(ledger.credit).toHaveBeenCalledWith(
        WalletType.MAIN_BALANCE,
        expect.objectContaining({
          walletId: 'w-1',
          orderId: 'ord-1',
          referenceType: 'REFUND',
          idempotencyKey: 'refund-order-ord-1',
        }),
      );
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
        payments: [{ id: 'pay-1', amount: dec('68400') }],
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
