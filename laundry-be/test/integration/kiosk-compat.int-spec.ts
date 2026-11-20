/**
 * Batch 1.5 — kompatibilitas kiosk, autentikasi perangkat, pembayaran kiosk,
 * aktivasi mesin. Integration test terhadap PostgreSQL NYATA via HTTP.
 *
 * ASLI: JwtAuthGuard global + JwtStrategy (token JWT ditandatangani sungguhan),
 * RolesGuard, JwtOrKioskDeviceGuard, ValidationPipe, KiosksController,
 * PricingController, OrdersController, serta service Orders, Bookings, Iot,
 * IotMachine, Payments, Transaction, WalletLedger, Kiosks.
 * Di-mock: broker MQTT (publish dicatat), gateway Midtrans, perhitungan harga
 * (PricingCalculationService/PricingService), dan modul loyalty.
 *
 * CATATAN: "START dipublikasikan" = perintah tercatat & dikirim ke broker MQTT
 * tiruan. Ini BUKAN verifikasi perangkat IoT fisik.
 */
import { OrderCreateController } from '../../src/modules/transactions/order-create.controller';
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import * as request from "supertest";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import {
  BookingStatus,
  OrderStatus,
  PaymentStatus,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import { JwtStrategy } from "../../src/modules/auth/jwt.strategy";
import { KiosksController } from "../../src/modules/kiosks/kiosks.controller";
import { KiosksService } from "../../src/modules/kiosks/kiosks.service";
import { PricingController } from "../../src/modules/pricing/pricing.controller";
import { PricingCalculationService } from "../../src/modules/pricing/pricing-calculation.service";
import { OrdersController } from "../../src/modules/orders/orders.controller";
import { OrdersService } from "../../src/modules/orders/orders.service";
import { BookingsService } from "../../src/modules/bookings/bookings.service";
import { IotService } from "../../src/modules/iot/iot.service";
import {
  IotMachineService,
  START_MACHINE,
} from "../../src/modules/iot/iot-machine.service";
import { IotMqttService } from "../../src/modules/iot/iot-mqtt.service";
import { PaymentsService } from "../../src/modules/payments/payments.service";
import { PAYMENT_GATEWAY } from "../../src/modules/payments/gateway/payment-gateway.interface";
import { WalletLedgerService } from "../../src/modules/wallets/wallet-ledger.service";
import { PromosService } from "../../src/modules/promos/promos.service";
import { PointService } from "../../src/modules/points/point.service";
import { MembershipTierService } from "../../src/modules/memberships/membership-tier.service";
import { B2BPartnerService } from "../../src/modules/partners/b2b-partner.service";
import { CampaignService } from "../../src/modules/campaigns/campaign.service";
import { LoyaltyConfigService } from "../../src/modules/loyalty-config/loyalty-config.service";
import { TransactionService } from "../../src/modules/transactions/transaction.service";
import { PricingService } from "../../src/modules/pricing/pricing.service";
import { VoucherService } from "../../src/modules/vouchers/voucher.service";
import {
  createCustomer,
  createMachine,
  createOutlet,
  createServiceWithPrice,
  inMinutes,
  resetDb,
} from "./helpers";

const JWT_SECRET = "integration-test-secret";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

describe("Batch 1.5 — kiosk, autentikasi perangkat, aktivasi (PostgreSQL nyata)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payments: PaymentsService;
  let iotMachine: IotMachineService;
  let jwt: JwtService;

  const mqtt = { publishCommand: jest.fn(), eventHandler: undefined as any };
  let chargeSeq = 0;
  const gateway = {
    name: "mock",
    createCharge: jest.fn(async () => ({
      externalId: `ext-k-${++chargeSeq}`,
      qrString: "https://qr.test/k",
      expiresAt: inMinutes(15),
    })),
  };
  const pricingCalc = {
    calculate: jest.fn(async (input: any) => ({
      echo: input,
      finalAmount: 10000,
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
      controllers: [KiosksController, PricingController, OrdersController, OrderCreateController],
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
        KiosksService,
        OrdersService,
        BookingsService,
        IotService,
        IotMachineService,
        PaymentsService,
        WalletLedgerService,
        TransactionService,
        { provide: PricingCalculationService, useValue: pricingCalc },
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
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    // Batch 4 (akar flaky): server mendengarkan SEKALI. Tanpa ini supertest
    // memanggil listen(0) per request lalu server.close() saat request itu selesai
    // — request paralel lain pada server yang sama kena ECONNRESET/socket hang up.
    // Bind eksplisit 127.0.0.1: listen wildcard (::) bisa "dibayangi" proses lain
    // yang bind 127.0.0.1 pada port sama (macOS/SO_REUSEADDR) → request nyasar (404).
    await app.listen(0, "127.0.0.1");
    prisma = moduleRef.get(PrismaService);
    payments = moduleRef.get(PaymentsService);
    iotMachine = moduleRef.get(IotMachineService);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Fixture per test ──────────────────────────────────────────────────────
  let outlet: any, outletB: any, machine: any, machineB: any, service: any;
  let kioskToken: string, kioskBToken: string, kiosk: any;

  async function enrollKiosk(outletId: string, code: string) {
    const token = randomBytes(32).toString("hex");
    const k = await prisma.kiosk.create({
      data: {
        outletId,
        kioskCode: code,
        name: code,
        deviceTokenHash: sha(token),
        deviceId: `dev-${code}`,
        enrolledAt: new Date(),
      },
    });
    return { token, kiosk: k };
  }

  beforeEach(async () => {
    await resetDb(prisma);
    mqtt.publishCommand.mockClear();
    pricingCalc.calculate.mockClear();
    outlet = await createOutlet(prisma, "A");
    outletB = await createOutlet(prisma, "B");
    machine = await createMachine(prisma, outlet.id);
    machineB = await createMachine(prisma, outletB.id);
    service = await createServiceWithPrice(prisma, outlet.id, 10000);
    ({ token: kioskToken, kiosk } = await enrollKiosk(outlet.id, "KSK-A"));
    ({ token: kioskBToken } = await enrollKiosk(outlet.id, "KSK-A2"));
  });

  const http = () => request(app.getHttpServer());
  const asKiosk = (t: string) => ({ Authorization: `Bearer ${t}` });
  const asUser = (userId: string, role: UserRole) => ({
    Authorization: `Bearer ${jwt.sign({ sub: userId, email: "x@uji.test", role })}`,
  });
  const startCommands = () =>
    prisma.iotCommand.count({ where: { command: START_MACHINE } });
  const kioskOrderBody = (extra: Record<string, unknown> = {}) => ({
    outletId: outlet.id,
    sourcePlatform: "KIOSK",
    items: [{ serviceId: service.id, quantity: 1 }],
    deviceId: machine.id,
    ...extra,
  });
  async function kioskOrder(
    token = kioskToken,
    extra: Record<string, unknown> = {},
  ) {
    const res = await http()
      .post("/kiosks/device/orders")
      .set(asKiosk(token))
      .send(kioskOrderBody(extra));
    return res;
  }
  async function payViaWebhook(orderId: string, token = kioskToken) {
    const pay = await http()
      .post("/kiosks/device/payments")
      .set(asKiosk(token))
      .send({ orderId, method: "QRIS" })
      .expect(201);
    const row = await prisma.payment.findUniqueOrThrow({
      where: { paymentNumber: pay.body.paymentNumber },
    });
    await payments.handleWebhook({
      externalId: row.externalId!,
      status: "PAID",
    } as any);
    return pay.body;
  }

  // ── #1 /pricing/calculate dengan autentikasi perangkat ─────────────────
  describe("#1 /pricing/calculate", () => {
    const body = () => ({
      outletId: outletB.id, // dicoba outlet lain → harus diabaikan untuk kiosk
      sourcePlatform: "MOBILE_APP",
      customerId: "customer-orang-lain",
      items: [{ serviceId: service.id, quantity: 1, machineType: "WASHER" }],
    });

    it("token kiosk valid → 201 (dulu 401); outlet & identitas dipaksa dari kiosk", async () => {
      await http()
        .post("/pricing/calculate")
        .set(asKiosk(kioskToken))
        .send(body())
        .expect(201);
      const input = pricingCalc.calculate.mock.calls[0][0];
      expect(input.outletId).toBe(outlet.id);
      expect(input.customerId).toBeUndefined();
      expect(input.partnerId).toBeUndefined();
      expect(input.sourcePlatform).toBe("KIOSK");
    });

    it("token kiosk dicabut / tak dikenal / kiosk nonaktif / tanpa token → 401", async () => {
      await prisma.kiosk.update({
        where: { id: kiosk.id },
        data: { tokenRevokedAt: new Date() },
      });
      await http()
        .post("/pricing/calculate")
        .set(asKiosk(kioskToken))
        .send(body())
        .expect(401);
      await http()
        .post("/pricing/calculate")
        .set(asKiosk("a".repeat(64)))
        .send(body())
        .expect(401);
      await prisma.kiosk.updateMany({
        where: { kioskCode: "KSK-A2" },
        data: { status: "INACTIVE" },
      });
      await http()
        .post("/pricing/calculate")
        .set(asKiosk(kioskBToken))
        .send(body())
        .expect(401);
      await http().post("/pricing/calculate").send(body()).expect(401);
      expect(pricingCalc.calculate).not.toHaveBeenCalled();
    });

    it("JWT customer asli tetap jalan & dipaksa atas nama sendiri; JWT palsu → 401", async () => {
      const c = await createCustomer(prisma);
      await http()
        .post("/pricing/calculate")
        .set(asUser(c.user.id, UserRole.CUSTOMER))
        .send({ ...body(), customerId: undefined, outletId: outlet.id })
        .expect(201);
      expect(pricingCalc.calculate.mock.calls[0][0].customerId).toBe(
        c.customer.id,
      );
      await http()
        .post("/pricing/calculate")
        .set(asUser(c.user.id, UserRole.CUSTOMER))
        .send(body())
        .expect(403); // customer lain
      const forged = new JwtService({ secret: "salah" }).sign({
        sub: c.user.id,
        role: "SUPER_ADMIN",
      });
      await http()
        .post("/pricing/calculate")
        .set({ Authorization: `Bearer ${forged}` })
        .send(body())
        .expect(401);
    });

    it("token kiosk TIDAK diterima di rute JWT lain (mis. GET /orders, POST /orders)", async () => {
      await http().get("/orders").set(asKiosk(kioskToken)).expect(401);
      await http()
        .post("/orders")
        .set(asKiosk(kioskToken))
        .send(kioskOrderBody())
        .expect(401);
    });
  });

  // ── #2 order kiosk terikat mesin ─────────────────────────────────────────
  describe("#2 order kiosk ↔ booking mesin", () => {
    it("order tanpa mesin (kiosk versi lama) ditolak SEBELUM bayar — tanpa order", async () => {
      const res = await http()
        .post("/kiosks/device/orders")
        .set(asKiosk(kioskToken))
        .send({
          ...kioskOrderBody(),
          deviceId: undefined,
          notes: "Mesin X (M-1)",
        })
        .expect(400);
      expect(res.body.message).toMatch(/Pilih mesin/);
      expect(await prisma.order.count()).toBe(0);
    });

    it("order tamu + booking HOLD (tanpa customer) terikat order, kiosk & mesin; jadwal dari klien diabaikan", async () => {
      const res = await kioskOrder(kioskToken, {
        scheduledAt: inMinutes(600).toISOString(),
      }).then((r) => r);
      expect(res.status).toBe(201);
      const b = await prisma.machineBooking.findUniqueOrThrow({
        where: { orderId: res.body.id },
        include: { order: true },
      });
      expect(b.status).toBe(BookingStatus.HOLD);
      expect(b.customerId).toBeNull();
      expect(b.deviceId).toBe(machine.id);
      expect(b.scheduledAt).toBeNull();
      expect(b.order?.kioskId).toBe(kiosk.id);
      expect(b.order?.sourcePlatform).toBe("KIOSK");
    });

    it("mesin outlet lain → 400; mesin sedang di-HOLD/dipesan → 409 tanpa order yatim", async () => {
      await kioskOrder(kioskToken, { deviceId: machineB.id }).then((r) =>
        expect(r.status).toBe(400),
      );
      await kioskOrder().then((r) => expect(r.status).toBe(201));
      await kioskOrder(kioskBToken).then((r) => expect(r.status).toBe(409));
      expect(await prisma.order.count()).toBe(1);
    });

    it("konkurensi: 8 kiosk/tamu paralel pada mesin sama → tepat 1 sukses", async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          kioskOrder(i % 2 ? kioskBToken : kioskToken),
        ),
      );
      const codes = results.map((r) => r.status).sort();
      expect(codes.filter((c) => c === 201)).toHaveLength(1);
      expect(codes.filter((c) => c === 409)).toHaveLength(7);
      expect(
        await prisma.machineBooking.count({
          where: { status: BookingStatus.HOLD },
        }),
      ).toBe(1);
    });

    it("booking mobile yang sudah dibayar memblokir kiosk (lintas kanal)", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const mobileOrder = await http()
        .post("/orders")
        .set(asUser(c.user.id, UserRole.CUSTOMER))
        .send({ ...kioskOrderBody(), sourcePlatform: "MOBILE_APP" })
        .expect(201);
      await payments.payOrderWithWallet(c.user.id, mobileOrder.body.id);
      await kioskOrder().then((r) => expect(r.status).toBe(409));
    });
  });

  // ── #3 aktivasi mesin setelah bayar ──────────────────────────────────────
  describe("#3 aktivasi mesin order kiosk", () => {
    it("sebelum bayar: tidak ada START; retry ditolak; status bound=false", async () => {
      const o = (await kioskOrder()).body;
      await http()
        .post(`/kiosks/device/orders/${o.id}/machine-start`)
        .set(asKiosk(kioskToken))
        .expect(400);
      const st = await http()
        .get(`/kiosks/device/orders/${o.id}/machine-status`)
        .set(asKiosk(kioskToken))
        .expect(200);
      expect(st.body.bound).toBe(false);
      expect(await startCommands()).toBe(0);
    });

    it("QRIS + webhook PAID → RESERVED → START tepat sekali; webhook ganda tidak menggandakan", async () => {
      const o = (await kioskOrder()).body;
      const pay = await payViaWebhook(o.id);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.PAID);
      const b = await prisma.machineBooking.findUniqueOrThrow({
        where: { orderId: o.id },
      });
      expect(b.status).toBe(BookingStatus.RESERVED);
      expect(await startCommands()).toBe(1);
      expect(mqtt.publishCommand).toHaveBeenCalledTimes(1);
      expect(mqtt.publishCommand.mock.calls[0][0]).toBe(machine.deviceCode);

      const row = await prisma.payment.findUniqueOrThrow({
        where: { paymentNumber: pay.paymentNumber },
      });
      await payments.handleWebhook({
        externalId: row.externalId!,
        status: "PAID",
      } as any);
      await Promise.all(
        Array.from({ length: 5 }, () =>
          http()
            .post(`/kiosks/device/orders/${o.id}/machine-start`)
            .set(asKiosk(kioskToken)),
        ),
      );
      expect(await startCommands()).toBe(1);
      expect(mqtt.publishCommand).toHaveBeenCalledTimes(1);

      const st = await http()
        .get(`/kiosks/device/orders/${o.id}/machine-status`)
        .set(asKiosk(kioskToken))
        .expect(200);
      expect(st.body).toMatchObject({
        bound: true,
        deviceCode: machine.deviceCode,
        commandStatus: "PUBLISHED",
      });
    });

    it("event RUNNING → IN_USE; START FAILED → retry kiosk membuat percobaan ke-2 (≤3)", async () => {
      const o = (await kioskOrder()).body;
      await payViaWebhook(o.id);
      const cmd = await prisma.iotCommand.findFirstOrThrow({
        where: { orderId: o.id },
      });
      await iotMachine.handleDeviceEvent({
        deviceCode: machine.deviceCode,
        eventType: "FAILED",
        commandId: cmd.id,
      } as any);
      await http()
        .post(`/kiosks/device/orders/${o.id}/machine-start`)
        .set(asKiosk(kioskToken))
        .expect(201);
      expect(await startCommands()).toBe(2);
      const cmd2 = await prisma.iotCommand.findFirstOrThrow({
        where: { orderId: o.id },
        orderBy: { createdAt: "desc" },
      });
      await iotMachine.handleDeviceEvent({
        deviceCode: machine.deviceCode,
        eventType: "RUNNING",
        commandId: cmd2.id,
      } as any);
      expect(
        (
          await prisma.machineBooking.findUniqueOrThrow({
            where: { orderId: o.id },
          })
        ).status,
      ).toBe(BookingStatus.IN_USE);
      await http()
        .post(`/kiosks/device/orders/${o.id}/machine-start`)
        .set(asKiosk(kioskToken))
        .expect(201);
      expect(await startCommands()).toBe(2);
    });

    it('order "PAID" tanpa Payment PAID (manipulasi data) → tidak START', async () => {
      const o = (await kioskOrder()).body;
      await prisma.order.update({
        where: { id: o.id },
        data: { status: OrderStatus.PAID },
      });
      await prisma.machineBooking.update({
        where: { orderId: o.id },
        data: { status: BookingStatus.RESERVED, expiresAt: inMinutes(30) },
      });
      await http()
        .post(`/kiosks/device/orders/${o.id}/machine-start`)
        .set(asKiosk(kioskToken))
        .expect(400);
      expect(await iotMachine.activateMachineForOrder(o.id)).toBeNull();
      expect(await startCommands()).toBe(0);
    });

    it("order mobile yang menyusupkan kioskId TIDAK menyala otomatis saat dibayar (tetap wajib scan)", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const res = await http()
        .post("/orders")
        .set(asUser(c.user.id, UserRole.CUSTOMER))
        .send({ ...kioskOrderBody(), kioskId: kiosk.id })
        .expect(201);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: res.body.id } }))
          .kioskId,
      ).toBeNull();
      await payments.payOrderWithWallet(c.user.id, res.body.id);
      expect(await startCommands()).toBe(0);
    });
  });

  // ── isolasi antar-kiosk ──────────────────────────────────────────────────
  it("kiosk lain tidak bisa melihat/membatalkan/menyalakan order & pembayaran kiosk ini", async () => {
    const o = (await kioskOrder()).body;
    const pay = await http()
      .post("/kiosks/device/payments")
      .set(asKiosk(kioskToken))
      .send({ orderId: o.id, method: "QRIS" })
      .expect(201);
    await http()
      .get(`/kiosks/device/payments/${pay.body.paymentNumber}/status`)
      .set(asKiosk(kioskBToken))
      .expect(404);
    await http()
      .post(`/kiosks/device/payments/${pay.body.paymentNumber}/simulate`)
      .set(asKiosk(kioskBToken))
      .expect(404);
    await http()
      .get(`/kiosks/device/orders/${o.id}/machine-status`)
      .set(asKiosk(kioskBToken))
      .expect(403);
    await http()
      .post(`/kiosks/device/orders/${o.id}/machine-start`)
      .set(asKiosk(kioskBToken))
      .expect(403);
    await http()
      .post(`/kiosks/device/orders/${o.id}/cancel`)
      .set(asKiosk(kioskBToken))
      .expect(403);
    await http()
      .post("/kiosks/device/payments")
      .set(asKiosk(kioskBToken))
      .send({ orderId: o.id, method: "QRIS" })
      .expect(403);
    await http()
      .get(`/kiosks/device/payments/${pay.body.paymentNumber}/status`)
      .set(asKiosk(kioskToken))
      .expect(200);
  });

  // ── pembatalan & pembayaran terlambat ────────────────────────────────────
  it("batal di kiosk → mesin dilepas; QRIS dibayar SETELAH batal → tercatat PAID, order tetap CANCELLED, tanpa START", async () => {
    const o = (await kioskOrder()).body;
    const pay = await http()
      .post("/kiosks/device/payments")
      .set(asKiosk(kioskToken))
      .send({ orderId: o.id, method: "QRIS" })
      .expect(201);
    await http()
      .post(`/kiosks/device/orders/${o.id}/cancel`)
      .set(asKiosk(kioskToken))
      .expect(201);
    expect(
      (
        await prisma.machineBooking.findUniqueOrThrow({
          where: { orderId: o.id },
        })
      ).status,
    ).toBe(BookingStatus.CANCELLED);
    await kioskOrder(kioskBToken).then((r) => expect(r.status).toBe(201)); // mesin bisa dipesan lagi

    const row = await prisma.payment.findUniqueOrThrow({
      where: { paymentNumber: pay.body.paymentNumber },
    });
    await payments.handleWebhook({
      externalId: row.externalId!,
      status: "PAID",
    } as any);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe(PaymentStatus.PAID);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
    ).toBe(OrderStatus.CANCELLED);
    const log = await prisma.orderStatusLog.findFirst({
      where: { orderId: o.id, notes: { contains: "PERLU REFUND MANUAL" } },
    });
    expect(log).not.toBeNull();
    expect(await startCommands()).toBe(0);
  });

  it("batal kiosk vs webhook PAID paralel → konsisten (PAID+START, atau CANCELLED tanpa START)", async () => {
    for (let i = 0; i < 5; i++) {
      await resetDbKeepFixtures();
      const o = (await kioskOrder()).body;
      const pay = await http()
        .post("/kiosks/device/payments")
        .set(asKiosk(kioskToken))
        .send({ orderId: o.id, method: "QRIS" })
        .expect(201);
      const row = await prisma.payment.findUniqueOrThrow({
        where: { paymentNumber: pay.body.paymentNumber },
      });
      await Promise.all([
        http()
          .post(`/kiosks/device/orders/${o.id}/cancel`)
          .set(asKiosk(kioskToken)),
        payments.handleWebhook({
          externalId: row.externalId!,
          status: "PAID",
        } as any),
      ]);
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: o.id },
      });
      const starts = await startCommands();
      if (order.status === OrderStatus.PAID) expect(starts).toBe(1);
      else {
        expect(order.status).toBe(OrderStatus.CANCELLED);
        expect(starts).toBe(0);
      }
    }
  });
  async function resetDbKeepFixtures() {
    await prisma.paymentReconciliation.deleteMany();
    await prisma.iotCommand.deleteMany();
    await prisma.machineBooking.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderStatusLog.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
  }

  // ── pembayaran saldo di kiosk (PIN) ──────────────────────────────────────
  describe("checkout saldo kiosk", () => {
    const PIN = "246810";
    async function memberWithPin(balance = 50000) {
      const c = await createCustomer(prisma, { balance });
      await prisma.customer.update({
        where: { id: c.customer.id },
        data: {
          walletPinHash: await bcrypt.hash(PIN, 4),
          pinSetAt: new Date(),
        },
      });
      return c;
    }
    const checkout = (
      lookup: string,
      extra: Record<string, unknown> = {},
      token = kioskToken,
    ) =>
      http()
        .post("/kiosks/device/checkout")
        .set(asKiosk(token))
        .send({
          customerLookup: lookup,
          items: [
            { serviceId: service.id, quantity: 1, machineType: "WASHER" },
          ],
          deviceId: machine.id,
          ...extra,
        });
    const balance = async (customerId: string) =>
      Number(
        (await prisma.wallet.findUniqueOrThrow({ where: { customerId } }))
          .balance,
      );

    it("tanpa PIN / PIN salah → ditolak, saldo utuh, tanpa order & tanpa booking", async () => {
      const c = await memberWithPin();
      await checkout(c.customer.memberCode!).expect(400);
      await checkout(c.customer.memberCode!, { pin: "000000" }).expect(400);
      expect(await balance(c.customer.id)).toBe(50000);
      expect(await prisma.order.count()).toBe(0);
      expect(await prisma.machineBooking.count()).toBe(0);
    });

    it("5× PIN salah → terkunci (PIN benar pun ditolak) — status 403, bukan 401", async () => {
      const c = await memberWithPin();
      for (let i = 0; i < 4; i++)
        await checkout(c.customer.memberCode!, { pin: "000000" }).expect(400);
      await checkout(c.customer.memberCode!, { pin: "000000" }).expect(403);
      await checkout(c.customer.memberCode!, { pin: PIN }).expect(403);
      expect(await balance(c.customer.id)).toBe(50000);
      await prisma.customer.update({
        where: { id: c.customer.id },
        data: { walletPinLockedUntil: inMinutes(-1) },
      });
      await checkout(c.customer.memberCode!, { pin: PIN }).expect(201);
    });

    it("PIN belum diatur → ditolak dengan pesan jelas", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const res = await checkout(c.customer.memberCode!, { pin: PIN }).expect(
        400,
      );
      expect(res.body.message).toMatch(/PIN wallet belum diatur/);
    });

    it("PIN benar → PAID + RESERVED + saldo terpotong sekali + START tepat sekali", async () => {
      const c = await memberWithPin();
      const res = await checkout(c.customer.memberCode!, { pin: PIN }).expect(
        201,
      );
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: res.body.orderId },
        include: { machineBooking: true },
      });
      expect(order.status).toBe(OrderStatus.PAID);
      expect(order.kioskId).toBe(kiosk.id);
      expect(order.machineBooking?.status).toBe(BookingStatus.RESERVED);
      expect(await balance(c.customer.id)).toBe(40000);
      expect(await startCommands()).toBe(1);
    });

    it("checkout saldo tanpa mesin (kiosk lama) / mesin terpakai → ditolak tanpa potongan saldo", async () => {
      const c = await memberWithPin();
      await checkout(c.customer.memberCode!, {
        pin: PIN,
        deviceId: undefined,
      }).expect(400);
      await kioskOrder(kioskBToken).then((r) => expect(r.status).toBe(201));
      await checkout(c.customer.memberCode!, { pin: PIN }).expect(409);
      expect(await balance(c.customer.id)).toBe(50000);
    });
  });
});
