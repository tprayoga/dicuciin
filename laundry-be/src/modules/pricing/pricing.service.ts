import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, UserSegment, MembershipTier, B2BPartnerTier } from '@prisma/client';
import { toNum } from '../../common/utils/money.util';
import { PromosService } from '../promos/promos.service';
import { VoucherService } from '../vouchers/voucher.service';
import { MembershipTierService } from '../memberships/membership-tier.service';
import { B2BPartnerService } from '../partners/b2b-partner.service';
import { CampaignService } from '../campaigns/campaign.service';
import { B2BPricingService } from './b2b-pricing.service';
import { LoyaltyConfigService } from '../loyalty-config/loyalty-config.service';

export interface PricingItem {
  serviceId?: string;
  machineType?: string;
  quantity?: number;
  subtotal: Prisma.Decimal.Value;
}

export interface CalculatePricingInput {
  segment: UserSegment;
  items: PricingItem[];
  /** Maksimal SATU voucher (keputusan 5). Array dipakai untuk deteksi penggabungan. */
  voucherCodes?: string[];
  voucherCode?: string;
  promoCode?: string;
  outletId?: string;
  customerId?: string;
  partnerId?: string;
  tier?: MembershipTier | null;
  b2bTier?: B2BPartnerTier | null;
  deliveryFee?: number;
  at?: Date;
  /** Simpan ke pricing_calculation_logs (default false). */
  persistLog?: boolean;
}

export interface PricingBreakdown {
  basePrice: number;
  b2bDiscount: number;
  happyHourDiscount: number;
  voucherDiscount: number;
  promoDiscount: number;
  discountSource: 'VOUCHER' | 'PROMO' | 'NONE';
  deliveryFee: number;
  /** Nilai layanan setelah semua diskon (basis poin & tier). */
  spendingAmount: number;
  /** Total yang harus dibayar (spending + ongkir). */
  finalAmount: number;
  pointsToEarn: number;
  cashbackToCredit: number;
  b2bPricingRuleIds?: string[];
  b2bPricingRules?: { ruleId: string; discountAmount: number }[];
  happyHourRules?: { ruleId: string; quantity: number; discountAmount: number }[];
  voucherId?: string;
  voucherCode?: string;
  promoId?: string;
}

const rupiah = (v: Prisma.Decimal): Prisma.Decimal =>
  v.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

/**
 * Pricing pipeline tunggal: base → harga B2B → happy hour → SATU promosi
 * (voucher ATAU promo, non-stackable — keputusan 5) → accrual (poin & cashback
 * by tier). Dipakai untuk preview (quote) & realisasi (checkout) agar konsisten.
 */
@Injectable()
export class PricingService {
  constructor(
    private prisma: PrismaService,
    private promosService: PromosService,
    private voucherService: VoucherService,
    private membershipTierService: MembershipTierService,
    private b2bPartnerService: B2BPartnerService,
    private campaignService: CampaignService,
    private b2bPricingService: B2BPricingService,
    private loyaltyConfig: LoyaltyConfigService,
  ) {}

  async calculate(input: CalculatePricingInput): Promise<PricingBreakdown> {
    const voucherCodes =
      input.voucherCodes ?? (input.voucherCode ? [input.voucherCode] : []);

    // Keputusan 5: voucher tidak bisa digabung.
    if (voucherCodes.length > 1) {
      throw new BadRequestException(
        'Voucher tidak bisa digabung — hanya satu voucher per transaksi',
      );
    }
    if (voucherCodes.length === 1 && input.promoCode) {
      throw new BadRequestException(
        'Voucher dan kode promo tidak bisa digabung dalam satu transaksi',
      );
    }

    const basePrice = input.items.reduce(
      (acc, it) => acc.plus(it.subtotal),
      new Prisma.Decimal(0),
    );

    // 1) Harga B2B: special pricing meng-override potongan tier partner.
    let b2bDiscount = new Prisma.Decimal(0);
    const b2bPricingRuleDiscounts = new Map<string, Prisma.Decimal>();
    if (input.segment === UserSegment.B2B) {
      for (const item of input.items) {
        const rule = await this.b2bPricingService.findBestRule({
          partnerId: input.partnerId,
          tier: input.b2bTier,
          outletId: input.outletId,
          serviceId: item.serviceId,
          machineType: item.machineType,
          at: input.at,
        });
        if (!rule) continue;
        const adjustment = this.b2bPricingService.calculateAdjustment(
          rule,
          new Prisma.Decimal(item.subtotal),
        );
        b2bPricingRuleDiscounts.set(
          rule.id,
          (b2bPricingRuleDiscounts.get(rule.id) ?? new Prisma.Decimal(0)).plus(adjustment),
        );
        b2bDiscount = b2bDiscount.plus(adjustment);
      }
      b2bDiscount = rupiah(b2bDiscount);
    }
    if (
      input.segment === UserSegment.B2B &&
      input.b2bTier &&
      b2bPricingRuleDiscounts.size === 0
    ) {
      const rate = await this.b2bPartnerService.getDiscountRate(input.b2bTier);
      b2bDiscount = rupiah(basePrice.mul(rate).div(100));
    }

    // 2) Happy hour: penyesuaian per item.
    let happyHourDiscount = new Prisma.Decimal(0);
    const happyHourRuleDiscounts = new Map<
      string,
      { quantity: number; discountAmount: Prisma.Decimal }
    >();
    for (const item of input.items) {
      const rule = await this.campaignService.findActiveHappyHourRule({
        outletId: input.outletId,
        serviceId: item.serviceId,
        machineType: item.machineType,
        at: input.at,
      });
      if (!rule) continue;
      if (voucherCodes.length > 0 && (rule as any).allowVoucherStack === false) {
        throw new BadRequestException(
          'Happy hour tidak bisa digabung dengan voucher untuk transaksi ini',
        );
      }
      const sub = new Prisma.Decimal(item.subtotal);
      let adj = new Prisma.Decimal(0);
      if (rule.adjustmentType === 'PERCENTAGE_OFF') {
        adj = sub.mul(rule.value).div(100);
      } else if (rule.adjustmentType === 'FIXED_OFF') {
        adj = Prisma.Decimal.min(rule.value, sub);
      } else if (rule.adjustmentType === 'FIXED_PRICE') {
        adj = Prisma.Decimal.max(new Prisma.Decimal(0), sub.minus(rule.value));
      }
      const current = happyHourRuleDiscounts.get(rule.id);
      happyHourRuleDiscounts.set(rule.id, {
        quantity: (current?.quantity ?? 0) + (item.quantity ?? 1),
        discountAmount: (current?.discountAmount ?? new Prisma.Decimal(0)).plus(adj),
      });
      happyHourDiscount = happyHourDiscount.plus(adj);
    }
    happyHourDiscount = rupiah(happyHourDiscount);

    const priceAfterAdjustments = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      basePrice.minus(b2bDiscount).minus(happyHourDiscount),
    );

