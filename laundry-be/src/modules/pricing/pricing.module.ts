import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PromotionRuleService } from './promotion-rule.service';
import { PromosModule } from '../promos/promos.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { PartnersModule } from '../partners/partners.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { OrdersModule } from '../orders/orders.module';
import { WalletsModule } from '../wallets/wallets.module';
import { PromotionRulesController } from './promotion-rules.controller';
import { PricingController } from './pricing.controller';
import { PricingCalculationService } from './pricing-calculation.service';
import { B2BPricingController } from './b2b-pricing.controller';
import { B2BPricingService } from './b2b-pricing.service';

@Module({
  imports: [
    PromosModule,
    VouchersModule,
    MembershipsModule,
    PartnersModule,
    CampaignsModule,
    OrdersModule,
    WalletsModule,
  ],
  controllers: [PromotionRulesController, PricingController, B2BPricingController],
  providers: [
    PricingService,
    PromotionRuleService,
    PricingCalculationService,
    B2BPricingService,
  ],
  exports: [
    PricingService,
    PromotionRuleService,
    PricingCalculationService,
    B2BPricingService,
  ],
})
export class PricingModule {}
