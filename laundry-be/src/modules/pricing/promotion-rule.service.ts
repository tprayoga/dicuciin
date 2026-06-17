import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, UserSegment, MembershipTier } from '@prisma/client';

export interface PromotionRuleContext {
  segment?: UserSegment;
  tier?: MembershipTier | null;
  subtotal: Prisma.Decimal.Value;
}

/**
 * Aturan promosi yang dapat dipakai ulang (`promotion_rules`): batas transaksi,
 * segment, tier, dll. Dipakai pricing/campaign untuk gating tambahan.
 */
@Injectable()
export class PromotionRuleService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.PromotionRuleCreateInput) {
    return this.prisma.promotionRule.create({ data });
  }

  async update(id: string, data: Prisma.PromotionRuleUpdateInput) {
    const rule = await this.prisma.promotionRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Promotion rule tidak ditemukan');
    return this.prisma.promotionRule.update({ where: { id }, data });
  }

  async findActive() {
    return this.prisma.promotionRule.findMany({ where: { isActive: true } });
  }

  /** Cek apakah konteks memenuhi sebuah rule. */
  async isSatisfied(ruleId: string, ctx: PromotionRuleContext): Promise<boolean> {
    const rule = await this.prisma.promotionRule.findUnique({ where: { id: ruleId } });
    if (!rule || !rule.isActive) return false;
    if (rule.segment && ctx.segment && rule.segment !== ctx.segment) return false;
    if (rule.tierRestriction && ctx.tier !== rule.tierRestriction) return false;
    if (rule.minTransaction && new Prisma.Decimal(ctx.subtotal).lt(rule.minTransaction)) {
      return false;
    }
    return true;
  }
}
