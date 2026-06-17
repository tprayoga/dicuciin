import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma, UserSegment, B2BPartnerTier } from '@prisma/client';
import { PricingService } from './pricing.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PromosService } from '../promos/promos.service';
import { VoucherService } from '../vouchers/voucher.service';
import { MembershipTierService } from '../memberships/membership-tier.service';
import { B2BPartnerService } from '../partners/b2b-partner.service';
import { CampaignService } from '../campaigns/campaign.service';
import { B2BPricingService } from './b2b-pricing.service';

describe('PricingService.calculate', () => {
  let service: PricingService;
  let voucherService: { validate: jest.Mock };
  let promosService: { evaluatePromo: jest.Mock };
  let membershipTierService: { getBenefits: jest.Mock };
  let b2bPartnerService: { getDiscountRate: jest.Mock };
  let campaignService: { findActiveHappyHourRule: jest.Mock };
  let b2bPricingService: { findBestRule: jest.Mock; calculateAdjustment: jest.Mock };

  const items = [{ serviceId: 'svc-1', subtotal: 50000 }];

  beforeEach(async () => {
    voucherService = { validate: jest.fn() };
    promosService = { evaluatePromo: jest.fn() };
    membershipTierService = {
      getBenefits: jest.fn().mockResolvedValue({
        pointMultiplier: new Prisma.Decimal(1),
        cashbackRate: new Prisma.Decimal(0),
      }),
    };
    b2bPartnerService = { getDiscountRate: jest.fn().mockResolvedValue(new Prisma.Decimal(0)) };
    campaignService = { findActiveHappyHourRule: jest.fn().mockResolvedValue(null) };
    b2bPricingService = {
      findBestRule: jest.fn().mockResolvedValue(null),
      calculateAdjustment: jest.fn((rule: any, subtotal: Prisma.Decimal) => {
        if (rule.priceType === 'DISCOUNT_PERCENT') return subtotal.mul(rule.value).div(100);
        if (rule.priceType === 'FIXED_DISCOUNT') return Prisma.Decimal.min(rule.value, subtotal);
        if (rule.priceType === 'FIXED_PRICE') {
          return Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.minus(rule.value));
        }
        return new Prisma.Decimal(0);
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: PrismaService, useValue: {} },
        { provide: PromosService, useValue: promosService },
        { provide: VoucherService, useValue: voucherService },
        { provide: MembershipTierService, useValue: membershipTierService },
        { provide: B2BPartnerService, useValue: b2bPartnerService },
        { provide: CampaignService, useValue: campaignService },
        { provide: B2BPricingService, useValue: b2bPricingService },
      ],
    }).compile();
    service = moduleRef.get(PricingService);
  });

  it('transaksi normal tanpa promo', async () => {
    const res = await service.calculate({ segment: UserSegment.RETAIL, items });
    expect(res.basePrice).toBe(50000);
    expect(res.finalAmount).toBe(50000);
    expect(res.discountSource).toBe('NONE');
    expect(res.pointsToEarn).toBe(50); // 50000 / 1000 * 1x
  });

  it('transaksi dengan voucher', async () => {
    voucherService.validate.mockResolvedValue({
      userVoucher: { id: 'uv1', code: 'WELCOME-AAAA' },
      discount: new Prisma.Decimal(10000),
    });
    const res = await service.calculate({
      segment: UserSegment.RETAIL,
      items,
      voucherCode: 'WELCOME-AAAA',
    });
    expect(res.voucherDiscount).toBe(10000);
    expect(res.finalAmount).toBe(40000);
    expect(res.discountSource).toBe('VOUCHER');
    expect(res.voucherId).toBe('uv1');
  });

  it('transaksi dengan happy hour (20% off)', async () => {
    campaignService.findActiveHappyHourRule.mockResolvedValue({
      id: 'hh-1',
      adjustmentType: 'PERCENTAGE_OFF',
      value: new Prisma.Decimal(20),
    });
    const res = await service.calculate({ segment: UserSegment.RETAIL, items });
    expect(res.happyHourDiscount).toBe(10000); // 20% dari 50000
    expect(res.happyHourRules).toEqual([
      { ruleId: 'hh-1', quantity: 1, discountAmount: 10000 },
    ]);
    expect(res.finalAmount).toBe(40000);
  });

  it('transaksi B2B dengan harga partner (diskon tier 10%)', async () => {
    b2bPartnerService.getDiscountRate.mockResolvedValue(new Prisma.Decimal(10));
    const res = await service.calculate({
      segment: UserSegment.B2B,
      items,
      partnerId: 'p1',
      b2bTier: B2BPartnerTier.GOLD_PARTNER,
    });
    expect(res.b2bDiscount).toBe(5000); // 10% dari 50000
    expect(res.finalAmount).toBe(45000);
  });

  it('special pricing B2B override tier discount', async () => {
    b2bPartnerService.getDiscountRate.mockResolvedValue(new Prisma.Decimal(10));
    b2bPricingService.findBestRule.mockResolvedValue({
      id: 'rule-1',
      priceType: 'FIXED_PRICE',
      value: new Prisma.Decimal(30000),
    });

    const res = await service.calculate({
      segment: UserSegment.B2B,
      items: [{ serviceId: 'svc-1', machineType: 'WASHER', subtotal: 50000 }],
      outletId: 'out-1',
      partnerId: 'p1',
      b2bTier: B2BPartnerTier.GOLD_PARTNER,
    });

    expect(res.b2bDiscount).toBe(20000);
    expect(res.finalAmount).toBe(30000);
    expect(res.b2bPricingRuleIds).toEqual(['rule-1']);
    expect(res.b2bPricingRules).toEqual([{ ruleId: 'rule-1', discountAmount: 20000 }]);
    expect(b2bPartnerService.getDiscountRate).not.toHaveBeenCalled();
  });

  it('Diamond multiplier 2x → poin dua kali lipat', async () => {
    membershipTierService.getBenefits.mockResolvedValue({
      pointMultiplier: new Prisma.Decimal(2),
      cashbackRate: new Prisma.Decimal(0),
    });
    const res = await service.calculate({ segment: UserSegment.RETAIL, items });
    expect(res.pointsToEarn).toBe(100); // 50 * 2
  });

  it('multiple voucher usage rejected', async () => {
    await expect(
      service.calculate({ segment: UserSegment.RETAIL, items, voucherCodes: ['A', 'B'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('voucher + promo digabung ditolak', async () => {
    await expect(
      service.calculate({
        segment: UserSegment.RETAIL,
        items,
        voucherCode: 'A',
        promoCode: 'WELCOME20',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('happy hour tidak bisa digabung dengan voucher jika rule melarang', async () => {
    campaignService.findActiveHappyHourRule.mockResolvedValue({
      id: 'hh-1',
      adjustmentType: 'PERCENTAGE_OFF',
      value: new Prisma.Decimal(20),
      allowVoucherStack: false,
    });

    await expect(
      service.calculate({
        segment: UserSegment.RETAIL,
        items,
        voucherCode: 'WELCOME-AAAA',
      }),
    ).rejects.toThrow('Happy hour tidak bisa digabung dengan voucher');
    expect(voucherService.validate).not.toHaveBeenCalled();
  });
});
