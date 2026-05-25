import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePromoDto, UpdatePromoDto } from './dto/promo.dto';

@Injectable()
export class PromosService {
  constructor(private prisma: PrismaService) {}

  async create(createPromoDto: CreatePromoDto) {
    const { rule, ...promoData } = createPromoDto;

    const existing = await this.prisma.promo.findUnique({
      where: { code: promoData.code },
    });
    if (existing) {
      throw new ConflictException('Promo code already exists');
    }

    return this.prisma.promo.create({
      data: {
        ...promoData,
        startDate: new Date(promoData.startDate),
        endDate: new Date(promoData.endDate),
        ...(rule
          ? {
              rules: {
                create: rule,
              },
            }
          : {}),
      },
      include: { rules: true },
    });
  }

  async update(id: string, updatePromoDto: UpdatePromoDto) {
    const promo = await this.prisma.promo.findUnique({ where: { id } });
    if (!promo) throw new NotFoundException('Promo not found');

    return this.prisma.promo.update({
      where: { id },
      data: {
        ...updatePromoDto,
        ...(updatePromoDto.endDate ? { endDate: new Date(updatePromoDto.endDate) } : {}),
      },
      include: { rules: true },
    });
  }

  async remove(id: string) {
    const promo = await this.prisma.promo.findUnique({ where: { id } });
    if (!promo) throw new NotFoundException('Promo not found');

    await this.prisma.promo.delete({ where: { id } });
    return { message: 'Promo deleted successfully' };
  }

  async validatePromo(code: string, customerId: string, orderAmount: number) {
    const promo = await this.prisma.promo.findUnique({
      where: { code },
      include: { rules: true },
    });

    if (!promo) throw new NotFoundException('Promo code not found');
    if (!promo.isActive) throw new BadRequestException('Promo is not active');

    const now = new Date();
    if (now < promo.startDate || now > promo.endDate) {
      throw new BadRequestException('Promo is not valid at this time');
    }

    if (promo.quota && promo.usedCount >= promo.quota) {
      throw new BadRequestException('Promo quota exceeded');
    }

    const rule = promo.rules[0];
    if (rule) {
      if (rule.minTransaction && orderAmount < rule.minTransaction) {
        throw new BadRequestException(`Minimum transaction is ${rule.minTransaction}`);
      }

      if (rule.maxUsagePerCustomer) {
        const usageCount = await this.prisma.promoUsage.count({
          where: { promoId: promo.id, customerId },
        });
        if (usageCount >= rule.maxUsagePerCustomer) {
          throw new BadRequestException('Promo usage limit exceeded for this customer');
        }
      }
    }

    let discount = 0;
    if (promo.promoType === 'PERCENTAGE') {
      discount = (orderAmount * promo.value) / 100;
    } else if (promo.promoType === 'FIXED_AMOUNT') {
      discount = promo.value;
    }

    if (rule?.maxDiscount && discount > rule.maxDiscount) {
      discount = rule.maxDiscount;
    }

    return { promo, discount, isValid: true };
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [promos, total] = await Promise.all([
      this.prisma.promo.findMany({
        skip,
        take: limit,
        include: { rules: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.promo.count(),
    ]);

    return {
      data: promos,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const promo = await this.prisma.promo.findUnique({
      where: { id },
      include: {
        rules: true,
        usages: {
          include: {
            customer: {
              include: { user: { select: { name: true, email: true } } },
            },
          },
        },
      },
    });

    if (!promo) throw new NotFoundException('Promo not found');
    return promo;
  }
}
