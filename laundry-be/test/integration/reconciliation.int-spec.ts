/**
 * Batch 2 — rekonsiliasi keuangan & alur refund via HTTP pada PostgreSQL NYATA
 * dengan JWT asli + RolesGuard asli. Gateway/MQTT tiruan.
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import * as request from "supertest";
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
import { OrdersService } from "../../src/modules/orders/orders.service";
import { PaymentsService } from "../../src/modules/payments/payments.service";
import { ReconciliationService } from "../../src/modules/payments/reconciliation.service";
import { ReconciliationController } from "../../src/modules/payments/reconciliation.controller";
import { WalletsController } from "../../src/modules/wallets/wallets.controller";
import { WalletsService } from "../../src/modules/wallets/wallets.service";
import { PAYMENT_GATEWAY } from "../../src/modules/payments/gateway/payment-gateway.interface";
import { IotMachineService } from "../../src/modules/iot/iot-machine.service";
import { IotMqttService } from "../../src/modules/iot/iot-mqtt.service";
import { WalletLedgerService } from "../../src/modules/wallets/wallet-ledger.service";
import { PromosService } from "../../src/modules/promos/promos.service";
import { PointService } from "../../src/modules/points/point.service";
import { MembershipTierService } from "../../src/modules/memberships/membership-tier.service";
import { B2BPartnerService } from "../../src/modules/partners/b2b-partner.service";
import { CampaignService } from "../../src/modules/campaigns/campaign.service";
import { LoyaltyConfigService } from "../../src/modules/loyalty-config/loyalty-config.service";
import {
  controllableGateway,
  createCustomer,
  createMachine,
  createOutlet,
  createServiceWithPrice,
  createUser,
  resetDb,
} from "./helpers";

const JWT_SECRET = "integration-test-secret";

describe("Batch 2 — rekonsiliasi & refund (PostgreSQL nyata, HTTP + JWT asli)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let jwt: JwtService;
  const gw = controllableGateway();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: JWT_SECRET })],
      controllers: [ReconciliationController, WalletsController],
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
        PaymentsService,
        ReconciliationService,
        WalletsService,
        IotMachineService,
        WalletLedgerService,
        { provide: IotMqttService, useValue: { publishCommand: jest.fn() } },
        { provide: PAYMENT_GATEWAY, useValue: gw },
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
    prisma = moduleRef.get(PrismaService);
    orders = moduleRef.get(OrdersService);
    payments = moduleRef.get(PaymentsService);
    jwt = moduleRef.get(JwtService);
  });
  afterAll(() => app.close());

  let outlet: any,
    outlet2: any,
    service: any,
    owner: any,
    superAdmin: any,
    adminOutlet: any,
    cashier: any,
    cashier2: any;
  beforeEach(async () => {
    await resetDb(prisma);
    gw.charges.clear();
    outlet = await createOutlet(prisma, "A");
    outlet2 = await createOutlet(prisma, "B");
    service = await createServiceWithPrice(prisma, outlet.id, 10000);
    owner = await createUser(prisma, UserRole.OWNER);
    superAdmin = await createUser(prisma, UserRole.SUPER_ADMIN);
    adminOutlet = await createUser(prisma, UserRole.ADMIN_OUTLET);
    cashier = await createUser(prisma, UserRole.CASHIER);
    cashier2 = await createUser(prisma, UserRole.CASHIER);
    await prisma.outletUser.createMany({
      data: [
        { userId: adminOutlet.id, outletId: outlet.id },
        { userId: cashier.id, outletId: outlet.id },
        { userId: cashier2.id, outletId: outlet2.id },
      ],
    });
  });

  const http = () => request(app.getHttpServer());
  const as = (u: { id: string; role: UserRole }) => ({
    Authorization: `Bearer ${jwt.sign({ sub: u.id, email: "x@uji.test", role: u.role })}`,
  });
  const asCust = (c: any) => as({ id: c.user.id, role: UserRole.CUSTOMER });
  const balance = async (customerId: string) =>
    Number(
      (await prisma.wallet.findUniqueOrThrow({ where: { customerId } }))
        .balance,
    );

  /** Order mesin yang sudah dibayar saldo (RESERVED, belum dipakai). */
  async function paidMachineOrder(balanceStart = 50000) {
    const c = await createCustomer(prisma, { balance: balanceStart });
    const m = await createMachine(prisma, outlet.id);
    const o: any = await orders.create(
      {
        customerId: c.customer.id,
        outletId: outlet.id,
        sourcePlatform: "MOBILE_APP",
        items: [{ serviceId: service.id, quantity: 1 }],
        deviceId: m.id,
      } as any,
      c.user.id,
    );
    await payments.payOrderWithWallet(c.user.id, o.id);
    return { c, m, o };
  }
  /** Order lunas via saldo + QR lama yang tetap dibayar → DUPLICATE_PAYMENT. */
  async function duplicateCase() {
    const c = await createCustomer(prisma, { balance: 50000 });
    const o: any = await orders.create(
      {
        customerId: c.customer.id,
        outletId: outlet.id,
        sourcePlatform: "MOBILE_APP",
        items: [{ serviceId: service.id, quantity: 1 }],
      } as any,
      c.user.id,
    );
    const p: any = await payments.createGatewayPayment(c.user.id, {
      orderId: o.id,
      method: "QRIS",
    } as any);
    await payments.payOrderWithWallet(c.user.id, o.id);
    const row = await prisma.payment.findUniqueOrThrow({
      where: { paymentNumber: p.paymentNumber },
    });
    await payments.handleWebhook({
      externalId: row.externalId!,
      status: "PAID",
    } as any);
    const rec = await prisma.paymentReconciliation.findFirstOrThrow({
      where: { orderId: o.id },
    });
    return { c, o, rec, row };
  }
  const review = (id: string, u: any, decision = "APPROVE") =>
    http()
      .post(`/payments/reconciliations/${id}/review`)
      .set(as(u))
      .send({ decision, note: "ditinjau admin" });
  const execute = (
    id: string,
    u: any,
    body: any = { method: "WALLET_CREDIT" },
  ) =>
    http()
      .post(`/payments/reconciliations/${id}/execute`)
      .set(as(u))
      .send(body);

  describe("permintaan refund customer", () => {
    it("customer mengajukan untuk order lunas miliknya; ganda 409; orang lain 403; belum bayar 400", async () => {
      const { c, o } = await paidMachineOrder();
      const other = await createCustomer(prisma);
      const res = await http()
        .post("/payments/refund-requests")
        .set(asCust(c))
        .send({ orderId: o.id, reason: "mesin tidak bisa dipakai" })
        .expect(201);
      expect(res.body).toMatchObject({
        status: "REQUESTED",
        reason: "CUSTOMER_REQUEST",
        refundAmount: 10000,
      });
      await http()
        .post("/payments/refund-requests")
        .set(asCust(c))
        .send({ orderId: o.id, reason: "ulang lagi ya" })
        .expect(409);
      await http()
        .post("/payments/refund-requests")
        .set(asCust(other))
        .send({ orderId: o.id, reason: "bukan punya saya" })
        .expect(403);
      const unpaid: any = await orders.create(
        {
          customerId: other.customer.id,
          outletId: outlet.id,
          sourcePlatform: "MOBILE_APP",
          items: [{ serviceId: service.id, quantity: 1 }],
        } as any,
        other.user.id,
      );
      await http()
        .post("/payments/refund-requests")
        .set(asCust(other))
        .send({ orderId: unpaid.id, reason: "belum bayar kok" })
        .expect(400);
      const mine = await http()
        .get("/payments/refund-requests/mine")
        .set(asCust(c))
        .expect(200);
      expect(mine.body).toHaveLength(1);
      expect(await balance(c.customer.id)).toBe(40000); // pengajuan tidak memindahkan uang
    });

    it("customer TIDAK bisa melihat daftar admin, menyetujui, atau mengeksekusi", async () => {
      const { c, o } = await paidMachineOrder();
      const r = await http()
        .post("/payments/refund-requests")
        .set(asCust(c))
        .send({ orderId: o.id, reason: "mohon refund" })
        .expect(201);
      await http().get("/payments/reconciliations").set(asCust(c)).expect(403);
      await review(r.body.id, {
        id: c.user.id,
        role: UserRole.CUSTOMER,
      }).expect(403);
      await execute(r.body.id, {
        id: c.user.id,
        role: UserRole.CUSTOMER,
      }).expect(403);
    });
  });

  describe("otorisasi admin", () => {
    it("admin outlet hanya melihat outlet sendiri; kasir tidak melihat data keuangan; keduanya TIDAK bisa menyetujui/eksekusi", async () => {
      const { rec } = await duplicateCase();
      const adminOutlet2 = await createUser(prisma, UserRole.ADMIN_OUTLET);
      await prisma.outletUser.create({
        data: { userId: adminOutlet2.id, outletId: outlet2.id },
      });
      const l1 = await http()
        .get("/payments/reconciliations")
        .set(as(adminOutlet))
        .expect(200);
      expect(l1.body.map((x: any) => x.id)).toEqual([rec.id]);
      const l2 = await http()
        .get("/payments/reconciliations")
        .set(as(adminOutlet2))
        .expect(200);
      expect(l2.body).toHaveLength(0);
      await http()
        .get(`/payments/reconciliations?outletId=${outlet.id}`)
        .set(as(adminOutlet2))
        .expect(403);
      await http()
        .get("/payments/reconciliations")
        .set(as(cashier))
        .expect(403);
      const all = await http()
        .get("/payments/reconciliations")
        .set(as(owner))
        .expect(200);
      expect(all.body).toHaveLength(1);
      void cashier2;
      await review(rec.id, cashier).expect(403);
      await review(rec.id, adminOutlet).expect(403);
      await execute(rec.id, adminOutlet).expect(403);
      expect(
        (
          await prisma.paymentReconciliation.findUniqueOrThrow({
            where: { id: rec.id },
          })
        ).status,
      ).toBe("OPEN");
    });

    it("eksekusi tanpa persetujuan → 409; ditolak → tidak bisa dieksekusi", async () => {
      const { rec } = await duplicateCase();
      await execute(rec.id, owner).expect(409);
      await review(rec.id, owner, "REJECT").expect(201);
      await execute(rec.id, owner).expect(409);
      await review(rec.id, owner).expect(409); // tidak bisa ditinjau ulang
    });
  });

  describe("eksekusi refund", () => {
    it("DUPLICATE_PAYMENT → kredit saldo sebesar dana ganda; order tetap PAID; pembayaran ganda REFUNDED; jejak audit", async () => {
      const { c, o, rec, row } = await duplicateCase();
      expect(await balance(c.customer.id)).toBe(40000);
      await review(rec.id, owner).expect(201);
      const res = await execute(rec.id, superAdmin).expect(201);
      expect(res.body).toMatchObject({
        status: "REFUNDED",
        refundMethod: "WALLET_CREDIT",
      });
      expect(await balance(c.customer.id)).toBe(50000);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.PAID);
      expect(
        (await prisma.payment.findUniqueOrThrow({ where: { id: row.id } }))
          .status,
      ).toBe(PaymentStatus.REFUNDED);
      const hist = await http()
        .get(`/payments/reconciliations/${rec.id}/history`)
        .set(as(owner))
        .expect(200);
      expect(hist.body.map((h: any) => h.action)).toEqual([
        "RECONCILIATION_CREATED",
        "RECONCILIATION_APPROVE",
        "RECONCILIATION_EXECUTED",
      ]);
    });

    it("5 eksekusi paralel → tepat satu berhasil, saldo dikredit sekali", async () => {
      const { c, rec } = await duplicateCase();
      await review(rec.id, owner).expect(201);
      const res = await Promise.all(
        Array.from({ length: 5 }, () => execute(rec.id, owner)),
      );
      expect(res.filter((r) => r.status === 201)).toHaveLength(1);
      expect(res.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await balance(c.customer.id)).toBe(50000);
      expect(
        await prisma.walletLedger.count({ where: { referenceType: "REFUND" } }),
      ).toBe(1);
    });

    it("permintaan customer disetujui → order REFUNDED, saldo kembali, booking dilepas (mesin tak bisa dinyalakan)", async () => {
      const { c, o, m } = await paidMachineOrder();
      const r = await http()
        .post("/payments/refund-requests")
        .set(asCust(c))
        .send({ orderId: o.id, reason: "batal datang" })
        .expect(201);
      await review(r.body.id, owner).expect(201);
      await execute(r.body.id, owner).expect(201);
      expect(await balance(c.customer.id)).toBe(50000);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.REFUNDED);
      expect(
        (
          await prisma.machineBooking.findUniqueOrThrow({
            where: { orderId: o.id },
          })
        ).status,
      ).toBe(BookingStatus.CANCELLED);
      expect(m).toBeTruthy();
    });

    it("refund admin langsung lalu eksekusi permintaan yang sama → tidak ada kredit ganda", async () => {
      const { c, o } = await paidMachineOrder();
      const r = await http()
        .post("/payments/refund-requests")
        .set(asCust(c))
        .send({ orderId: o.id, reason: "refund dong" })
        .expect(201);
      await review(r.body.id, owner).expect(201);
      await http()
        .post(`/wallets/orders/${o.id}/refund`)
        .set(as(owner))
        .send({ description: "refund langsung" })
        .expect(201);
      expect(
        (
          await prisma.paymentReconciliation.findUniqueOrThrow({
            where: { id: r.body.id },
          })
        ).status,
      ).toBe("REFUNDED");
      await execute(r.body.id, owner).expect(409);
      expect(await balance(c.customer.id)).toBe(50000);
    });

    it("EXTERNAL wajib referensi; dengan referensi → dicatat tanpa mengubah saldo", async () => {
      const { c, rec } = await duplicateCase();
      await review(rec.id, owner).expect(201);
      await execute(rec.id, owner, { method: "EXTERNAL" }).expect(400);
      const res = await execute(rec.id, owner, {
        method: "EXTERNAL",
        reference: "MIDTRANS-REFUND-123",
      }).expect(201);
      expect(res.body).toMatchObject({
        status: "REFUNDED",
        executionRef: "MIDTRANS-REFUND-123",
      });
      expect(await balance(c.customer.id)).toBe(40000);
    });

    it("mesin sedang dipakai → refund order ditolak", async () => {
      const { c, o } = await paidMachineOrder();
      await prisma.machineBooking.update({
        where: { orderId: o.id },
        data: { status: "IN_USE", startedAt: new Date() },
      });
      const r = await http()
        .post("/payments/refund-requests")
        .set(asCust(c))
        .send({ orderId: o.id, reason: "mesin rusak" })
        .expect(201);
      await review(r.body.id, owner).expect(201);
      await execute(r.body.id, owner).expect(409);
      await http()
        .post(`/wallets/orders/${o.id}/refund`)
        .set(as(owner))
        .send({ description: "refund mesin rusak" })
        .expect(409);
      expect(await balance(c.customer.id)).toBe(40000);
    });

    it("customer tidak bisa top-up saldo langsung (tanpa pembayaran terverifikasi)", async () => {
      const c = await createCustomer(prisma);
      await http()
        .post(`/wallets/customer/${c.customer.id}/topup`)
        .set(asCust(c))
        .send({ amount: 100000 })
        .expect(403);
      expect(await balance(c.customer.id)).toBe(0);
    });
  });
});
