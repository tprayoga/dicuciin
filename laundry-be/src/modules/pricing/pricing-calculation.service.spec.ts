import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { B2BPartnerTier, MembershipTier, Prisma, UserSegment } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { WalletLedgerService } from '../wallets/wallet-ledger.service';
import { MembershipTierService } from '../memberships/membership-tier.service';
import { PricingService } from './pricing.service';
import { PricingCalculationService } from './pricing-calculation.service';

describe('PricingCalculationService', () => {
  let service: PricingCalculationService;
  let prisma: any;
  let mocks: any;

  beforeEach(async () => {
    prisma = {
      b2BPartner: { findUnique: jest.fn() },
    };
    mocks = {
      ordersService: {
        priceItems: jest.fn().mockResolvedValue({
          orderItems: [{ serviceId: 'svc-1', subtotal: new Prisma.Decimal(50000) }],
        }),
      },
      walletService: {
        getOrCreateWallet: jest.fn().mockResolvedValue({ id: 'w1' }),
      },
      membershipTierService: {
        ensureStatus: jest.fn().mockResolvedValue({ currentTier: MembershipTier.GOLD }),
      },
      pricingService: {
        calculate: jest.fn().mockResolvedValue({
          basePrice: 50000,
          finalAmount: 40000,
        }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PricingCalculationService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersService, useValue: mocks.ordersService },
        { provide: WalletLedgerService, useValue: mocks.walletService },
        { provide: MembershipTierService, useValue: mocks.membershipTierService },
        { provide: PricingService, useValue: mocks.pricingService },
      ],
    }).compile();
    service = moduleRef.get(PricingCalculationService);
  });

  it('menghitung pricing retail dengan context tier customer', async () => {
    await service.calculate({
      customerId: 'cust-1',
      outletId: 'out-1',
      items: [{ serviceId: 'svc-1', quantity: 1 }],
      voucherCode: 'WELCOME-AAAA',
    });

    expect(mocks.ordersService.priceItems).toHaveBeenCalledWith('out-1', [
      { serviceId: 'svc-1', quantity: 1 },
    ]);
    expect(mocks.pricingService.calculate).toHaveBeenCalledWith(
      expect.objectContaining({
        segment: UserSegment.RETAIL,
        customerId: 'cust-1',
        tier: MembershipTier.GOLD,
        voucherCode: 'WELCOME-AAAA',
      }),
    );
  });

  it('menghitung pricing B2B hanya untuk partner ACTIVE', async () => {
    prisma.b2BPartner.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'ACTIVE',
      tier: B2BPartnerTier.GOLD_PARTNER,
    });

    await service.calculate({
      partnerId: 'p1',
      outletId: 'out-1',
      items: [{ serviceId: 'svc-1', quantity: 2 }],
    });

    expect(mocks.pricingService.calculate).toHaveBeenCalledWith(
      expect.objectContaining({
        segment: UserSegment.B2B,
        partnerId: 'p1',
        b2bTier: B2BPartnerTier.GOLD_PARTNER,
      }),
    );
  });

  it('menolak pricing B2B untuk partner non-active', async () => {
    prisma.b2BPartner.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'SUSPENDED',
      tier: B2BPartnerTier.BUSINESS_PARTNER,
    });

    await expect(
      service.calculate({
        partnerId: 'p1',
        outletId: 'out-1',
        items: [{ serviceId: 'svc-1', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.pricingService.calculate).not.toHaveBeenCalled();
  });
});
