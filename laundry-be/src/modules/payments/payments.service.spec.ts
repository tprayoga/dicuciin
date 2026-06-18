import { Prisma, PaymentStatus, OrderStatus } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { LoyaltyConfigService } from '../loyalty-config/loyalty-config.service';

describe('PaymentsService loyalty settlement', () => {
  function setup() {
    const tx: any = {
      payment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'pay-1',
          orderId: 'order-1',
          status: PaymentStatus.PENDING,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          customerId: 'cust-1',
          partnerId: null,
          status: OrderStatus.DRAFT,
          totalAmount: new Prisma.Decimal(50000),
          deliveryFee: new Prisma.Decimal(0),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      orderStatusLog: { create: jest.fn().mockResolvedValue({}) },
      wallet: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
        create: jest.fn(),
      },
    };
    const prisma: any = {
      payment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'pay-1' }),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const gateway = { name: 'mock', createCharge: jest.fn() };
    const promosService = { commitUsage: jest.fn() };
    const walletService = { creditCashback: jest.fn() };
    const pointService = { earn: jest.fn() };
    const membershipTierService = {
      ensureStatus: jest.fn().mockResolvedValue({ currentTier: 'SILVER' }),
      getBenefits: jest.fn().mockResolvedValue({
        pointMultiplier: new Prisma.Decimal(1),
        cashbackRate: new Prisma.Decimal(10),
      }),
      recordSuccessfulTransaction: jest.fn(),
    };
    const b2bPartnerService = { recordSuccessfulTransaction: jest.fn() };
    const campaignService = { qualifyReferralOnFirstTransaction: jest.fn() };
    const service = new PaymentsService(
      prisma,
      gateway as any,
      promosService as any,
      walletService as any,
      pointService as any,
      membershipTierService as any,
      b2bPartnerService as any,
      campaignService as any,
      new LoyaltyConfigService(),
    );
    return {
      service,
      tx,
      mocks: {
        promosService,
        walletService,
        pointService,
        membershipTierService,
        campaignService,
      },
    };
  }

  it('webhook PAID settle promo/point/tier/referral untuk gateway order', async () => {
    const { service, tx, mocks } = setup();

    await service.handleWebhook({ externalId: 'ext-1', status: 'PAID' });

    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: PaymentStatus.PAID, paidAt: expect.any(Date) },
    });
    expect(mocks.promosService.commitUsage).toHaveBeenCalledWith(tx, 'order-1');
    expect(mocks.pointService.earn).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 'wallet-1',
        points: 50,
        orderId: 'order-1',
        idempotencyKey: 'point-earn-order-1',
      }),
    );
    expect(mocks.walletService.creditCashback).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 'wallet-1',
        amount: new Prisma.Decimal(5000),
        idempotencyKey: 'cashback-tier-order-1',
      }),
    );
    expect(mocks.membershipTierService.recordSuccessfulTransaction).toHaveBeenCalledWith(
      tx,
      'cust-1',
      50000,
    );
    expect(mocks.campaignService.qualifyReferralOnFirstTransaction).toHaveBeenCalledWith(
      tx,
      'cust-1',
      'order-1',
    );
  });
});
