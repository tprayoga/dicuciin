import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class PromosService {
  constructor(private prisma: PrismaService) {}

  async validatePromo(code: string, customerId: string, orderAmount: number) {
    const promo = await this.prisma.promo.findUnique({
      where: { code },
      include: { rules: true },
    });

    if (!promo) {
      throw new NotFoundException('Promo code not found');
    }

    if (!promo.isActive) {
      throw new BadRequestException('Promo is not active');
    }

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
          where: {
            promoId: promo.id,
            customerId,
          },
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

    return {
      promo,
      discount,
      isValid: true,
    };
  }

  async findAll() {
    return this.prisma.promo.findMany({
      include: { rules: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const promo = await this.prisma.promo.findUnique({
      where: { id },
      include: {
        rules: true,
        usages: {
          include: {
            customer: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!promo) {
      throw new NotFoundException('Promo not found');
    }

    return promo;
  }
}
