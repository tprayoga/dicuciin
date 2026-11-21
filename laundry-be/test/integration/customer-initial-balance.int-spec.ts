/**
 * Saldo awal member (POST /customers `initialBalance`) — temuan audit 2026-11-21.
 *
 * Dulu: CASHIER/OPERATOR/ADMIN_OUTLET bisa membuat member dengan saldo berapa pun
 * (bahkan negatif) yang langsung ditulis ke wallet.balance tanpa ledger — kredit
 * saldo tanpa pembayaran, melewati aturan top-up manual (K1).
 * Sekarang: hanya SUPER_ADMIN/OWNER, minimal 0, dan dicatat di wallet_ledgers.
 *
 * Controller + service + ledger ASLI terhadap PostgreSQL nyata.
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { CustomersController } from '../../src/modules/customers/customers.controller';
import { CustomersService } from '../../src/modules/customers/customers.service';
import { WalletLedgerService } from '../../src/modules/wallets/wallet-ledger.service';
import { createUser, resetDb } from './helpers';

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers['x-test-user'];
    if (!raw) throw new UnauthorizedException();
    req.user = JSON.parse(raw as string);
    return true;
  }
}

describe('POST /customers — saldo awal (PostgreSQL nyata)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const users: Record<string, { userId: string; role: UserRole }> = {};
  let seq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        PrismaService,
        CustomersService,
        WalletLedgerService,
        { provide: APP_GUARD, useClass: TestAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    prisma = moduleRef.get(PrismaService);

    await resetDb(prisma);
    for (const role of [UserRole.OWNER, UserRole.SUPER_ADMIN, UserRole.CASHIER, UserRole.OPERATOR, UserRole.ADMIN_OUTLET]) {
      const u = await createUser(prisma, role);
      users[role] = { userId: u.id, role };
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  const create = (role: UserRole, initialBalance?: number) =>
    request(app.getHttpServer())
      .post('/customers')
      .set('x-test-user', JSON.stringify(users[role]))
      .send({
        name: `Member ${++seq}`,
        phone: `0812000${String(10000 + seq)}`,
        password: 'rahasia123',
        ...(initialBalance !== undefined ? { initialBalance } : {}),
      });

  it.each([UserRole.CASHIER, UserRole.OPERATOR, UserRole.ADMIN_OUTLET])(
    '%s tidak boleh mengisi saldo awal (403, tidak ada member/saldo dibuat)',
    async (role) => {
      const before = await prisma.customer.count();
      await create(role, 5_000_000).expect(403);
      expect(await prisma.customer.count()).toBe(before);
    },
  );

  it.each([UserRole.CASHIER, UserRole.OPERATOR, UserRole.ADMIN_OUTLET])(
    '%s tetap bisa mendaftarkan member dengan saldo 0',
    async (role) => {
      const res = await create(role).expect(201);
      expect(Number(res.body.wallet.balance)).toBe(0);
      expect(await prisma.walletLedger.count({ where: { walletId: res.body.wallet.id } })).toBe(0);
    },
  );

  it('saldo awal negatif / pecahan ditolak validasi (400)', async () => {
    await create(UserRole.OWNER, -1000).expect(400);
    await create(UserRole.OWNER, 1000.5).expect(400);
  });

  it.each([UserRole.OWNER, UserRole.SUPER_ADMIN])(
    '%s: saldo awal dicatat lewat ledger dan cocok dengan saldo wallet',
    async (role) => {
      const res = await create(role, 25_000).expect(201);
      expect(Number(res.body.wallet.balance)).toBe(25_000);

      const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: res.body.wallet.id } });
      expect(Number(wallet.balance)).toBe(25_000);
      const ledgers = await prisma.walletLedger.findMany({ where: { walletId: wallet.id } });
      expect(ledgers).toHaveLength(1);
      expect(ledgers[0]).toMatchObject({ direction: 'CREDIT', referenceType: 'TOPUP' });
      expect(Number(ledgers[0].amount)).toBe(25_000);
      expect(Number(ledgers[0].balanceBefore)).toBe(0);
      expect(Number(ledgers[0].balanceAfter)).toBe(25_000);
    },
  );
});
