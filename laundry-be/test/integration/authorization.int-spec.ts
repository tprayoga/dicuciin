/**
 * Security gate Fase 0 (K1, K3–K12) + kebijakan outlet + endpoint Batch 1,
 * dijalankan terhadap PostgreSQL NYATA.
 *
 * Controller ASLI + RolesGuard ASLI + ValidationPipe (opsi main.ts) + PrismaService
 * ASLI (semua pengecekan akses membaca database sungguhan). Service bisnis
 * di-mock agar yang diuji murni otorisasi. JwtAuthGuard diganti guard uji yang
 * membaca identitas dari header (tanpa JWT).
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../src/common/decorators/public.decorator';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentMethod, PaymentStatus, UserRole } from '@prisma/client';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { UsersController } from '../../src/modules/users/users.controller';
import { CustomersController } from '../../src/modules/customers/customers.controller';
import { OrdersController } from '../../src/modules/orders/orders.controller';
import { WalletsController } from '../../src/modules/wallets/wallets.controller';
import { TransactionsController } from '../../src/modules/transactions/transactions.controller';
import { PricingController } from '../../src/modules/pricing/pricing.controller';
import { IotController } from '../../src/modules/iot/iot.controller';
import { KiosksController } from '../../src/modules/kiosks/kiosks.controller';
import { ReviewsController } from '../../src/modules/reviews/reviews.controller';
import { UploadsController } from '../../src/modules/uploads/uploads.controller';
import { PaymentsController } from '../../src/modules/payments/payments.controller';
import { BookingsController } from '../../src/modules/bookings/bookings.controller';
import { createCustomer, createMachine, createOutlet, createUser, resetDb } from './helpers';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

@Injectable()
class TestAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    // Sama seperti JwtAuthGuard asli: route @Public() tidak butuh login.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const raw = req.headers['x-test-user'];
    if (!raw) throw new UnauthorizedException();
    req.user = JSON.parse(raw as string);
    return true;
  }
}

function okService() {
  const fns = new Map<PropertyKey, jest.Mock>();
  return new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      if (!fns.has(prop)) fns.set(prop, jest.fn(async (...args: any[]) => ({ ok: true, args })));
      return fns.get(prop);
    },
  });
}

describe('Security gate (PostgreSQL nyata)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const id: Record<string, any> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        UsersController, CustomersController, OrdersController, WalletsController,
        TransactionsController, PricingController, IotController, KiosksController,
        ReviewsController, UploadsController, PaymentsController, BookingsController,
      ],
      providers: [
        PrismaService,
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
    prisma = moduleRef.get(PrismaService);

    // ── Seed data sungguhan ──
    await resetDb(prisma);
    const o1 = await createOutlet(prisma, 'O1');
    const o2 = await createOutlet(prisma, 'O2');
    const a = await createCustomer(prisma);
    const b = await createCustomer(prisma);
    const owner = await createUser(prisma, UserRole.OWNER);
    const superAdmin = await createUser(prisma, UserRole.SUPER_ADMIN);
    const cashier = await createUser(prisma, UserRole.CASHIER);
    const cashierNoOutlet = await createUser(prisma, UserRole.CASHIER);
    const adminOutlet = await createUser(prisma, UserRole.ADMIN_OUTLET);
    const partnerUser = await createUser(prisma, UserRole.CUSTOMER);
    await prisma.customer.create({ data: { userId: partnerUser.id, memberCode: 'MBR-P' } });
    const partner = await prisma.b2BPartner.create({
      data: { userId: partnerUser.id, partnerCode: 'P-1', companyName: 'PT Uji', picName: 'PIC', phone: '0800' },
    });
    await prisma.outletUser.createMany({
      data: [
        { userId: cashier.id, outletId: o1.id },
        { userId: adminOutlet.id, outletId: o1.id },
        { userId: adminOutlet.id, outletId: o2.id },
      ],
    });
    const mk = (customerId: string, outletId: string, status: OrderStatus, n: string) =>
      prisma.order.create({
        data: { orderNumber: `ORD-T-${n}`, customerId, outletId, sourcePlatform: 'MOBILE_APP', subtotal: 10000, totalAmount: 10000, status },
      });
    const ordA = await mk(a.customer.id, o1.id, OrderStatus.DRAFT, '1');
    const ordAPaid = await mk(a.customer.id, o1.id, OrderStatus.PAID, '2');
    const ordB = await mk(b.customer.id, o2.id, OrderStatus.DRAFT, '3');
    await prisma.payment.create({
      data: { orderId: ordB.id, paymentNumber: 'PG-ORD-T-3', paymentMethod: PaymentMethod.QRIS, amount: 10000, status: PaymentStatus.PENDING },
    });
    const machine = await createMachine(prisma, o1.id);

    Object.assign(id, {
      o1: o1.id, o2: o2.id, custA: a.customer.id, custB: b.customer.id, partner: partner.id,
      ordA: ordA.id, ordAPaid: ordAPaid.id, ordB: ordB.id, machineCode: machine.deviceCode, machine: machine.id,
      users: {
        custA: { userId: a.user.id, role: 'CUSTOMER' },
        custB: { userId: b.user.id, role: 'CUSTOMER' },
        owner: { userId: owner.id, role: 'OWNER' },
        superAdmin: { userId: superAdmin.id, role: 'SUPER_ADMIN' },
        cashier: { userId: cashier.id, role: 'CASHIER' },
        cashierNoOutlet: { userId: cashierNoOutlet.id, role: 'CASHIER' },
        adminOutlet: { userId: adminOutlet.id, role: 'ADMIN_OUTLET' },
        partnerUser: { userId: partnerUser.id, role: 'CUSTOMER' },
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type Who = 'custA' | 'custB' | 'owner' | 'superAdmin' | 'cashier' | 'cashierNoOutlet' | 'adminOutlet' | 'partnerUser';
  const as = (w: Who) => ({ 'x-test-user': JSON.stringify(id.users[w]) });
  const get = (w: Who, url: string) => request(app.getHttpServer()).get(url).set(as(w));
  const post = (w: Who, url: string, body: object = {}) => request(app.getHttpServer()).post(url).set(as(w)).send(body);
  const patch = (w: Who, url: string, body: object = {}) => request(app.getHttpServer()).patch(url).set(as(w)).send(body);
  const body = () => ({ outletId: id.o1, sourcePlatform: 'MOBILE_APP', items: [{ serviceId: 's', quantity: 1 }] });

  it('K5: customer tidak bisa mengubah/membaca user lain; /users/me menolak role', async () => {
    await patch('custA', `/users/${id.users.owner.userId}`, { role: 'SUPER_ADMIN' }).expect(403);
    await get('custA', `/users/${id.users.custB.userId}`).expect(403);
    await patch('custA', '/users/me', { role: 'SUPER_ADMIN' }).expect(400);
    await patch('custA', '/users/me', { name: 'Budi' }).expect(200);
  });

  it('K6: isolasi data antar customer (database nyata)', async () => {
    for (const url of [`/customers/${id.custB}`, `/customers/${id.custB}/orders`, `/customers/${id.custB}/wallet`,
      `/customers/${id.custB}/stats`, `/wallets/customer/${id.custB}`, `/orders/${id.ordB}`, '/payments/PG-ORD-T-3/status',
      `/reviews/order/${id.ordB}`]) {
      await get('custA', url).expect(403);
    }
    for (const url of [`/customers/${id.custA}`, `/customers/${id.custA}/wallet`, `/orders/${id.ordA}`]) {
      await get('custA', url).expect(200);
    }
    await get('custA', '/customers').expect(403);
    await get('custA', '/orders').expect(403);
    await get('custA', `/customers/tidak-ada`).expect(404);
  });

  it('K7: customer tidak bisa mengubah status order', () =>
    patch('custA', `/orders/${id.ordA}/status`, { status: 'PAID' }).expect(403));

  it('K11: buat/batal order atas nama atau milik orang lain ditolak', async () => {
    await post('custA', '/orders', { ...body(), customerId: id.custB }).expect(403);
    await post('custA', `/orders/${id.ordB}/cancel`, { cancelReason: 'batal uji' }).expect(403);
  });

  it('K1/K9/K3/K4: top-up, refund, bayar wallet orang lain ditolak', async () => {
    await post('custA', `/wallets/customer/${id.custA}/topup`, { amount: 100000 }).expect(403);
    await post('custA', '/transactions/topup', { customerId: id.custA, amount: 100000 }).expect(403);
    await post('custA', `/wallets/customer/${id.custA}/refund`, { orderId: id.ordAPaid, description: 'alasan uji' }).expect(403);
    await post('custB', `/wallets/customer/${id.custA}/pay`, { orderId: id.ordA }).expect(403);
    await post('custA', `/wallets/customer/${id.custA}/pay`, { orderId: id.ordA, amount: 1 }).expect(400);
  });

  it('K8: checkout/quote/pricing atas nama customer/partner lain ditolak; partner milik sendiri boleh', async () => {
    for (const url of ['/transactions/checkout', '/transactions/quote', '/pricing/calculate']) {
      await post('custA', url, { ...body(), customerId: id.custB }).expect(403);
      await post('custA', url, { ...body(), partnerId: id.partner }).expect(403);
    }
    await post('partnerUser', '/transactions/checkout', { ...body(), partnerId: id.partner }).expect(201);
  });

  it('K10/K12: perintah mesin & data internal tertutup untuk customer', async () => {
    await post('custA', `/iot/devices/${id.machine}/commands`, { command: 'START' }).expect(403);
    await post('custA', `/iot/devices/${id.machine}/heartbeat`).expect(403);
    for (const url of ['/iot/devices', '/kiosks', '/kiosks/assigned', '/reviews/focused']) await get('custA', url).expect(403);
    await post('custA', '/uploads/image').expect(403);
  });

  it('Outlet: kasir hanya outlet yang ditugaskan; owner global', async () => {
    await get('cashier', '/orders/summary/finance').expect(200);
    await get('cashier', '/orders').expect(200);
    await get('cashier', `/orders/${id.ordAPaid}`).expect(200);
    await get('cashier', `/orders/summary/finance?outletId=${id.o2}`).expect(403);
    await get('cashier', `/orders/${id.ordB}`).expect(403);
    await patch('cashier', `/orders/${id.ordB}/status`, { status: 'WASHING' }).expect(403);
    await get('cashierNoOutlet', '/orders/summary/finance').expect(403);
    await get('adminOutlet', '/orders/summary/finance').expect(200); // gabungan outlet yang ditugaskan
    await get('adminOutlet', `/orders/summary/finance?outletId=${id.o2}`).expect(200);
    await get('owner', '/orders/summary/finance').expect(200);
  });

  it('Regresi Admin: endpoint yang dipakai panel admin tetap bisa diakses owner & super admin', async () => {
    const cases: [string, string, object?][] = [
      ['get', '/customers'], ['get', `/customers/${id.custA}`], ['get', `/customers/${id.custA}/orders`],
      ['get', '/orders'], ['get', '/orders/summary/dashboard'], ['get', '/orders/summary/finance'],
      ['get', '/users'], ['patch', `/users/${id.users.cashier.userId}`, { name: 'Kasir' }],
      ['post', '/users', { name: 'Staf Baru', email: 'staf.baru@uji.test', password: 'rahasia123', role: 'CASHIER' }],
      ['get', '/iot/devices'], ['patch', `/iot/devices/${id.machine}`, { name: 'Mesin A' }],
      ['get', '/kiosks'], ['get', '/reviews'], ['get', '/reviews/stats'],
      ['post', `/wallets/orders/${id.ordAPaid}/refund`, { description: 'refund admin uji' }],
      ['post', '/customers', { name: 'Member Baru', email: 'member.baru@uji.test', password: 'rahasia123' }],
    ];
    for (const who of ['owner', 'superAdmin'] as Who[]) {
      for (const [m, url, b] of cases) {
        const r = await (request(app.getHttpServer()) as any)[m](url).set(as(who)).send(b ?? {});
        if (r.status === 401 || r.status === 403 || r.status >= 500) {
          throw new Error(`${who} gagal di ${m.toUpperCase()} ${url}: ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
        }
      }
    }
    // Upload gambar banner/promo oleh admin: lolos otorisasi (400 karena tanpa file).
    await post('owner', '/uploads/image').expect(400);
  });

  it('Regresi Kiosk: endpoint perangkat (@Public, token perangkat) tetap dapat dijangkau tanpa JWT', async () => {
    for (const url of ['/kiosks/device/bootstrap', '/kiosks/device/services', '/kiosks/device/machines']) {
      const r = await request(app.getHttpServer()).get(url).set('Authorization', 'Bearer token-perangkat');
      expect(r.status).toBe(200);
    }
    const hb = await request(app.getHttpServer()).post('/kiosks/device/heartbeat').set('Authorization', 'Bearer token-perangkat');
    expect(hb.status).toBe(201);
  });

  it('Batch 1: bayar saldo & scan QR wajib login customer; data tervalidasi', async () => {
    await request(app.getHttpServer()).post('/payments/wallet').send({ orderId: id.ordA }).expect(401);
    await post('custA', '/payments/wallet', { orderId: id.ordA, amount: 1 }).expect(400); // nominal dari klien ditolak
    await request(app.getHttpServer()).post('/bookings/verify').send({ deviceCode: id.machineCode }).expect(401);
  });
});
