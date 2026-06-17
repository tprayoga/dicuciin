import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { B2BPartnerTier, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  B2BPriceType,
  B2B_PRICE_TYPES,
  CreateB2BPricingRuleDto,
  UpdateB2BPricingRuleDto,
} from './dto/b2b-pricing-rule.dto';

export interface B2BPricingMatchInput {
  partnerId?: string;
  tier?: B2BPartnerTier | null;
  outletId?: string;
  serviceId?: string;
  machineType?: string;
  at?: Date;
}

@Injectable()
export class B2BPricingService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return (this.prisma as any).b2BPricingRule.findMany({
      include: { partner: true, outlet: true, service: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateB2BPricingRuleDto) {
    this.assertRule(dto);
    return (this.prisma as any).b2BPricingRule.create({
      data: this.mapDto(dto),
    });
  }

  async update(id: string, dto: UpdateB2BPricingRuleDto) {
    const existing = await (this.prisma as any).b2BPricingRule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('B2B pricing rule tidak ditemukan');
    this.assertRule(dto, true);
    return (this.prisma as any).b2BPricingRule.update({
      where: { id },
      data: this.mapDto(dto),
    });
  }

  async findBestRule(input: B2BPricingMatchInput) {
    const at = input.at ?? new Date();
    const rules = await (this.prisma as any).b2BPricingRule.findMany({
      where: {
        isActive: true,
        OR: this.matchNullable('partnerId', input.partnerId),
        AND: [
          { OR: this.matchNullable('tier', input.tier) },
          { OR: this.matchNullable('outletId', input.outletId) },
          { OR: this.matchNullable('serviceId', input.serviceId) },
          { OR: this.matchNullable('machineType', input.machineType) },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    const eligible = rules.filter((rule: any) => {
      const dateOk =
        (!rule.startDate || at >= rule.startDate) &&
        (!rule.endDate || at <= rule.endDate);
      return dateOk;
    });

    return eligible.sort((a: any, b: any) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return this.specificity(b) - this.specificity(a);
    })[0] ?? null;
  }

  calculateAdjustment(rule: { priceType: B2BPriceType; value: Prisma.Decimal }, subtotal: Prisma.Decimal) {
    if (rule.priceType === 'DISCOUNT_PERCENT') {
      return subtotal.mul(rule.value).div(100);
    }
    if (rule.priceType === 'FIXED_DISCOUNT') {
      return Prisma.Decimal.min(rule.value, subtotal);
    }
    if (rule.priceType === 'FIXED_PRICE') {
      return Prisma.Decimal.max(new Prisma.Decimal(0), subtotal.minus(rule.value));
    }
    throw new BadRequestException('Tipe harga B2B tidak valid');
  }

  private specificity(rule: any): number {
    return [
      rule.partnerId,
      rule.tier,
      rule.outletId,
      rule.serviceId,
      rule.machineType,
    ].filter(Boolean).length;
  }

  private matchNullable(field: string, value?: string | B2BPartnerTier | null) {
    return value ? [{ [field]: value }, { [field]: null }] : [{ [field]: null }];
  }

  private assertRule(
    dto: Partial<CreateB2BPricingRuleDto | UpdateB2BPricingRuleDto>,
    partial = false,
  ) {
    if (dto.priceType && !B2B_PRICE_TYPES.includes(dto.priceType as B2BPriceType)) {
      throw new BadRequestException('Tipe harga B2B tidak valid');
    }
    if (!partial && !dto.partnerId && !dto.tier) {
      throw new BadRequestException('Rule B2B wajib memiliki partnerId atau tier');
    }
    if (dto.startDate && dto.endDate && new Date(dto.startDate) > new Date(dto.endDate)) {
      throw new BadRequestException('startDate tidak boleh setelah endDate');
    }
  }

  private mapDto(dto: Partial<CreateB2BPricingRuleDto | UpdateB2BPricingRuleDto>) {
    return {
      ...dto,
      value: dto.value != null ? new Prisma.Decimal(dto.value) : undefined,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    };
  }
}