    // 3) Satu promosi: voucher ATAU promo.
    let voucherDiscount = new Prisma.Decimal(0);
    let promoDiscount = new Prisma.Decimal(0);
    let discountSource: PricingBreakdown['discountSource'] = 'NONE';
    let voucherId: string | undefined;
    let voucherCode: string | undefined;
    let promoId: string | undefined;

    if (voucherCodes.length === 1) {
      const res = await this.voucherService.validate({
        code: voucherCodes[0],
        segment: input.segment,
        items: input.items,
        tier: input.tier,
        b2bTier: input.b2bTier,
        outletId: input.outletId,
        ownerCustomerId: input.customerId,
        ownerPartnerId: input.partnerId,
      });
      voucherDiscount = Prisma.Decimal.min(res.discount, priceAfterAdjustments);
      discountSource = 'VOUCHER';
      voucherId = res.userVoucher.id;
      voucherCode = res.userVoucher.code;
    } else if (input.promoCode) {
      const res = await this.promosService.evaluatePromo({
        code: input.promoCode,
        customerId: input.customerId,
        items: input.items,
        outletId: input.outletId,
        deliveryFee: input.deliveryFee,
      });
      promoDiscount = Prisma.Decimal.min(res.discount, priceAfterAdjustments);
      discountSource = 'PROMO';
      promoId = res.promo.id;
    }

    const spendingAmount = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      priceAfterAdjustments.minus(voucherDiscount).minus(promoDiscount),
    );
    const deliveryFee = new Prisma.Decimal(input.deliveryFee ?? 0);
    const finalAmount = spendingAmount.plus(deliveryFee);

    // 4) Accrual menurut tier (retail). Poin dari nilai transaksi sukses (bukan
    // top up), dikali pengali tier (Silver 1x..Diamond 2x). Cashback ke BONUS.
    const benefits =
      input.segment === UserSegment.RETAIL
        ? await this.membershipTierService.getBenefits(input.tier)
        : { pointMultiplier: new Prisma.Decimal(1), cashbackRate: new Prisma.Decimal(0) };

    const basePoints = Math.floor(
      toNum(spendingAmount) / this.loyaltyConfig.pointEarnRate,
    );
    const pointsToEarn = Math.floor(basePoints * toNum(benefits.pointMultiplier));
    const cashbackToCredit = rupiah(spendingAmount.mul(benefits.cashbackRate).div(100));

    const breakdown: PricingBreakdown = {
      basePrice: toNum(basePrice),
      b2bDiscount: toNum(b2bDiscount),
      happyHourDiscount: toNum(happyHourDiscount),
      voucherDiscount: toNum(voucherDiscount),
      promoDiscount: toNum(promoDiscount),
      discountSource,
      deliveryFee: toNum(deliveryFee),
      spendingAmount: toNum(spendingAmount),
      finalAmount: toNum(finalAmount),
      pointsToEarn,
      cashbackToCredit: toNum(cashbackToCredit),
      b2bPricingRuleIds:
        b2bPricingRuleDiscounts.size > 0
          ? Array.from(b2bPricingRuleDiscounts.keys())
          : undefined,
      b2bPricingRules:
        b2bPricingRuleDiscounts.size > 0
          ? Array.from(b2bPricingRuleDiscounts.entries()).map(
              ([ruleId, discountAmount]) => ({
                ruleId,
                discountAmount: toNum(rupiah(discountAmount)),
              }),
            )
          : undefined,
      happyHourRules:
        happyHourRuleDiscounts.size > 0
          ? Array.from(happyHourRuleDiscounts.entries()).map(([ruleId, usage]) => ({
              ruleId,
              quantity: usage.quantity,
              discountAmount: toNum(rupiah(usage.discountAmount)),
            }))
          : undefined,
      voucherId,
      voucherCode,
      promoId,
    };

    if (input.persistLog) {
      await this.prisma.pricingCalculationLog.create({
        data: {
          customerId: input.customerId,
          partnerId: input.partnerId,
          segment: input.segment,
          subtotal: basePrice,
          happyHourAdjustment: happyHourDiscount,
          discountAmount: voucherDiscount.plus(promoDiscount).plus(b2bDiscount),
          discountSource,
          voucherId,
          promoId,
          totalAmount: finalAmount,
          pointsToEarn,
          cashbackToCredit,
          breakdown: breakdown as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return breakdown;
  }
}
