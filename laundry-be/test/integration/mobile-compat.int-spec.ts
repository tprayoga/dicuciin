/**
 * Batch 1.5 — kompatibilitas aplikasi mobile VERSI LAMA (rilis sebelum Batch 1)
 * terhadap backend baru. Integration test HTTP terhadap PostgreSQL NYATA,
 * dengan JWT asli (JwtStrategy) dan service asli.
 *
 * Payload meniru persis yang dikirim app lama (git: main,
 * laundry_mobile_flutter/lib/features/{auth,customer}/*_service.dart).
 * "START" = perintah tercatat & dikirim ke broker MQTT tiruan — BUKAN uji
 * perangkat IoT fisik.
 */
import { OrderCreateController } from '../../src/modules/transactions/order-create.controller';
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import * as request from "supertest";
import { BookingStatus, OrderStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import { JwtStrategy } from "../../src/modules/auth/jwt.strategy";
import { OrdersController } from "../../src/modules/orders/orders.controller";
import { OrdersService } from "../../src/modules/orders/orders.service";
import { BookingsController } from "../../src/modules/bookings/bookings.controller";
import { BookingsService } from "../../src/modules/bookings/bookings.service";
import { PaymentsController } from "../../src/modules/payments/payments.controller";
import { LegacyWalletPayController } from "../../src/modules/payments/legacy-wallet-pay.controller";
import { PaymentsService } from "../../src/modules/payments/payments.service";
import { PAYMENT_GATEWAY } from "../../src/modules/payments/gateway/payment-gateway.interface";
import { UsersController } from "../../src/modules/users/users.controller";
import { UsersService } from "../../src/modules/users/users.service";
import { TransactionsController } from "../../src/modules/transactions/transactions.controller";
import { TransactionService } from "../../src/modules/transactions/transaction.service";
import { IotService } from "../../src/modules/iot/iot.service";
import {
  IotMachineService,
  START_MACHINE,
} from "../../src/modules/iot/iot-machine.service";
import { IotMqttService } from "../../src/modules/iot/iot-mqtt.service";
import { WalletLedgerService } from "../../src/modules/wallets/wallet-ledger.service";
import { PromosService } from "../../src/modules/promos/promos.service";
import { PointService } from "../../src/modules/points/point.service";
import { MembershipTierService } from "../../src/modules/memberships/membership-tier.service";
import { B2BPartnerService } from "../../src/modules/partners/b2b-partner.service";
import { CampaignService } from "../../src/modules/campaigns/campaign.service";
import { LoyaltyConfigService } from "../../src/modules/loyalty-config/loyalty-config.service";
import { PricingService } from "../../src/modules/pricing/pricing.service";
import { VoucherService } from "../../src/modules/vouchers/voucher.service";
import {
  createCustomer,
  createMachine,
  createOutlet,
  createServiceWithPrice,
  createUser,
  inMinutes,
  resetDb,
} from "./helpers";

const JWT_SECRET = "integration-test-secret";

describe("Batch 1.5 — app mobile versi lama ↔ backend baru (PostgreSQL nyata)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payments: PaymentsService;
  let jwt: JwtService;
  const mqtt = { publishCommand: jest.fn(), eventHandler: undefined as any };
  let chargeSeq = 0;
  const gateway = {
    name: "mock",
    createCharge: jest.fn(async () => ({
      externalId: `ext-m-${++chargeSeq}`,
      qrString: "qr",
      expiresAt: inMinutes(15),
    })),
  };
  const pricing = {
    calculate: jest.fn(async () => ({
      basePrice: 10000,
      b2bDiscount: 0,
      happyHourDiscount: 0,
      voucherDiscount: 0,
      promoDiscount: 0,
      finalAmount: 10000,
      spendingAmount: 10000,
      pointsToEarn: 0,
      cashbackToCredit: 0,
      happyHourRules: [],
      b2bPricingRules: [],
      voucherId: null,
      promoId: null,
    })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: JWT_SECRET })],
      controllers: [
        OrdersController,
        OrderCreateController,
        BookingsController,
        PaymentsController,
        LegacyWalletPayController,
        UsersController,
        TransactionsController,
      ],
      providers: [
        PrismaService,
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string, d?: any) =>
              k === "JWT_ACCESS_SECRET" ? JWT_SECRET : d,
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        OrdersService,
        BookingsService,
        PaymentsService,
        UsersService,
        TransactionService,
        IotService,
        IotMachineService,
        WalletLedgerService,
        { provide: PricingService, useValue: pricing },
        { provide: VoucherService, useValue: { redeem: jest.fn() } },
        { provide: IotMqttService, useValue: mqtt },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        {
          provide: PromosService,
          useValue: { evaluatePromo: jest.fn(), commitUsage: jest.fn() },
        },
        { provide: PointService, useValue: { earn: jest.fn() } },
        {
          provide: MembershipTierService,
          useValue: {
            ensureStatus: jest.fn(async () => ({ currentTier: null })),
            getBenefits: jest.fn(async () => ({
              pointMultiplier: 1,
              cashbackRate: 0,
            })),
            recordSuccessfulTransaction: jest.fn(),
          },
        },
        {
          provide: B2BPartnerService,
          useValue: { recordSuccessfulTransaction: jest.fn() },
        },
        {
          provide: CampaignService,
          useValue: { qualifyReferralOnFirstTransaction: jest.fn() },
        },
        { provide: LoyaltyConfigService, useValue: { pointEarnRate: 1000 } },
      ],
    })
      .useMocker(() => ({}))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = moduleRef.get(PrismaService);
    payments = moduleRef.get(PaymentsService);
    jwt = moduleRef.get(JwtService);
  });
  afterAll(() => app.close());

  let outlet: any, washer: any, washer2: any, service: any;
  beforeEach(async () => {
    await resetDb(prisma);
    mqtt.publishCommand.mockClear();
    outlet = await createOutlet(prisma);
    washer = await createMachine(prisma, outlet.id);
    washer2 = await createMachine(prisma, outlet.id);
    service = await createServiceWithPrice(prisma, outlet.id, 10000);
  });

  const http = () => request(app.getHttpServer());
  const auth = (userId: string, role: UserRole = UserRole.CUSTOMER) => ({
    Authorization: `Bearer ${jwt.sign({ sub: userId, email: "x@uji.test", role })}`,
  });
  const starts = () =>
    prisma.iotCommand.count({ where: { command: START_MACHINE } });
  const balance = async (customerId: string) =>
    Number(
      (await prisma.wallet.findUniqueOrThrow({ where: { customerId } }))
        .balance,
    );

  // Payload persis app lama.
  const oldReserve = (c: any, deviceCode: string) =>
    http().post("/bookings").set(auth(c.user.id)).send({ deviceCode });
  const oldCreateOrder = (c: any) =>
    http()
      .post("/orders")
      .set(auth(c.user.id))
      .send({
        customerId: c.customer.id,
        outletId: outlet.id,
        sourcePlatform: "MOBILE_APP",
        items: [{ serviceId: service.id, quantity: 1, machineType: "WASHER" }],
      });
  const oldWalletPay = (c: any, orderId: string, amount = 10000) =>
    http()
      .post(`/wallets/customer/${c.customer.id}/pay`)
      .set(auth(c.user.id))
      .send({ orderId, amount });
  const oldScan = (c: any, deviceCode: string) =>
    http().post("/bookings/verify").set(auth(c.user.id)).send({ deviceCode });

  describe("alur booking app lama (reserve → order → bayar → scan)", () => {
    it("reservasi lama terikat ke order; bayar saldo (amount palsu diabaikan) → RESERVED → scan → START sekali", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      await oldReserve(c, washer.deviceCode).expect(201);
      const order = (await oldCreateOrder(c).expect(201)).body;
      const b = await prisma.machineBooking.findFirstOrThrow({
        where: { customerId: c.customer.id },
      });
      expect(b.orderId).toBe(order.id);
      expect(b.status).toBe(BookingStatus.HOLD);

      const pay = await oldWalletPay(c, order.id, 1).expect(201);
      expect(Number(pay.body.wallet.balance)).toBe(40000); // bentuk respons lama dipertahankan
      expect(await balance(c.customer.id)).toBe(40000); // total order, bukan 1
      expect(
        (await prisma.machineBooking.findUniqueOrThrow({ where: { id: b.id } }))
          .status,
      ).toBe(BookingStatus.RESERVED);
      expect(await starts()).toBe(0);

      await oldScan(c, washer.deviceCode).expect(201);
      await oldScan(c, washer.deviceCode);
      expect(await starts()).toBe(1);
    });

    it("reservasi lama + bayar QRIS (/payments/gateway) + webhook → RESERVED → scan → START", async () => {
      const c = await createCustomer(prisma);
      await oldReserve(c, washer.deviceCode).expect(201);
      const order = (await oldCreateOrder(c).expect(201)).body;
      const pg = await http()
        .post("/payments/gateway")
        .set(auth(c.user.id))
        .send({ orderId: order.id, method: "QRIS" })
        .expect(201);
      const row = await prisma.payment.findUniqueOrThrow({
        where: { paymentNumber: pg.body.paymentNumber },
      });
      await payments.handleWebhook({
        externalId: row.externalId!,
        status: "PAID",
      } as any);
      await oldScan(c, washer.deviceCode).expect(201);
      expect(await starts()).toBe(1);
    });

    it('"Booking & Pakai" app lama (reserve lalu scan TANPA bayar) → ditolak, 0 START', async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      await oldReserve(c, washer.deviceCode).expect(201);
      const res = await oldScan(c, washer.deviceCode);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await starts()).toBe(0);
      expect(await balance(c.customer.id)).toBe(50000);
    });

    it("ambigu (2 reservasi lama sejenis) → tidak diikat; dibayar tetap tidak bisa menyalakan mesin", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      await oldReserve(c, washer.deviceCode).expect(201);
      await oldReserve(c, washer2.deviceCode).expect(201);
      const order = (await oldCreateOrder(c).expect(201)).body;
      expect(
        await prisma.machineBooking.count({ where: { orderId: order.id } }),
      ).toBe(0);
      await oldWalletPay(c, order.id).expect(201);
      const res = await oldScan(c, washer.deviceCode);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await starts()).toBe(0);
    });

    it("reservasi kedaluwarsa / milik orang lain / outlet lain tidak pernah diikat", async () => {
      const a = await createCustomer(prisma);
      const other = await createCustomer(prisma);
      await oldReserve(other, washer.deviceCode).expect(201); // HOLD milik orang lain
      const outlet2 = await createOutlet(prisma, "O2");
      const far = await createMachine(prisma, outlet2.id);
      await oldReserve(a, far.deviceCode).expect(201); // HOLD di outlet lain
      await oldReserve(a, washer2.deviceCode).expect(201);
      await prisma.machineBooking.updateMany({
        where: { device: { id: washer2.id } },
        data: { expiresAt: inMinutes(-1) },
      });
      const order = (await oldCreateOrder(a).expect(201)).body;
      expect(
        await prisma.machineBooking.count({ where: { orderId: order.id } }),
      ).toBe(0);
    });
  });

  describe("rute bayar-saldo lama /wallets/customer/:id/pay → jalur tunggal", () => {
    it("saldo kurang → 400 tanpa potongan; order orang lain → 403; order tak ada → 404; sudah dibayar → 409", async () => {
      const poor = await createCustomer(prisma, { balance: 5000 });
      const rich = await createCustomer(prisma, { balance: 50000 });
      const o1 = (await oldCreateOrder(poor).expect(201)).body;
      await oldWalletPay(poor, o1.id).expect(400);
      expect(await balance(poor.customer.id)).toBe(5000);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o1.id } })).status,
      ).toBe(OrderStatus.DRAFT);
      await http()
        .post(`/wallets/customer/${poor.customer.id}/pay`)
        .set(auth(rich.user.id))
        .send({ orderId: o1.id })
        .expect(403);
      await http()
        .post(`/wallets/customer/${rich.customer.id}/pay`)
        .set(auth(rich.user.id))
        .send({ orderId: o1.id })
        .expect(403);
      await oldWalletPay(rich, "00000000-0000-0000-0000-000000000000").expect(
        404,
      );
      const o2 = (await oldCreateOrder(rich).expect(201)).body;
      await oldWalletPay(rich, o2.id).expect(201);
      await oldWalletPay(rich, o2.id).expect(409);
      expect(await balance(rich.customer.id)).toBe(40000);
    });

    it("4 bayar paralel (rute lama + rute baru) → tepat 1 pembayaran, saldo terpotong sekali", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const o = (await oldCreateOrder(c).expect(201)).body;
      const res = await Promise.all([
        oldWalletPay(c, o.id),
        oldWalletPay(c, o.id),
        http()
          .post("/payments/wallet")
          .set(auth(c.user.id))
          .send({ orderId: o.id }),
        http()
          .post("/payments/wallet")
          .set(auth(c.user.id))
          .send({ orderId: o.id }),
      ]);
      expect(res.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await balance(c.customer.id)).toBe(40000);
      expect(await prisma.payment.count({ where: { orderId: o.id } })).toBe(1);
    });

    it.each([OrderStatus.CANCELLED, OrderStatus.REFUNDED, OrderStatus.COMPLETED])(
      "order berstatus %s tidak bisa dibayar lewat rute lama (400, saldo utuh)",
      async (status) => {
        const c = await createCustomer(prisma, { balance: 50000 });
        const o = (await oldCreateOrder(c).expect(201)).body;
        await prisma.order.update({ where: { id: o.id }, data: { status } });
        await oldWalletPay(c, o.id).expect(400);
        expect(await balance(c.customer.id)).toBe(50000);
      },
    );

    it("Batch 2: tagihan QRIS aktif → bayar saldo lewat rute lama MEMBATALKAN QRIS & memotong saldo sekali", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const o = (await oldCreateOrder(c).expect(201)).body;
      const pg = await http()
        .post("/payments/gateway")
        .set(auth(c.user.id))
        .send({ orderId: o.id, method: "QRIS" })
        .expect(201);
      await oldWalletPay(c, o.id).expect(201);
      expect(await balance(c.customer.id)).toBe(40000);
      const qr = await prisma.payment.findUniqueOrThrow({ where: { paymentNumber: pg.body.paymentNumber } });
      expect(qr.status).toBe("CANCELLED");
      expect(qr.pendingSlot).toBeNull();
    });
  });

  describe("edit profil app lama PATCH /users/:id {name, email, phone}", () => {
    it("diri sendiri: nama/email berubah; nomor HP sama diterima, beda → 400; field istimewa → 403; user lain → 403", async () => {
      const c = await createCustomer(prisma);
      await prisma.user.update({
        where: { id: c.user.id },
        data: { phone: "081200000001" },
      });
      const other = await createCustomer(prisma);
      const res = await http()
        .patch(`/users/${c.user.id}`)
        .set(auth(c.user.id))
        .send({ name: "Nama Baru", email: null, phone: "081200000001" })
        .expect(200);
      expect(res.body.name).toBe("Nama Baru");
      await http()
        .patch(`/users/${c.user.id}`)
        .set(auth(c.user.id))
        .send({ name: "X Y", phone: "089999" })
        .expect(400);
      await http()
        .patch(`/users/${c.user.id}`)
        .set(auth(c.user.id))
        .send({ role: "SUPER_ADMIN" })
        .expect(403);
      await http()
        .patch(`/users/${c.user.id}`)
        .set(auth(c.user.id))
        .send({ isActive: false })
        .expect(403);
      await http()
        .patch(`/users/${other.user.id}`)
        .set(auth(c.user.id))
        .send({ name: "Hack" })
        .expect(403);
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: c.user.id },
      });
      expect(u).toMatchObject({
        role: UserRole.CUSTOMER,
        phone: "081200000001",
        isActive: true,
      });
    });

    it("owner tetap bisa mengubah user lain (panel admin)", async () => {
      const owner = await createUser(prisma, UserRole.OWNER);
      const cashier = await createUser(prisma, UserRole.CASHIER);
      await http()
        .patch(`/users/${cashier.id}`)
        .set(auth(owner.id, UserRole.OWNER))
        .send({ name: "Kasir A" })
        .expect(200);
    });
  });
});
