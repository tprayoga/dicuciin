import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { B2BPartnerTier, Prisma, OrderStatus, UserSegment } from '@prisma/client';
import { TransactionService } from './transaction.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PricingService } from '../pricing/pricing.service';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';
import { VoucherService } from '../vouchers/voucher.service';
import { PointService } from '../points/point.service';
import { MembershipTierService } from '../memberships/membership-tier.service';
import { B2BPartnerService } from '../partners/b2b-partner.service';
import { PromosService } from '../promos/promos.service';
import { CampaignService } from '../campaigns/campaign.service';
import { LoyaltyConfigService } from '../loyalty-config/loyalty-config.service';
import { IotMachineService } from '../iot/iot-machine.service';
import { PaymentsService } from '../payments/payments.service';

// Batch 4: kebijakan voucher refund diuji nyata di integration (refund-voucher-policy).
jest.mock('../orders/voucher-refund-policy', () => ({
  restoreVoucherAfterRefundInTx: jest.fn().mockResolvedValue({ restored: true }),
}));
import { restoreVoucherAfterRefundInTx } from '../orders/voucher-refund-policy';

jest.mock('../../common/utils/sequence.util', () => ({
  generateDailySequence: jest.fn().mockResolvedValue('ORD-TEST-001'),
}));

function baseBreakdown(overrides: Record<string, unknown> = {}) {
  return {
    basePrice: 50000,
    b2bDiscount: 0,
    happyHourDiscount: 0,
    voucherDiscount: 0,
    promoDiscount: 0,
    discountSource: 'NONE',
    deliveryFee: 0,
    spendingAmount: 50000,
    finalAmount: 50000,
    pointsToEarn: 50,
    cashbackToCredit: 0,
    ...overrides,
  };
}

