/**
 * Security gate Fase 0 (K1, K3–K12): test otorisasi tingkat HTTP.
 *
 * Controller ASLI + RolesGuard ASLI + ValidationPipe (opsi sama dengan main.ts)
 * dijalankan lewat supertest. Yang dipalsukan hanya:
 *  - JwtAuthGuard → identitas dari header `x-test-user` (tanpa JWT),
 *  - PrismaService → fixture in-memory (customer A/B, order, payment, partner),
 *  - service lain → mock yang selalu sukses (agar yang diuji murni akses).
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
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import * as request from 'supertest';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UsersController } from '../../modules/users/users.controller';
import { UsersService } from '../../modules/users/users.service';
import { CustomersController } from '../../modules/customers/customers.controller';
import { OrdersController } from '../../modules/orders/orders.controller';
import { OrdersService } from '../../modules/orders/orders.service';
import { WalletsController } from '../../modules/wallets/wallets.controller';
import { TransactionsController } from '../../modules/transactions/transactions.controller';
import { PricingController } from '../../modules/pricing/pricing.controller';
import { IotController } from '../../modules/iot/iot.controller';
import { KiosksController } from '../../modules/kiosks/kiosks.controller';
import { ReviewsController } from '../../modules/reviews/reviews.controller';
import { UploadsController } from '../../modules/uploads/uploads.controller';
import { PaymentsController } from '../../modules/payments/payments.controller';

// `uuid` versi ESM tidak bisa di-transform ts-jest; test ini tidak mengunggah file.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));
// Kompilasi awal + supertest bisa melampaui 5 detik bawaan saat suite paralel.
jest.setTimeout(20000);

// ── Identitas uji ──────────────────────────────────────────────────────────
const USERS = {
  superAdmin: { userId: 'u-sa', role: 'SUPER_ADMIN' },
  owner: { userId: 'u-owner', role: 'OWNER' },
  adminOutlet: { userId: 'u-ao', role: 'ADMIN_OUTLET' },
  cashier: { userId: 'u-cashier', role: 'CASHIER' },
  custA: { userId: 'u-A', role: 'CUSTOMER' },
  custB: { userId: 'u-B', role: 'CUSTOMER' },
  partnerUser: { userId: 'u-P', role: 'CUSTOMER' },
} as const;
type Who = keyof typeof USERS;

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

// ── Fixture database ───────────────────────────────────────────────────────
const CUSTOMERS: Record<string, { id: string; userId: string }> = {
  'cust-A': { id: 'cust-A', userId: 'u-A' },
  'cust-B': { id: 'cust-B', userId: 'u-B' },
};
const ORDERS: Record<string, { id: string; customerId: string | null; status: OrderStatus }> = {
  'ord-A': { id: 'ord-A', customerId: 'cust-A', status: OrderStatus.DRAFT },
  'ord-A-paid': { id: 'ord-A-paid', customerId: 'cust-A', status: OrderStatus.PAID },
  'ord-B': { id: 'ord-B', customerId: 'cust-B', status: OrderStatus.DRAFT },
};
const PAYMENTS: Record<string, { orderId: string }> = { 'PG-ORD-B': { orderId: 'ord-B' } };

function orderView(o: (typeof ORDERS)[string] | undefined) {
  if (!o) return null;
  const c = o.customerId ? CUSTOMERS[o.customerId] : null;
  return { ...o, totalAmount: 10000, customer: c ? { userId: c.userId } : null };
}

const prismaMock = {
  customer: {
    findUnique: jest.fn(async ({ where }: any) => {
      if (where.id) return CUSTOMERS[where.id] ?? null;
      if (where.userId) return Object.values(CUSTOMERS).find((c) => c.userId === where.userId) ?? null;
      return null;
    }),
  },
  order: { findUnique: jest.fn(async ({ where }: any) => orderView(ORDERS[where.id])) },
  payment: { findUnique: jest.fn(async ({ where }: any) => PAYMENTS[where.paymentNumber] ?? null) },
  b2BPartner: {
    findUnique: jest.fn(async ({ where }: any) =>
      where.id === 'partner-P' ? { userId: 'u-P' } : null,
    ),
  },
};

/** Mock service generik: setiap method sukses dan mengembalikan argumennya. */
function okService() {
  const fns = new Map<PropertyKey, jest.Mock>();
  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined; // bukan Promise
        if (!fns.has(prop)) fns.set(prop, jest.fn(async (...args: any[]) => ({ ok: true, args })));
        return fns.get(prop);
      },
    },
  );
}

