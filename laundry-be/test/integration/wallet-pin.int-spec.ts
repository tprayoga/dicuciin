/**
 * Batch 4 (S5) — keamanan PIN wallet pada PostgreSQL NYATA via HTTP + JWT asli,
 * dengan TransformInterceptor global (redaksi kolom rahasia).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import * as request from "supertest";
import * as bcrypt from "bcrypt";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import { TransformInterceptor } from "../../src/common/interceptors/transform.interceptor";
import { JwtStrategy } from "../../src/modules/auth/jwt.strategy";
import { WalletsController } from "../../src/modules/wallets/wallets.controller";
import { WalletsService } from "../../src/modules/wallets/wallets.service";
import { PaymentsController } from "../../src/modules/payments/payments.controller";
import { LegacyWalletPayController } from "../../src/modules/payments/legacy-wallet-pay.controller";
import { PaymentsService } from "../../src/modules/payments/payments.service";
import { PAYMENT_GATEWAY } from "../../src/modules/payments/gateway/payment-gateway.interface";
import { WalletLedgerService } from "../../src/modules/wallets/wallet-ledger.service";
import { OrdersService } from "../../src/modules/orders/orders.service";
import { IotMachineService } from "../../src/modules/iot/iot-machine.service";
import { IotMqttService } from "../../src/modules/iot/iot-mqtt.service";
import { PromosService } from "../../src/modules/promos/promos.service";
import { PointService } from "../../src/modules/points/point.service";
import { MembershipTierService } from "../../src/modules/memberships/membership-tier.service";
import { B2BPartnerService } from "../../src/modules/partners/b2b-partner.service";
import { CampaignService } from "../../src/modules/campaigns/campaign.service";
import { LoyaltyConfigService } from "../../src/modules/loyalty-config/loyalty-config.service";
import {
  controllableGateway,
  createCustomer,
  createOutlet,
  createServiceWithPrice,
  resetDb,
} from "./helpers";

const JWT_SECRET = "integration-test-secret";
const PIN = "246810";

describe("Batch 4 — keamanan PIN wallet (PostgreSQL nyata)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: JWT_SECRET })],
      controllers: [
        WalletsController,
        PaymentsController,
        LegacyWalletPayController,
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
        WalletsService,
        PaymentsService,
        WalletLedgerService,
        OrdersService,
        IotMachineService,
        LoyaltyConfigService,
        { provide: IotMqttService, useValue: { publishCommand: jest.fn() } },
        { provide: PAYMENT_GATEWAY, useValue: controllableGateway() },
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
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    // Batch 4 (akar flaky): server mendengarkan SEKALI. Tanpa ini supertest
    // memanggil listen(0) per request lalu server.close() saat request itu selesai
    // — request paralel lain pada server yang sama kena ECONNRESET/socket hang up.
    // Bind eksplisit 127.0.0.1: listen wildcard (::) bisa "dibayangi" proses lain
    // yang bind 127.0.0.1 pada port sama (macOS/SO_REUSEADDR) → request nyasar (404).
    await app.listen(0, "127.0.0.1");
    prisma = moduleRef.get(PrismaService);
    orders = moduleRef.get(OrdersService);
    jwt = moduleRef.get(JwtService);
  });
  afterAll(() => app.close());

  let outlet: any, service: any;
  beforeEach(async () => {
    await resetDb(prisma);
    delete process.env.WALLET_PIN_PROOF_SECONDS;
    outlet = await createOutlet(prisma);
    service = await createServiceWithPrice(prisma, outlet.id, 10000);
  });

  const http = () => request(app.getHttpServer());
  // Satu access token per customer (sesi app); `session(c, n)` = sesi lain (login di HP lain).
  const tokens = new Map<string, string>();
  const session = (c: any, n = 1) => {
    const key = `${c.user.id}#${n}`;
    if (!tokens.has(key)) {
      tokens.set(
        key,
        jwt.sign({
          sub: c.user.id,
          email: "x@uji.test",
          role: UserRole.CUSTOMER,
          jti: key,
        }),
      );
    }
    return { Authorization: `Bearer ${tokens.get(key)}` };
  };
  const auth = (c: any) => session(c, 1);
  const withPin = async (balance = 50000) => {
    const c = await createCustomer(prisma, { balance });
    await prisma.customer.update({
      where: { id: c.customer.id },
      data: { walletPinHash: await bcrypt.hash(PIN, 4), pinSetAt: new Date() },
    });
    return c;
  };
  const verify = (c: any, pin: string) =>
    http().post("/wallets/me/pin/verify").set(auth(c)).send({ pin });
  const newOrder = async (c: any) =>
    (await orders.create(
      {
        customerId: c.customer.id,
        outletId: outlet.id,
        sourcePlatform: "MOBILE_APP",
        items: [{ serviceId: service.id, quantity: 1 }],
      } as any,
      c.user.id,
    )) as any;
  const balance = async (c: any) =>
    Number(
      (
        await prisma.wallet.findUniqueOrThrow({
          where: { customerId: c.customer.id },
        })
      ).balance,
    );

  describe("penguncian", () => {
    it("4× salah → 400; ke-5 → 403 terkunci; PIN benar pun ditolak; setelah kunci habis → berhasil & penghitung reset", async () => {
      const c = await withPin();
      for (let i = 0; i < 4; i++) await verify(c, "000000").expect(400);
      await verify(c, "000000").expect(403);
      await verify(c, PIN).expect(403);
      const status = await http()
        .get("/wallets/me/pin")
        .set(auth(c))
        .expect(200);
      expect(status.body.data.lockedUntil).toBeTruthy();
      await prisma.customer.update({
        where: { id: c.customer.id },
        data: { walletPinLockedUntil: new Date(Date.now() - 1000) },
      });
      await verify(c, PIN).expect(201);
      expect(
        (
          await prisma.customer.findUniqueOrThrow({
            where: { id: c.customer.id },
          })
        ).walletPinFailedAttempts,
      ).toBe(0);
    });

    it("KONKUREN: 20 tebakan salah paralel → maksimal 4 dievaluasi sebagai 'salah', sisanya terkunci", async () => {
      const c = await withPin();
      const res = await Promise.all(
        Array.from({ length: 20 }, () => verify(c, "000000")),
      );
      const codes = res.map((r) => r.status);
      expect(codes.filter((s) => s === 400)).toHaveLength(4);
      expect(codes.filter((s) => s === 403)).toHaveLength(16);
      const row = await prisma.customer.findUniqueOrThrow({
        where: { id: c.customer.id },
      });
      expect(row.walletPinLockedUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it("KONKUREN: PIN benar diselipkan di antara banjir tebakan salah → tidak lolos setelah terkunci", async () => {
      const c = await withPin();
      for (let i = 0; i < 4; i++) await verify(c, "000000").expect(400);
      const res = await Promise.all([
        ...Array.from({ length: 8 }, () => verify(c, "000000")),
        verify(c, PIN),
      ]);
      const codes = res.map((r) => r.status);
      // Diserialkan oleh kunci baris: tebakan salah ke-5 mengunci. PIN benar hanya
      // lolos bila dievaluasi SEBELUM penguncian (maksimal 1×), tidak pernah sesudahnya.
      expect(
        codes.filter((s) => s === 400).length +
          codes.filter((s) => s === 201).length,
      ).toBeLessThanOrEqual(1);
    });
  });

  describe("set / ganti PIN", () => {
    it("PIN pertama tanpa PIN lama; ganti wajib PIN lama yang benar; PIN lama tidak berlaku lagi", async () => {
      const c = await createCustomer(prisma);
      await http()
        .post("/wallets/me/pin")
        .set(auth(c))
        .send({ pin: PIN })
        .expect(201);
      await http()
        .post("/wallets/me/pin")
        .set(auth(c))
        .send({ pin: "111111" })
        .expect(400);
      await http()
        .post("/wallets/me/pin")
        .set(auth(c))
        .send({ pin: "111111", currentPin: "999999" })
        .expect(400);
      await http()
        .post("/wallets/me/pin")
        .set(auth(c))
        .send({ pin: "111111", currentPin: PIN })
        .expect(201);
      await verify(c, PIN).expect(400);
      await verify(c, "111111").expect(201);
    });

    it("rute lama /customer/:id/pin/set juga wajib PIN lama; customer lain → ditolak", async () => {
      const c = await withPin();
      const other = await withPin();
      await http()
        .post(`/wallets/customer/${c.customer.id}/pin/set`)
        .set(auth(c))
        .send({ pin: "111111" })
        .expect(400);
      await http()
        .post(`/wallets/customer/${c.customer.id}/pin/set`)
        .set(auth(other))
        .send({ pin: "111111", currentPin: PIN })
        .expect(401);
      await verify(c, PIN).expect(201);
    });

    it("tebakan PIN lama saat ganti PIN ikut terkena penguncian", async () => {
      const c = await withPin();
      for (let i = 0; i < 5; i++) {
        await http()
          .post("/wallets/me/pin")
          .set(auth(c))
          .send({ pin: "111111", currentPin: "000000" });
      }
      await http()
        .post("/wallets/me/pin")
        .set(auth(c))
        .send({ pin: "111111", currentPin: PIN })
        .expect(403);
    });
  });

  describe("debit saldo wajib PIN (server)", () => {
    it("/payments/wallet: tanpa PIN & tanpa bukti → 403; PIN salah → 400; PIN benar → lunas — saldo dipotong sekali", async () => {
      const c = await withPin();
      const o = await newOrder(c);
      await http()
        .post("/payments/wallet")
        .set(auth(c))
        .send({ orderId: o.id })
        .expect(403);
      await http()
        .post("/payments/wallet")
        .set(auth(c))
        .send({ orderId: o.id, pin: "000000" })
        .expect(400);
      expect(await balance(c)).toBe(50000);
      await http()
        .post("/payments/wallet")
        .set(auth(c))
        .send({ orderId: o.id, pin: PIN })
        .expect(201);
      expect(await balance(c)).toBe(40000);
    });

    it("bukti PIN (/pin/verify) sekali pakai & kedaluwarsa", async () => {
      const c = await withPin();
      const o1 = await newOrder(c);
      const o2 = await newOrder(c);
      await verify(c, PIN).expect(201);
      await http()
        .post("/payments/wallet")
        .set(auth(c))
        .send({ orderId: o1.id })
        .expect(201);
      await http()
        .post("/payments/wallet")
        .set(auth(c))
        .send({ orderId: o2.id })
        .expect(403);
      process.env.WALLET_PIN_PROOF_SECONDS = "1";
      await verify(c, PIN).expect(201);
      await new Promise((r) => setTimeout(r, 1300));
      await http()
        .post("/payments/wallet")
        .set(auth(c))
        .send({ orderId: o2.id })
        .expect(403);
      expect(await balance(c)).toBe(40000);
    });

    it("PIN terkunci → pembayaran dengan PIN benar pun ditolak", async () => {
      const c = await withPin();
      const o = await newOrder(c);
      for (let i = 0; i < 5; i++) await verify(c, "000000");
      await http()
        .post("/payments/wallet")
        .set(auth(c))
        .send({ orderId: o.id, pin: PIN })
        .expect(403);
      expect(await balance(c)).toBe(50000);
    });

    it("bukti PIN customer A tidak bisa dipakai membayar dengan saldo customer B", async () => {
      const a = await withPin();
      const b = await withPin();
      const ob = await newOrder(b);
      await verify(a, PIN).expect(201);
      await http()
        .post(`/wallets/customer/${b.customer.id}/pay`)
        .set(auth(a))
        .send({ orderId: ob.id })
        .expect(403);
      expect(await balance(b)).toBe(50000);
    });
  });

  describe("bukti PIN sekali pakai (kompatibilitas app lama)", () => {
    const pay = (c: any, orderId: string, hdr = auth(c)) =>
      http()
        .post(`/wallets/customer/${c.customer.id}/pay`)
        .set(hdr)
        .send({ orderId });

    it("terikat SESI: bukti dari sesi 1 tidak bisa dipakai sesi 2 (customer sama)", async () => {
      const c = await withPin();
      const o = await newOrder(c);
      await http()
        .post("/wallets/me/pin/verify")
        .set(session(c, 1))
        .send({ pin: PIN })
        .expect(201);
      await pay(c, o.id, session(c, 2)).expect(403);
      await pay(c, o.id, session(c, 1)).expect(201);
      expect(await balance(c)).toBe(40000);
    });

    it("terikat CUSTOMER: bukti customer A tidak mengotorisasi saldo B walau lewat rute B sendiri", async () => {
      const a = await withPin();
      const b = await withPin();
      const ob = await newOrder(b);
      await verify(a, PIN).expect(201);
      await pay(b, ob.id).expect(403); // B tidak punya bukti; bukti A tidak berlaku
      expect(await balance(b)).toBe(50000);
      expect(
        await prisma.walletPinProof.count({
          where: { customerId: a.customer.id, consumedAt: null },
        }),
      ).toBe(1);
    });

    it("tidak bisa diputar ulang & aman paralel: 1 bukti, 6 pembayaran paralel atas 6 order → tepat 1 debit", async () => {
      const c = await withPin(100000);
      const os = await Promise.all(
        Array.from({ length: 6 }, () => newOrder(c)),
      );
      await verify(c, PIN).expect(201);
      const res = await Promise.all(os.map((o) => pay(c, o.id)));
      expect(res.filter((r) => r.status === 201)).toHaveLength(1);
      expect(res.filter((r) => r.status === 403)).toHaveLength(5);
      expect(await balance(c)).toBe(90000);
      const proofs = await prisma.walletPinProof.findMany({
        where: { customerId: c.customer.id },
      });
      expect(proofs).toHaveLength(1);
      expect(proofs[0].consumedAt).not.toBeNull(); // tetap tersimpan untuk audit
    });

    it("kedaluwarsa singkat; terkunci & ganti PIN membatalkan bukti yang belum terpakai", async () => {
      process.env.WALLET_PIN_PROOF_SECONDS = "1";
      const c = await withPin();
      const o = await newOrder(c);
      await verify(c, PIN).expect(201);
      await new Promise((r) => setTimeout(r, 1300));
      await pay(c, o.id).expect(403);
      delete process.env.WALLET_PIN_PROOF_SECONDS;

      await verify(c, PIN).expect(201);
      for (let i = 0; i < 5; i++) await verify(c, "000000"); // terkunci
      await prisma.customer.update({
        where: { id: c.customer.id },
        data: { walletPinLockedUntil: new Date(Date.now() - 1000) },
      });
      await pay(c, o.id).expect(403); // bukti sebelum terkunci sudah dibatalkan

      await verify(c, PIN).expect(201);
      await http()
        .post("/wallets/me/pin")
        .set(auth(c))
        .send({ pin: "111111", currentPin: PIN })
        .expect(201);
      await pay(c, o.id).expect(403); // bukti sebelum ganti PIN dibatalkan
      expect(await balance(c)).toBe(50000);
    });

    it("selama terkunci, bukti yang (masih) ada tidak bisa dipakai", async () => {
      const c = await withPin();
      const o = await newOrder(c);
      await verify(c, PIN).expect(201);
      await prisma.customer.update({
        where: { id: c.customer.id },
        data: { walletPinLockedUntil: new Date(Date.now() + 60_000) },
      });
      await pay(c, o.id).expect(403);
      expect(await balance(c)).toBe(50000);
    });

    it("tanpa header sesi yang sama (token berbeda) bukti tidak ditemukan; DB hanya menyimpan hash sesi", async () => {
      const c = await withPin();
      await verify(c, PIN).expect(201);
      const proof = await prisma.walletPinProof.findFirstOrThrow({
        where: { customerId: c.customer.id },
      });
      expect(proof.sessionHash).toMatch(/^[0-9a-f]{64}$/);
      expect(proof.sessionHash).not.toContain(
        tokens.get(`${c.user.id}#1`)!.slice(0, 20),
      );
    });
  });

  it("tidak ada kebocoran: respons wallet/status PIN tidak memuat hash, penghitung, atau bukti PIN", async () => {
    const c = await withPin();
    await verify(c, "000000");
    const wallet = await http()
      .get(`/wallets/customer/${c.customer.id}`)
      .set(auth(c))
      .expect(200);
    const pin = await http().get("/wallets/me/pin").set(auth(c)).expect(200);
    for (const body of [
      JSON.stringify(wallet.body),
      JSON.stringify(pin.body),
    ]) {
      expect(body).not.toMatch(
        /walletPinHash|walletPinFailedAttempts|sessionHash|\$2[aby]\$/,
      );
    }
    expect(pin.body.data).toEqual({ hasPin: true, lockedUntil: null });
  });
});
