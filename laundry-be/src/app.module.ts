import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OutletsModule } from './modules/outlets/outlets.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ServicesModule } from './modules/services/services.module';
import { OrdersModule } from './modules/orders/orders.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PromosModule } from './modules/promos/promos.module';
import { BannersModule } from './modules/banners/banners.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { KiosksModule } from './modules/kiosks/kiosks.module';
import { IotModule } from './modules/iot/iot.module';
import { HealthModule } from './modules/health/health.module';
import { QueuesModule } from './modules/queues/queues.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PointsModule } from './modules/points/points.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { PartnersModule } from './modules/partners/partners.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { LoyaltyConfigModule } from './modules/loyalty-config/loyalty-config.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Rate limiting global per-IP (in-memory; single-VM). Default longgar agar
    // pemakaian normal app tak terganggu; endpoint auth diperketat via @Throttle.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 300),
      },
    ]),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    QueuesModule,
    LoyaltyConfigModule,
    AuthModule,
    UsersModule,
    OutletsModule,
    CustomersModule,
    ServicesModule,
    OrdersModule,
    WalletsModule,
    PaymentsModule,
    PromosModule,
    BannersModule,
    ReviewsModule,
    BookingsModule,
    KiosksModule,
    IotModule,
    HealthModule,
    UploadsModule,
    ReportsModule,
    NotificationsModule,
    // Promotion & Loyalty Engine
    PointsModule,
    VouchersModule,
    MembershipsModule,
    PartnersModule,
    PricingModule,
    CampaignsModule,
    TransactionsModule,
  ],
  providers: [
    // Throttler pertama → brute-force ditolak sebelum auth/role guard berjalan.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
