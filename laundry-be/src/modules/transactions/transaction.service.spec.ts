import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { B2BPartnerTier, Prisma, OrderStatus, UserSegment } from '@prisma/client';
import { TransactionService } from './transaction.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PricingService } from '../pricing/pricing.service';
import { WalletService } from '../wallets/wallet.service';
import { VoucherService } from '../vouchers/voucher.service';
import { PointService } from '../points/point.service';
import { MembershipTierService } from '../memberships/membership-tier.service';
import { B2BPartnerService } from '../partners/b2b-partner.service';
import { PromosService } from '../promos/promos.service';
import { CampaignService } from '../campaigns/campaign.service';

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
    };
    prisma = {
      order: { findUnique: jest.fn() },
      b2BPartner: { findUnique: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };

    mocks = {
      ordersService: {
        priceItems: jest.fn().mockResolvedValue({
          orderItems: [{ serviceId: 'svc-1', subtotal: new Prisma.Decimal(50000) }],
          subtotal: new Prisma.Decimal(50000),
        }),
      },
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
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersService, useValue: mocks.ordersService },
        { provide: PricingService, useValue: mocks.pricingService },
        { provide: WalletService, useValue: mocks.walletService },
        { provide: VoucherService, useValue: mocks.voucherService },
        { provide: PointService, useValue: mocks.pointService },
        { provide: MembershipTierService, useValue: mocks.membershipTierService },
        { provide: B2BPartnerService, useValue: mocks.b2bPartnerService },
        { provide: PromosService, useValue: mocks.promosService },
        { provide: CampaignService, useValue: mocks.campaignService },
      ],
    }).compile();
    service = moduleRef.get(TransactionService);
  });

  const checkoutInput = {
    customerId: 'cust-1',
    outletId: 'out-1',
    items: [{ serviceId: 'svc-1', quantity: 1 }],
  };

  it('transaksi normal tanpa promo', async () => {
    const res = await service.checkout(checkoutInput);
    expect(res.status).toBe(OrderStatus.PAID);
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.not.objectContaining({ machineType: expect.anything() }),
            ],
          },
        }),
      }),
    );
    expect(res.breakdown.mainBalanceUsed).toBe(50000);
    expect(res.breakdown.pointEarned).toBe(50);
    expect(mocks.pointService.earn).toHaveBeenCalled();
    expect(mocks.membershipTierService.recordSuccessfulTransaction).toHaveBeenCalled();
    expect(mocks.voucherService.redeem).not.toHaveBeenCalled();
  });

  it('transaksi dengan voucher → voucher di-redeem', async () => {
    mocks.pricingService.calculate.mockResolvedValue(
      baseBreakdown({
        discountSource: 'VOUCHER',
        voucherDiscount: 10000,
        spendingAmount: 40000,
        finalAmount: 40000,
        voucherId: 'uv1',
        voucherCode: 'WELCOME-AAAA',
      }),
    );
    const res = await service.checkout({ ...checkoutInput, voucherCode: 'WELCOME-AAAA' });
    expect(res.breakdown.voucherDiscount).toBe(10000);
    expect(mocks.voucherService.redeem).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userVoucherId: 'uv1', orderId: 'o1' }),
    );
  });

  it('transaksi dengan happy hour memakai breakdown dari pricing API', async () => {
    mocks.pricingService.calculate.mockResolvedValue(
      baseBreakdown({
        happyHourDiscount: 10000,
        spendingAmount: 40000,
        finalAmount: 40000,
        pointsToEarn: 40,
        happyHourRules: [{ ruleId: 'hh-1', quantity: 1, discountAmount: 10000 }],
      }),
    );
    mocks.walletService.payWithWallet.mockResolvedValue({
      bonusUsed: new Prisma.Decimal(5000),
      mainUsed: new Prisma.Decimal(35000),
    });

    const res = await service.checkout(checkoutInput);

    expect(res.breakdown.happyHourDiscount).toBe(10000);
    expect(res.breakdown.bonusBalanceUsed).toBe(5000);
    expect(res.breakdown.mainBalanceUsed).toBe(35000);
    expect(res.breakdown.finalAmount).toBe(40000);
    expect(mocks.campaignService.consumeHappyHourQuota).toHaveBeenCalledWith(tx, [
      { ruleId: 'hh-1', quantity: 1 },
    ]);
  });

  it('pembayaran B2B hanya untuk partner ACTIVE dan mencatat transaksi partner', async () => {
    prisma.b2BPartner.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'ACTIVE',
      tier: B2BPartnerTier.GOLD_PARTNER,
    });
    mocks.walletService.getOrCreateWallet.mockResolvedValue({ id: 'wallet-b2b' });
    mocks.pricingService.calculate.mockResolvedValue(
      baseBreakdown({
        b2bDiscount: 5000,
        spendingAmount: 45000,
        finalAmount: 45000,
        b2bPricingRules: [{ ruleId: 'rule-1', discountAmount: 5000 }],
      }),
    );
    mocks.walletService.payWithWallet.mockResolvedValue({
      bonusUsed: new Prisma.Decimal(0),
      mainUsed: new Prisma.Decimal(45000),
    });

    const res = await service.checkout({
      partnerId: 'p1',
      outletId: 'out-1',
      items: [{ serviceId: 'svc-1', quantity: 1 }],
    });

    expect(res.segment).toBe(UserSegment.B2B);
    expect(mocks.pricingService.calculate).toHaveBeenCalledWith(
      expect.objectContaining({
        segment: UserSegment.B2B,
        partnerId: 'p1',
        b2bTier: B2BPartnerTier.GOLD_PARTNER,
      }),
    );
    expect(mocks.b2bPartnerService.recordSuccessfulTransaction).toHaveBeenCalledWith(
      tx,
      'p1',
      45000,
    );
    expect(tx.b2BPricingRuleUsage.createMany).toHaveBeenCalledWith({
      data: [
        {
          orderId: 'o1',
          ruleId: 'rule-1',
          partnerId: 'p1',
          discountAmount: new Prisma.Decimal(5000),
        },
      ],
      skipDuplicates: true,
    });
    expect(mocks.membershipTierService.recordSuccessfulTransaction).not.toHaveBeenCalled();
  });

  it('pembayaran B2B ditolak jika partner belum approved/aktif', async () => {
    prisma.b2BPartner.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'SUSPENDED',
      tier: B2BPartnerTier.BUSINESS_PARTNER,
    });

    await expect(
      service.checkout({
        partnerId: 'p1',
        outletId: 'out-1',
        items: [{ serviceId: 'svc-1', quantity: 1 }],
      }),
    ).rejects.toThrow('Partner B2B belum approved/aktif');
    expect(mocks.walletService.getOrCreateWallet).not.toHaveBeenCalled();
  });

  it('transaksi gagal karena saldo kurang', async () => {
    mocks.walletService.payWithWallet.mockRejectedValue(
      new BadRequestException('Saldo wallet tidak cukup'),
    );
    await expect(service.checkout(checkoutInput)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transaksi gagal karena voucher tidak valid', async () => {
    mocks.pricingService.calculate.mockRejectedValue(
      new BadRequestException('Voucher sudah kedaluwarsa'),
    );
    await expect(
      service.checkout({ ...checkoutInput, voucherCode: 'EXPIRED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
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
    expect(mocks.voucherService.reverseRedemption).toHaveBeenCalledWith(tx, 'o1');
    expect(mocks.membershipTierService.reverseTransaction).toHaveBeenCalled();
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
