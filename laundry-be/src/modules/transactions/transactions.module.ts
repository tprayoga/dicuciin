import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionsController } from './transactions.controller';
import { OrdersModule } from '../orders/orders.module';
import { PricingModule } from '../pricing/pricing.module';
import { WalletsModule } from '../wallets/wallets.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { PointsModule } from '../points/points.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { PartnersModule } from '../partners/partners.module';
import { PromosModule } from '../promos/promos.module';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
  imports: [
    OrdersModule,
    PricingModule,
    WalletsModule,
    VouchersModule,
    PointsModule,
    MembershipsModule,
    PartnersModule,
    PromosModule,
    CampaignsModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionsModule {}
