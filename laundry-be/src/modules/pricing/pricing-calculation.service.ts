import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserSegment } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { WalletService } from '../wallets/wallet.service';
import { MembershipTierService } from '../memberships/membership-tier.service';
import { PricingService } from './pricing.service';
import { CalculatePricingDto } from './dto/calculate-pricing.dto';

@Injectable()
export class PricingCalculationService {
  constructor(
    private prisma: PrismaService,
    private ordersService: OrdersService,
    private walletService: WalletService,
    private membershipTierService: MembershipTierService,
    private pricingService: PricingService,
  ) {}

  async calculate(input: CalculatePricingDto) {
    const ctx = await this.resolveContext(input);
    const { orderItems } = await this.ordersService.priceItems(input.outletId, input.items);

    return this.pricingService.calculate({
      segment: ctx.segment,
      items: orderItems.map((it) => ({
        serviceId: it.serviceId,
        machineType: it.machineType,
        subtotal: it.subtotal,
      })),
      voucherCode: input.voucherCode,
      promoCode: input.promoCode,
      outletId: input.outletId,
      customerId: input.customerId,
      partnerId: input.partnerId,
      tier: ctx.tier,
      b2bTier: ctx.b2bTier,
      deliveryFee: input.deliveryFee,
      at: input.at ? new Date(input.at) : undefined,
    });
  }

  private async resolveContext(input: CalculatePricingDto) {
    if (input.partnerId) {
      const partner = await this.prisma.b2BPartner.findUnique({
        where: { id: input.partnerId },
      });
      if (!partner) throw new NotFoundException('Partner tidak ditemukan');
      if (partner.status !== 'ACTIVE') {
        throw new BadRequestException('Partner B2B belum approved/aktif');
      }
      await this.walletService.getOrCreateWallet({ partnerId: partner.id });
      return {
        segment: UserSegment.B2B,
        tier: null,
        b2bTier: partner.tier,
      };
    }

    if (input.customerId) {
      const status = await this.membershipTierService.ensureStatus(input.customerId);
      await this.walletService.getOrCreateWallet({ customerId: input.customerId });
      return {
        segment: UserSegment.RETAIL,
        tier: status.currentTier,
        b2bTier: null,
      };
    }

    return {
      segment: UserSegment.RETAIL,
      tier: null,
      b2bTier: null,
    };
  }
}
