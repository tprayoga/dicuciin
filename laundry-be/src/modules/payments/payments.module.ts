import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway.interface';
import { MockPaymentGateway } from './gateway/mock-payment-gateway';
import { MidtransPaymentGateway } from './gateway/midtrans-payment-gateway';
import { PromosModule } from '../promos/promos.module';
import { WalletsModule } from '../wallets/wallets.module';
import { PointsModule } from '../points/points.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { PartnersModule } from '../partners/partners.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { IotModule } from '../iot/iot.module';

@Module({
  imports: [
    PromosModule,
    WalletsModule,
    PointsModule,
    MembershipsModule,
    PartnersModule,
    CampaignsModule,
    IotModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config
          .get<string>('PAYMENT_GATEWAY', 'mock')
          .toLowerCase();
        if (provider === 'midtrans') return new MidtransPaymentGateway(config);
        return new MockPaymentGateway();
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