describe('Otorisasi HTTP — security gate Fase 0', () => {
  let app: INestApplication;
  let usersService: any;
  let ordersService: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        UsersController, CustomersController, OrdersController, WalletsController,
        TransactionsController, PricingController, IotController, KiosksController,
        ReviewsController, UploadsController, PaymentsController,
      ],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: { get: (_k: string, d?: any) => d } },
        { provide: APP_GUARD, useClass: TestAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .useMocker(() => okService())
      .overrideGuard(JwtAuthGuard)
      .useClass(TestAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    usersService = moduleRef.get(UsersService);
    ordersService = moduleRef.get(OrdersService);
  });

  afterAll(() => app.close());

  const as = (who: Who) => ({ 'x-test-user': JSON.stringify(USERS[who]) });
  const get = (who: Who, url: string) => request(app.getHttpServer()).get(url).set(as(who));
  const post = (who: Who, url: string, body: object = {}) =>
    request(app.getHttpServer()).post(url).set(as(who)).send(body);
  const patch = (who: Who, url: string, body: object = {}) =>
    request(app.getHttpServer()).patch(url).set(as(who)).send(body);

  // ── K5: user ──────────────────────────────────────────────────────────────
  describe('K5 — ubah user', () => {
    it('customer tidak bisa PATCH /users/:id (eskalasi role)', async () => {
      await patch('custA', '/users/u-sa', { role: 'SUPER_ADMIN' }).expect(403);
      await patch('custA', '/users/u-A', { role: 'SUPER_ADMIN' }).expect(403);
    });
    it('customer tidak bisa GET /users/:id', () => get('custA', '/users/u-B').expect(403));
    it('kasir tidak bisa mengelola user', () => patch('cashier', '/users/u-A', { name: 'x' }).expect(403));
    it('owner/super admin tetap bisa PATCH /users/:id', async () => {
      await patch('owner', '/users/u-cashier', { name: 'Kasir' }).expect(200);
      await patch('superAdmin', '/users/u-owner', { name: 'Owner' }).expect(200);
    });
    it('PATCH /users/me hanya untuk diri sendiri dan menolak role/password', async () => {
      await patch('custA', '/users/me', { name: 'Budi' }).expect(200);
      expect(usersService.updateMe).toHaveBeenLastCalledWith('u-A', { name: 'Budi' });
      await patch('custA', '/users/me', { role: 'SUPER_ADMIN' }).expect(400);
      await patch('custA', '/users/me', { password: 'rahasia123' }).expect(400);
      await patch('custA', '/users/me', { avatarUrl: 'https://evil.example/x.png' }).expect(400);
    });
  });

  // ── K6: data customer & order ─────────────────────────────────────────────
  describe('K6 — isolasi data customer', () => {
    it('customer tidak bisa melihat daftar customer/order/ringkasan', async () => {
      await get('custA', '/customers').expect(403);
      await get('custA', '/orders').expect(403);
      await get('custA', '/orders/summary/dashboard').expect(403);
      await get('custA', '/orders/summary/finance').expect(403);
    });
    it.each([
      '/customers/cust-B', '/customers/cust-B/orders', '/customers/cust-B/wallet',
      '/customers/cust-B/stats', '/wallets/customer/cust-B', '/wallets/customer/cust-B/transactions',
      '/orders/ord-B', '/payments/PG-ORD-B/status', '/reviews/order/ord-B',
    ])('customer A ditolak di %s (milik B)', (url) => get('custA', url).expect(403));
    it.each([
      '/customers/cust-A', '/customers/cust-A/orders', '/customers/cust-A/wallet',
      '/customers/cust-A/stats', '/wallets/customer/cust-A', '/orders/ord-A',
    ])('customer A tetap bisa %s (miliknya)', (url) => get('custA', url).expect(200));
    it('staf tetap bisa membaca daftar & data customer', async () => {
      await get('cashier', '/customers').expect(200);
      await get('cashier', '/orders').expect(200);
      await get('cashier', '/customers/cust-B/orders').expect(200);
      await get('adminOutlet', '/orders/summary/finance').expect(200);
    });
    it('kasir tidak bisa membuka laporan keuangan', () => get('cashier', '/orders/summary/finance').expect(403));
  });

  // ── K7: status order ──────────────────────────────────────────────────────
  describe('K7 — status order', () => {
    it('customer tidak bisa mengubah status order', async () => {
      await patch('custA', '/orders/ord-A/status', { status: 'PAID' }).expect(403);
      await patch('custA', '/orders/ord-A/status', { status: 'COMPLETED' }).expect(403);
    });
    it('staf boleh memanggil endpoint (aturan transisi diuji di unit test)', () =>
      patch('cashier', '/orders/ord-A-paid/status', { status: 'WASHING' }).expect(200));
  });

  // ── K11: buat & batal order ───────────────────────────────────────────────
  describe('K11 — buat & batal order', () => {
    it('customer tidak bisa membuat order atas nama customer lain', () =>
      post('custA', '/orders', { customerId: 'cust-B', outletId: 'o-1', sourcePlatform: 'MOBILE_APP', items: [{ serviceId: 's', quantity: 1 }] }).expect(403));
    it('customer membuat order → customerId dipaksa miliknya', async () => {
      await post('custA', '/orders', { outletId: 'o-1', sourcePlatform: 'MOBILE_APP', items: [{ serviceId: 's', quantity: 1 }] }).expect(201);
      expect(ordersService.create.mock.calls.at(-1)[0].customerId).toBe('cust-A');
    });
    it('pembatalan meneruskan identitas ke service (aturan pemilik diuji di unit test)', async () => {
      await post('custA', '/orders/ord-B/cancel', { cancelReason: 'batal uji' }).expect(201);
      expect(ordersService.cancel.mock.calls.at(-1)[3]).toEqual(USERS.custA);
    });
  });

  // ── K1, K3, K4, K9: wallet ────────────────────────────────────────────────
  describe('K1/K3/K4/K9 — wallet', () => {
    it('customer tidak bisa top-up langsung (dua jalur)', async () => {
      await post('custA', '/wallets/customer/cust-A/topup', { amount: 1000000 }).expect(403);
      await post('custA', '/transactions/topup', { customerId: 'cust-A', amount: 1000000 }).expect(403);
    });
    it('owner bisa top-up manual', () =>
      post('owner', '/wallets/customer/cust-A/topup', { amount: 50000 }).expect(201));
    it('customer tidak bisa refund mandiri', () =>
      post('custA', '/wallets/customer/cust-A/refund', { orderId: 'ord-A-paid', description: 'alasan uji' }).expect(403));
    it('admin refund lewat rute lama hanya untuk order milik customer di URL', async () => {
      await post('adminOutlet', '/wallets/customer/cust-B/refund', { orderId: 'ord-A-paid', description: 'alasan uji' }).expect(404);
      await post('adminOutlet', '/wallets/customer/cust-A/refund', { orderId: 'ord-A-paid', description: 'alasan uji' }).expect(201);
    });
    it('bayar saldo: customer B tidak bisa memakai wallet A; field amount ditolak', async () => {
      await post('custB', '/wallets/customer/cust-A/pay', { orderId: 'ord-A' }).expect(403);
      await post('custA', '/wallets/customer/cust-A/pay', { orderId: 'ord-A', amount: 1 }).expect(400);
      await post('custA', '/wallets/customer/cust-A/pay', { orderId: 'ord-A' }).expect(201);
    });
  });

  // ── K8: checkout/quote/pricing atas nama orang lain ───────────────────────
  describe('K8 — identitas checkout', () => {
    const body = { outletId: 'o-1', items: [{ serviceId: 's', quantity: 1 }] };
    it.each(['/transactions/checkout', '/transactions/quote', '/pricing/calculate'])(
      'customer A tidak bisa %s atas nama B atau partner orang lain',
      async (url) => {
        await post('custA', url, { ...body, customerId: 'cust-B' }).expect(403);
        await post('custA', url, { ...body, partnerId: 'partner-P' }).expect(403);
      },
    );
    it('pemilik partner boleh checkout atas nama partnernya', () =>
      post('partnerUser', '/transactions/checkout', { ...body, partnerId: 'partner-P' }).expect(201));
    it('customer A boleh checkout untuk dirinya sendiri', () =>
      post('custA', '/transactions/checkout', { ...body, customerId: 'cust-A' }).expect(201));
  });

  // ── K10, K12: IoT, kiosk, ulasan, upload ──────────────────────────────────
  describe('K10/K12 — perangkat & data internal', () => {
    it('customer tidak bisa mengirim perintah/heartbeat mesin', async () => {
      await post('custA', '/iot/devices/dev-1/commands', { command: 'START' }).expect(403);
      await post('custA', '/iot/devices/dev-1/heartbeat').expect(403);
    });
    it.each(['/iot/devices', '/iot/devices/dev-1', '/iot/devices/dev-1/events', '/kiosks', '/kiosks/assigned', '/kiosks/k-1', '/reviews/focused'])(
      'customer ditolak di %s',
      (url) => get('custA', url).expect(403),
    );
    it('customer tidak bisa upload gambar umum', () => post('custA', '/uploads/image').expect(403));
    it('staf tetap bisa membaca daftar mesin & kiosk', async () => {
      await get('cashier', '/iot/devices').expect(200);
      await get('cashier', '/kiosks').expect(200);
    });
  });

  it('request tanpa identitas ditolak', () => request(app.getHttpServer()).get('/orders/ord-A').expect(401));
});