describe('TransactionService', () => {
  let service: TransactionService;
  let prisma: any;
  let tx: any;
  let mocks: any;

  beforeEach(async () => {
    tx = {
      order: {
        create: jest.fn().mockResolvedValue({ id: 'o1', orderNumber: 'ORD-TEST-001' }),
        update: jest.fn().mockResolvedValue({ id: 'o1', status: OrderStatus.REFUNDED }),
      },
      payment: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderStatusLog: { create: jest.fn().mockResolvedValue({}) },
      b2BPricingRuleUsage: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      // Batch 1.5: pengikatan HOLD app lama (tidak ada HOLD → tidak diikat).
      service: { findMany: jest.fn().mockResolvedValue([{ machineType: 'WASHER' }]) },
      machineBooking: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma = {
      order: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(async ({ where }: any) => ({
          id: where.id,
          orderNumber: 'ORD-TEST-001',
          status: OrderStatus.PAID,
          subtotal: new Prisma.Decimal(50000),
          deliveryFee: new Prisma.Decimal(0),
          totalAmount: new Prisma.Decimal(50000),
          pricingSnapshot: { version: 1, basePrice: 50000, voucherDiscount: 0 },
        })),
      },
      b2BPartner: { findUnique: jest.fn() },
      walletLedger: {
        findMany: jest.fn().mockResolvedValue([
          { direction: 'DEBIT', walletType: 'MAIN_BALANCE', amount: new Prisma.Decimal(50000), referenceType: 'PAYMENT' },
        ]),
      },
      pointLedger: { aggregate: jest.fn().mockResolvedValue({ _sum: { points: 50 } }) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };

    mocks = {
      ordersService: {
        priceItems: jest.fn().mockResolvedValue({
          orderItems: [{ serviceId: 'svc-1', subtotal: new Prisma.Decimal(50000) }],
          subtotal: new Prisma.Decimal(50000),
          estimatedMinutes: null,
        }),
        create: jest.fn().mockResolvedValue({ id: 'o1' }),
        cancel: jest.fn().mockResolvedValue({}),
      },
      paymentsService: { payOrderWithWalletForPayer: jest.fn().mockResolvedValue({ status: 'PAID' }) },
      pricingService: { calculate: jest.fn().mockResolvedValue(baseBreakdown()) },
      walletService: {
        getOrCreateWallet: jest.fn().mockResolvedValue({ id: 'w1' }),
        payWithWallet: jest.fn().mockResolvedValue({
          bonusUsed: new Prisma.Decimal(0),
          mainUsed: new Prisma.Decimal(50000),
        }),
        creditCashback: jest.fn().mockResolvedValue({}),
        credit: jest.fn().mockResolvedValue({}),
      },
      voucherService: { redeem: jest.fn(), reverseRedemption: jest.fn() },
      pointService: { earn: jest.fn(), reverseForOrder: jest.fn() },
      membershipTierService: {
        ensureStatus: jest.fn().mockResolvedValue({ currentTier: 'SILVER' }),
        recordSuccessfulTransaction: jest.fn(),
        reverseTransaction: jest.fn(),
      },
      b2bPartnerService: {
        recordSuccessfulTransaction: jest.fn(),
        reverseTransaction: jest.fn(),
      },
      promosService: { commitUsage: jest.fn() },
      campaignService: {
        qualifyReferralOnFirstTransaction: jest.fn(),
        handleTopupCashback: jest.fn(),
        consumeHappyHourQuota: jest.fn(),
      },
      iotMachineService: { activateMachineForOrder: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersService, useValue: mocks.ordersService },
        { provide: PricingService, useValue: mocks.pricingService },
        { provide: WalletLedgerService, useValue: mocks.walletService },
        { provide: VoucherService, useValue: mocks.voucherService },
        { provide: PointService, useValue: mocks.pointService },
        { provide: MembershipTierService, useValue: mocks.membershipTierService },
        { provide: B2BPartnerService, useValue: mocks.b2bPartnerService },
        { provide: PromosService, useValue: mocks.promosService },
        { provide: CampaignService, useValue: mocks.campaignService },
        { provide: IotMachineService, useValue: mocks.iotMachineService },
        { provide: PaymentsService, useValue: mocks.paymentsService },
        LoyaltyConfigService,
      ],
    }).compile();
    service = moduleRef.get(TransactionService);
  });

  const checkoutInput = {
    customerId: 'cust-1',
    outletId: 'out-1',
    items: [{ serviceId: 'svc-1', quantity: 1 }],
  };

  // Batch 3: checkout = order ber-harga (mesin pricing tunggal + reservasi) lalu
  // dibayar lewat jalur bayar-saldo tunggal (PaymentsService). Efek nyata
  // (voucher APPLIED, kuota, ledger, poin, B2B) diuji di
  // test/integration/checkout-pricing.int-spec.ts (PostgreSQL nyata).
  it('checkout = buat order ber-harga lalu bayar lewat jalur saldo tunggal', async () => {
    const res = await service.checkout(checkoutInput);
    expect(res.status).toBe(OrderStatus.PAID);
    expect(mocks.ordersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1', outletId: 'out-1' }),
      'cust-1',
      expect.objectContaining({
        totalAmount: new Prisma.Decimal(50000),
        snapshot: expect.objectContaining({ version: 1, finalAmount: 50000 }),
      }),
    );
    expect(mocks.paymentsService.payOrderWithWalletForPayer).toHaveBeenCalledWith({ customerId: 'cust-1' }, 'o1');
    expect(res.breakdown.mainBalanceUsed).toBe(50000);
    expect(res.breakdown.pointEarned).toBe(50);
  });

  it('voucher & happy hour masuk snapshot harga order (direservasi saat order dibuat)', async () => {
    mocks.pricingService.calculate.mockResolvedValue(
      baseBreakdown({
        discountSource: 'VOUCHER',
        voucherDiscount: 10000,
        happyHourDiscount: 5000,
        spendingAmount: 35000,
        finalAmount: 35000,
        voucherId: 'uv1',
        voucherCode: 'WELCOME-AAAA',
        happyHourRules: [{ ruleId: 'hh-1', quantity: 1, discountAmount: 5000 }],
      }),
    );
    await service.checkout({ ...checkoutInput, voucherCode: 'WELCOME-AAAA' });
    const priced = mocks.ordersService.create.mock.calls[0][2];
    expect(priced.totalAmount).toEqual(new Prisma.Decimal(35000));
    expect(priced.snapshot).toMatchObject({
      voucherId: 'uv1',
      voucherDiscount: 10000,
      happyHourRules: [{ ruleId: 'hh-1', quantity: 1, discountAmount: 5000 }],
    });
  });

  it('B2B: harga segmen B2B, dibayar dari dompet partner', async () => {
    prisma.b2BPartner.findUnique.mockResolvedValue({ id: 'p1', status: 'ACTIVE', tier: B2BPartnerTier.GOLD_PARTNER });
    mocks.walletService.getOrCreateWallet.mockResolvedValue({ id: 'wallet-b2b' });
    const res = await service.checkout({ partnerId: 'p1', outletId: 'out-1', items: [{ serviceId: 'svc-1', quantity: 1 }] });
    expect(res.segment).toBe(UserSegment.B2B);
    expect(mocks.pricingService.calculate).toHaveBeenCalledWith(
      expect.objectContaining({ segment: UserSegment.B2B, partnerId: 'p1', b2bTier: B2BPartnerTier.GOLD_PARTNER }),
    );
    expect(mocks.ordersService.create.mock.calls[0][2]).toMatchObject({ partnerId: 'p1' });
    expect(mocks.paymentsService.payOrderWithWalletForPayer).toHaveBeenCalledWith({ partnerId: 'p1' }, 'o1');
  });

  it('pembayaran B2B ditolak jika partner belum approved/aktif (tanpa order)', async () => {
    prisma.b2BPartner.findUnique.mockResolvedValue({ id: 'p1', status: 'SUSPENDED', tier: B2BPartnerTier.BUSINESS_PARTNER });
    await expect(
      service.checkout({ partnerId: 'p1', outletId: 'out-1', items: [{ serviceId: 'svc-1', quantity: 1 }] }),
    ).rejects.toThrow('Partner B2B belum approved/aktif');
    expect(mocks.ordersService.create).not.toHaveBeenCalled();
  });

  it('saldo kurang → error diteruskan & order yang baru dibuat DIBATALKAN (tanpa order yatim)', async () => {
    mocks.paymentsService.payOrderWithWalletForPayer.mockRejectedValue(new BadRequestException('Saldo tidak mencukupi'));
    await expect(service.checkout(checkoutInput)).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.ordersService.cancel).toHaveBeenCalledWith(
      'o1',
      expect.anything(),
      undefined,
      undefined,
      { requireUnpaid: true },
    );
  });

  it('checkout dengan orderId membayar order YANG ADA — tidak membuat order baru', async () => {
    await service.checkout({ ...checkoutInput, orderId: 'o-existing' });
    expect(mocks.ordersService.create).not.toHaveBeenCalled();
    expect(mocks.paymentsService.payOrderWithWalletForPayer).toHaveBeenCalledWith({ customerId: 'cust-1' }, 'o-existing');
  });

  it('voucher tidak valid → ditolak sebelum order dibuat', async () => {
    mocks.pricingService.calculate.mockRejectedValue(new BadRequestException('Voucher sudah kedaluwarsa'));
    await expect(service.checkout({ ...checkoutInput, voucherCode: 'EXPIRED' })).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.ordersService.create).not.toHaveBeenCalled();
  });

  it('quote mengembalikan estimasi durasi dari server', async () => {
    mocks.ordersService.priceItems.mockResolvedValue({
      orderItems: [{ serviceId: 'svc-1', subtotal: new Prisma.Decimal(20000) }],
      subtotal: new Prisma.Decimal(20000),
      estimatedMinutes: 120,
    });
    const q: any = await service.quote(checkoutInput);
    expect(q.estimatedMinutes).toBe(120);
  });

  it('refund mengembalikan saldo, poin, voucher, dan tier', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      status: OrderStatus.PAID,
      customerId: 'cust-1',
      partnerId: null,
      totalAmount: new Prisma.Decimal(50000),
      deliveryFee: new Prisma.Decimal(0),
      payments: [{ id: 'pay1', amount: new Prisma.Decimal(50000), status: 'PAID' }],
      walletLedgers: [
        {
          walletId: 'w1',
          walletType: 'MAIN_BALANCE',
          amount: new Prisma.Decimal(50000),
          direction: 'DEBIT',
        },
      ],
    });

    const res = await service.refund('o1', 'admin-1', 'Pesanan dibatalkan');
    expect(res.status).toBe(OrderStatus.REFUNDED);
    expect(mocks.walletService.credit).toHaveBeenCalledTimes(1);
    expect(mocks.pointService.reverseForOrder).toHaveBeenCalledWith(tx, 'w1', 'o1');
    expect(restoreVoucherAfterRefundInTx).toHaveBeenCalledWith(tx, 'o1', 'admin-1');
    expect(mocks.membershipTierService.reverseTransaction).toHaveBeenCalled();
  });

  it('refund men-debit balik cashback bonus tier hanya saat flag aktif (default off = tidak)', async () => {
    const prev = process.env.LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND;
    process.env.LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND = 'true';
    try {
      prisma.order.findUnique.mockResolvedValue({
        id: 'o1',
        status: OrderStatus.PAID,
        customerId: 'cust-1',
        partnerId: null,
        totalAmount: new Prisma.Decimal(50000),
        deliveryFee: new Prisma.Decimal(0),
        payments: [{ id: 'pay1', amount: new Prisma.Decimal(50000), status: 'PAID' }],
        walletLedgers: [
          {
            walletId: 'w1',
            walletType: 'MAIN_BALANCE',
            amount: new Prisma.Decimal(50000),
            direction: 'DEBIT',
          },
        ],
      });
      tx.walletLedger = {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'cb1', walletId: 'w1', amount: new Prisma.Decimal(5000) }]),
      };
      tx.wallet = {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'w1', bonusBalance: new Prisma.Decimal(5000) }),
      };
      mocks.walletService.debit = jest.fn().mockResolvedValue({});

      await service.refund('o1', 'admin-1', 'Refund + cashback reversal');

      expect(tx.walletLedger.findMany).toHaveBeenCalled();
      expect(mocks.walletService.debit).toHaveBeenCalledWith(
        'BONUS_BALANCE',
        expect.objectContaining({ walletId: 'w1', idempotencyKey: 'refund-cashback-o1-cb1' }),
      );
    } finally {
      process.env.LOYALTY_REVERSE_TIER_CASHBACK_ON_REFUND = prev;
    }
  });

  it('refund B2B rollback akumulasi partner', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      status: OrderStatus.PAID,
      customerId: null,
      partnerId: 'p1',
      totalAmount: new Prisma.Decimal(45000),
      deliveryFee: new Prisma.Decimal(0),
      payments: [{ id: 'pay1', amount: new Prisma.Decimal(45000), status: 'PAID' }],
      walletLedgers: [
        {
          walletId: 'wallet-b2b',
          walletType: 'MAIN_BALANCE',
          amount: new Prisma.Decimal(45000),
          direction: 'DEBIT',
        },
      ],
    });

    await service.refund('o1', 'admin-1', 'Void B2B');

    expect(mocks.b2bPartnerService.reverseTransaction).toHaveBeenCalledWith(
      tx,
      'p1',
      expect.any(Prisma.Decimal),
    );
    expect(mocks.membershipTierService.reverseTransaction).not.toHaveBeenCalled();
  });
});
