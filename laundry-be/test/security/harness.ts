/**
 * Aplikasi uji untuk test keamanan hotfix: controller & service ASLI, guard
 * global ASLI (JwtAuthGuard + RolesGuard), ValidationPipe sama dengan main.ts,
 * PostgreSQL nyata dengan skema production. WhatsApp & layanan berat ditiru.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { JwtStrategy } from '../../src/modules/auth/jwt.strategy';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { OtpService } from '../../src/modules/auth/otp.service';
import { WhatsappService } from '../../src/modules/notifications/whatsapp.service';
import { UsersController } from '../../src/modules/users/users.controller';
import { UsersService } from '../../src/modules/users/users.service';
import { WalletsController } from '../../src/modules/wallets/wallets.controller';
import { WalletsService } from '../../src/modules/wallets/wallets.service';
import { WalletLedgerService } from '../../src/modules/wallets/wallet-ledger.service';
import { PromosService } from '../../src/modules/promos/promos.service';
import { TransactionsController } from '../../src/modules/transactions/transactions.controller';
import { TransactionService } from '../../src/modules/transactions/transaction.service';
import { IotController } from '../../src/modules/iot/iot.controller';
import { IotService } from '../../src/modules/iot/iot.service';
import { LegacyWalletPayController } from '../../src/modules/payments/legacy-wallet-pay.controller';
import { PaymentsService } from '../../src/modules/payments/payments.service';
import { PAYMENT_GATEWAY } from '../../src/modules/payments/gateway/payment-gateway.interface';
import { PointService } from '../../src/modules/points/point.service';
import { MembershipTierService } from '../../src/modules/memberships/membership-tier.service';
import { B2BPartnerService } from '../../src/modules/partners/b2b-partner.service';
import { CampaignService } from '../../src/modules/campaigns/campaign.service';
import { LoyaltyConfigService } from '../../src/modules/loyalty-config/loyalty-config.service';
import { IotMachineService } from '../../src/modules/iot/iot-machine.service';

export const ACCESS_SECRET = 'security-test-access';
export const REFRESH_SECRET = 'security-test-refresh';

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  jwt: JwtService;
  http: () => request.SuperTest<request.Test>;
  sentOtp: { phone: string; message: string }[];
  mocks: { transactions: any; iot: any };
}

export async function createHarness(): Promise<Harness> {
  const sentOtp: { phone: string; message: string }[] = [];
  const transactions = { topUp: jest.fn(async () => ({ ok: true })), quote: jest.fn(), checkout: jest.fn(), refund: jest.fn() };
  const iot = {
    updateHeartbeat: jest.fn(async () => ({ ok: true })),
    sendCommand: jest.fn(async () => ({ ok: true })),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [PassportModule, JwtModule.register({})],
    // Batch 1.5: POST /wallets/customer/:id/pay pindah ke LegacyWalletPayController
    // (PaymentsService ASLI: kepemilikan, nominal server, kunci order, PIN).
    controllers: [
      AuthController,
      UsersController,
      WalletsController,
      LegacyWalletPayController,
      TransactionsController,
      IotController,
    ],
    providers: [
      PrismaService,
      JwtStrategy,
      AuthService,
      OtpService,
      UsersService,
      WalletsService,
      WalletLedgerService,
      {
        provide: ConfigService,
        useValue: {
          get: (k: string, d?: any) =>
            ({
              JWT_ACCESS_SECRET: ACCESS_SECRET,
              JWT_REFRESH_SECRET: REFRESH_SECRET,
              BCRYPT_SALT_ROUNDS: '4',
            })[k] ?? d,
        },
      },
      {
        provide: WhatsappService,
        useValue: {
          // Batch 5: OtpService menanyakan konfigurasi provider dulu.
          isConfigured: () => true,
          devFallbackAllowed: () => false,
          sendText: async (phone: string, message: string) => {
            sentOtp.push({ phone, message });
          },
        },
      },
      { provide: PromosService, useValue: { commitUsage: jest.fn(async () => undefined) } },
      { provide: TransactionService, useValue: transactions },
      { provide: IotService, useValue: iot },
      PaymentsService,
      { provide: PAYMENT_GATEWAY, useValue: { name: 'mock', createCharge: jest.fn() } },
      { provide: PointService, useValue: { earn: jest.fn() } },
      {
        provide: MembershipTierService,
        useValue: {
          ensureStatus: jest.fn(async () => ({ currentTier: null })),
          getBenefits: jest.fn(async () => ({ pointMultiplier: 1, cashbackRate: 0 })),
          recordSuccessfulTransaction: jest.fn(),
        },
      },
      { provide: B2BPartnerService, useValue: { recordSuccessfulTransaction: jest.fn() } },
      { provide: CampaignService, useValue: { qualifyReferralOnFirstTransaction: jest.fn() } },
      { provide: LoyaltyConfigService, useValue: { pointEarnRate: 1000 } },
      { provide: IotMachineService, useValue: { activateMachineForOrder: jest.fn() } },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  // Sama dengan main.ts.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  // Server mendengarkan sekali, bind loopback eksplisit (hindari server ditutup
  // supertest saat request paralel & bentrok port dengan proses lain).
  await app.listen(0, '127.0.0.1');
  return {
    app,
    prisma: moduleRef.get(PrismaService),
    jwt: moduleRef.get(JwtService),
    http: () => request(app.getHttpServer()) as any,
    sentOtp,
    mocks: { transactions, iot },
  };
}

export async function resetDb(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export const body = (r: any) => r.body?.data ?? r.body;
