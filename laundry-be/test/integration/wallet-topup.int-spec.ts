/**
 * Batch 4 — top-up saldo Midtrans (QRIS/VA) pada PostgreSQL NYATA via HTTP + JWT asli.
 *
 * Gateway = TIRUAN terkendali (status tagihan per nomor; webhook "terverifikasi"
 * tiruan lewat POST /payments/midtrans/webhook). Ini BUKAN uji Midtrans sandbox
 * dan BUKAN uji signature Midtrans (signature diuji di unit adaptor).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import * as request from "supertest";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import { JwtStrategy } from "../../src/modules/auth/jwt.strategy";
import { PaymentsController } from "../../src/modules/payments/payments.controller";
import { PaymentsService } from "../../src/modules/payments/payments.service";
import { WalletTopupController } from "../../src/modules/payments/wallet-topup.controller";
import { WalletTopupService } from "../../src/modules/payments/wallet-topup.service";
import { ReconciliationController } from "../../src/modules/payments/reconciliation.controller";
import { ReconciliationService } from "../../src/modules/payments/reconciliation.service";
import { PAYMENT_GATEWAY } from "../../src/modules/payments/gateway/payment-gateway.interface";
import { WalletLedgerService } from "../../src/modules/wallets/wallet-ledger.service";
import { CampaignService } from "../../src/modules/campaigns/campaign.service";
import { VoucherService } from "../../src/modules/vouchers/voucher.service";
import { IotMachineService } from "../../src/modules/iot/iot-machine.service";
import { IotMqttService } from "../../src/modules/iot/iot-mqtt.service";
import { PromosService } from "../../src/modules/promos/promos.service";
import { PointService } from "../../src/modules/points/point.service";
import { MembershipTierService } from "../../src/modules/memberships/membership-tier.service";
import { B2BPartnerService } from "../../src/modules/partners/b2b-partner.service";
import { LoyaltyConfigService } from "../../src/modules/loyalty-config/loyalty-config.service";
import { OrdersService } from "../../src/modules/orders/orders.service";
import { BookingMaintenanceService } from "../../src/modules/operations/booking-maintenance.service";
import {
  controllableGateway,
  createCustomer,
  createUser,
  inMinutes,
  resetDb,
} from "./helpers";

const JWT_SECRET = "integration-test-secret";

describe("Batch 4 — top-up saldo Midtrans (PostgreSQL nyata, gateway tiruan)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let jobs: BookingMaintenanceService;
  const gw = controllableGateway();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: JWT_SECRET })],
      controllers: [
        WalletTopupController,
        PaymentsController,
        ReconciliationController,
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
        PaymentsService,
        ReconciliationService,
        WalletTopupService,
        WalletLedgerService,
        CampaignService,
        VoucherService,
        IotMachineService,
        OrdersService,
        BookingMaintenanceService,
        LoyaltyConfigService,
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
    jwt = moduleRef.get(JwtService);
    jobs = moduleRef.get(BookingMaintenanceService);
  });
  afterAll(() => app.close());

  beforeEach(async () => {
    await resetDb(prisma);
    gw.charges.clear();
    gw.cancelCharge.mockClear();
    gw.createCharge.mockClear();
    delete process.env.TOPUP_ADMIN_FEE;
  });

  const http = () => request(app.getHttpServer());
  const auth = (userId: string, role: UserRole = UserRole.CUSTOMER) => ({
    Authorization: `Bearer ${jwt.sign({ sub: userId, email: "x@uji.test", role })}`,
  });
  const topup = (c: any, body: Record<string, unknown>) =>
    http().post("/wallets/me/topup").set(auth(c.user.id)).send(body);
  const balance = async (customerId: string) =>
    Number(
      (await prisma.wallet.findUniqueOrThrow({ where: { customerId } }))
        .balance,
    );
  /** Webhook Midtrans "terverifikasi" untuk top-up (signature dianggap sah oleh gateway tiruan). */
  const webhook = (
    t: { topupNumber: string; amount: number },
    status = "PAID",
    gross?: number,
  ) =>
    http()
      .post("/payments/midtrans/webhook")
      .send({
        order_id: t.topupNumber,
        status,
        gross_amount: String(gross ?? t.amount),
        transaction_id: `ext-${t.topupNumber}`,
      });
  /** Ledger (kredit − debit) harus sama dengan saldo MAIN. */
  const ledgerMatchesBalance = async (customerId: string) => {
    const w = await prisma.wallet.findUniqueOrThrow({ where: { customerId } });
    const rows = await prisma.walletLedger.findMany({
      where: { walletId: w.id, walletType: "MAIN_BALANCE" },
    });
    const net = rows.reduce(
      (s, r) => s + (r.direction === "CREDIT" ? 1 : -1) * Number(r.amount),
      0,
    );
    return net === Number(w.balance);
  };

  describe("pelunasan", () => {
    it("QRIS: tagihan dibuat, saldo TIDAK bertambah sampai webhook PAID terverifikasi; lalu tepat sekali", async () => {
      const c = await createCustomer(prisma);
      const res = await topup(c, { amount: 50000, method: "QRIS" }).expect(201);
      expect(res.body).toMatchObject({
        status: "PENDING",
        method: "QRIS",
        amount: 50000,
        creditAmount: 50000,
      });
      expect(res.body.topupNumber).toMatch(/^TOP-\d{8}-\d{6}$/);
      expect(res.body.qrString).toBeTruthy();
      expect(res.body.secondsRemaining).toBeGreaterThan(800);
      expect(await balance(c.customer.id)).toBe(0);
      await webhook(res.body).expect(200);
      expect(await balance(c.customer.id)).toBe(50000);
      const t = await prisma.walletTopup.findUniqueOrThrow({
        where: { topupNumber: res.body.topupNumber },
      });
      expect(t.status).toBe("PAID");
      expect(t.ledgerId).toBeTruthy();
      expect(
        await prisma.walletLedger.count({
          where: { referenceType: "TOPUP", referenceId: t.id },
        }),
      ).toBe(1);
      expect(await ledgerMatchesBalance(c.customer.id)).toBe(true);
    });

    it("VA BCA: nomor VA, lunas lewat webhook", async () => {
      const c = await createCustomer(prisma);
      const res = await topup(c, {
        amount: 100000,
        method: "VA",
        bank: "BCA",
      }).expect(201);
      expect(res.body).toMatchObject({ method: "TRANSFER", bank: "BCA" });
      expect(res.body.vaNumber).toBeTruthy();
      await webhook(res.body).expect(200);
      expect(await balance(c.customer.id)).toBe(100000);
    });

    it("webhook PAID ganda (6 paralel) → saldo bertambah SEKALI, satu ledger", async () => {
      const c = await createCustomer(prisma);
      const res = await topup(c, { amount: 20000, method: "QRIS" }).expect(201);
      await Promise.all(Array.from({ length: 6 }, () => webhook(res.body)));
      expect(await balance(c.customer.id)).toBe(20000);
      expect(
        await prisma.walletLedger.count({ where: { referenceType: "TOPUP" } }),
      ).toBe(1);
      expect(await ledgerMatchesBalance(c.customer.id)).toBe(true);
      // Batch 6 (R1): satu notifikasi TOPUP_PAID walau webhook datang 6×.
      const notes = await prisma.notification.findMany({ where: { userId: c.user.id } });
      expect(notes.map((n) => n.type)).toEqual(["TOPUP_PAID"]);
    });

    it("nominal webhook berbeda → ditolak, tidak ada kredit", async () => {
      const c = await createCustomer(prisma);
      const res = await topup(c, { amount: 20000, method: "QRIS" }).expect(201);
      await webhook(res.body, "PAID", 2_000_000).expect(400);
      expect(await balance(c.customer.id)).toBe(0);
    });

    it("biaya admin: ditagih nominal + biaya, dikreditkan nominal", async () => {
      process.env.TOPUP_ADMIN_FEE = "1500";
      const c = await createCustomer(prisma);
      const res = await topup(c, { amount: 50000, method: "QRIS" }).expect(201);
      expect(res.body).toMatchObject({
        amount: 51500,
        creditAmount: 50000,
        adminFee: 1500,
      });
      await webhook(res.body).expect(200);
      expect(await balance(c.customer.id)).toBe(50000);
    });
  });

  describe("aturan & otorisasi", () => {
    it("nominal di luar Rp10.000–Rp1.000.000 / pecahan / bukan angka → 400", async () => {
      const c = await createCustomer(prisma);
      for (const amount of [9999, 1_000_001, 10000.5, -50000, 0]) {
        await topup(c, { amount, method: "QRIS" }).expect(400);
      }
      await topup(c, { amount: "50000abc", method: "QRIS" }).expect(400);
      await topup(c, { amount: 50000, method: "VA" }).expect(400); // tanpa bank
      await topup(c, {
        amount: 50000,
        method: "QRIS",
        customerId: "orang-lain",
      }).expect(400); // field asing
      expect(await prisma.walletTopup.count()).toBe(0);
    });

    it("customer lain tidak bisa melihat/membatalkan/menyimulasikan top-up; staf tidak bisa top-up mandiri", async () => {
      const a = await createCustomer(prisma);
      const b = await createCustomer(prisma);
      const res = await topup(a, { amount: 50000, method: "QRIS" }).expect(201);
      const n = res.body.topupNumber;
      await http()
        .get(`/wallets/me/topups/${n}`)
        .set(auth(b.user.id))
        .expect(404);
      await http()
        .post(`/wallets/me/topups/${n}/cancel`)
        .set(auth(b.user.id))
        .expect(404);
      await http()
        .post(`/wallets/me/topups/${n}/simulate`)
        .set(auth(b.user.id))
        .expect(404);
      const owner = await createUser(prisma, UserRole.OWNER);
      await http()
        .post("/wallets/me/topup")
        .set(auth(owner.id, UserRole.OWNER))
        .send({ amount: 50000, method: "QRIS" })
        .expect(403);
      expect(
        (
          await http()
            .get("/wallets/me/topups")
            .set(auth(b.user.id))
            .expect(200)
        ).body,
      ).toHaveLength(0);
      expect(await balance(a.customer.id)).toBe(0);
    });

    it("simulasi pelunasan ditolak bila gateway bukan mock (klien tidak bisa mengklaim sukses)", async () => {
      const c = await createCustomer(prisma);
      const res = await topup(c, { amount: 50000, method: "QRIS" }).expect(201);
      gw.name = "midtrans";
      try {
        await http()
          .post(`/wallets/me/topups/${res.body.topupNumber}/simulate`)
          .set(auth(c.user.id))
          .expect(403);
      } finally {
        gw.name = "mock";
      }
      expect(await balance(c.customer.id)).toBe(0);
    });
  });

  describe("konkurensi, ganti metode, gagal & kedaluwarsa", () => {
    it("6 permintaan top-up paralel oleh satu customer → tepat SATU tagihan aktif", async () => {
      const c = await createCustomer(prisma);
      await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          topup(
            c,
            i % 2
              ? { amount: 50000, method: "QRIS" }
              : { amount: 75000, method: "VA", bank: "BNI" },
          ),
        ),
      );
      expect(
        await prisma.walletTopup.count({ where: { status: "PENDING" } }),
      ).toBe(1);
      expect(
        await prisma.walletTopup.count({
          where: { pendingSlot: c.customer.id },
        }),
      ).toBe(1);
      expect(await balance(c.customer.id)).toBe(0);
    });

    it("top-up paralel beberapa customer lalu semua lunas → saldo & ledger konsisten", async () => {
      const cs = await Promise.all(
        Array.from({ length: 5 }, () => createCustomer(prisma)),
      );
      const res = await Promise.all(
        cs.map((c, i) => topup(c, { amount: 10000 * (i + 1), method: "QRIS" })),
      );
      await Promise.all(res.map((r) => webhook(r.body)));
      for (const [i, c] of cs.entries()) {
        expect(await balance(c.customer.id)).toBe(10000 * (i + 1));
        expect(await ledgerMatchesBalance(c.customer.id)).toBe(true);
      }
    });

    it("ganti metode: QRIS → VA membatalkan tagihan QRIS (DB + gateway); metode sama dipakai ulang", async () => {
      const c = await createCustomer(prisma);
      const q = await topup(c, { amount: 50000, method: "QRIS" }).expect(201);
      const again = await topup(c, { amount: 50000, method: "QRIS" }).expect(
        201,
      );
      expect(again.body.topupNumber).toBe(q.body.topupNumber);
      const va = await topup(c, {
        amount: 50000,
        method: "VA",
        bank: "BRI",
      }).expect(201);
      expect(va.body.topupNumber).not.toBe(q.body.topupNumber);
      expect(
        (
          await prisma.walletTopup.findUniqueOrThrow({
            where: { topupNumber: q.body.topupNumber },
          })
        ).status,
      ).toBe("CANCELLED");
      expect(gw.cancelCharge).toHaveBeenCalledWith(q.body.topupNumber);
    });

    it("webhook FAILED / EXPIRED → tidak ada kredit; bisa membuat tagihan baru", async () => {
      const c = await createCustomer(prisma);
      const a = await topup(c, { amount: 30000, method: "QRIS" }).expect(201);
      await webhook(a.body, "FAILED").expect(200);
      const b = await topup(c, { amount: 30000, method: "QRIS" }).expect(201);
      await webhook(b.body, "EXPIRED").expect(200);
      expect(await balance(c.customer.id)).toBe(0);
      const s = await http()
        .get(`/wallets/me/topups/${b.body.topupNumber}`)
        .set(auth(c.user.id))
        .expect(200);
      expect(s.body).toMatchObject({ status: "EXPIRED", canRetry: true });
      await topup(c, { amount: 30000, method: "QRIS" }).expect(201);
    });

    it("lewat batas: provider PENDING → dipaksa expire → EXPIRED tanpa kredit; provider PAID → kredit", async () => {
      const c = await createCustomer(prisma);
      const a = await topup(c, { amount: 40000, method: "QRIS" }).expect(201);
      await prisma.walletTopup.update({
        where: { topupNumber: a.body.topupNumber },
        data: { expiresAt: inMinutes(-5) },
      });
      const s1 = await http()
        .get(`/wallets/me/topups/${a.body.topupNumber}`)
        .set(auth(c.user.id))
        .expect(200);
      expect(s1.body.status).toBe("EXPIRED");
      expect(await balance(c.customer.id)).toBe(0);

      const b = await topup(c, { amount: 40000, method: "QRIS" }).expect(201);
      await prisma.walletTopup.update({
        where: { topupNumber: b.body.topupNumber },
        data: { expiresAt: inMinutes(-5) },
      });
      gw.charges.set(b.body.topupNumber, "PAID");
      const s2 = await http()
        .get(`/wallets/me/topups/${b.body.topupNumber}`)
        .set(auth(c.user.id))
        .expect(200);
      expect(s2.body.status).toBe("PAID");
      expect(await balance(c.customer.id)).toBe(40000);
    });

    it("dana terverifikasi masuk SETELAH EXPIRED/CANCELLED → dikreditkan sekali + rekonsiliasi TOPUP_LATE_SETTLEMENT", async () => {
      const c = await createCustomer(prisma);
      const a = await topup(c, { amount: 25000, method: "QRIS" }).expect(201);
      await http()
        .post(`/wallets/me/topups/${a.body.topupNumber}/cancel`)
        .set(auth(c.user.id))
        .expect(201);
      expect(await balance(c.customer.id)).toBe(0);
      await webhook(a.body).expect(200);
      await webhook(a.body).expect(200);
      expect(await balance(c.customer.id)).toBe(25000);
      const rec = await prisma.paymentReconciliation.findMany({
        where: { topupId: { not: null } },
      });
      expect(rec).toHaveLength(1);
      expect(rec[0]).toMatchObject({
        reason: "TOPUP_LATE_SETTLEMENT",
        status: "OPEN",
        orderId: null,
      });
    });

    it("batal ketika provider ternyata sudah PAID → dikreditkan (bukan hilang)", async () => {
      const c = await createCustomer(prisma);
      const a = await topup(c, { amount: 15000, method: "QRIS" }).expect(201);
      gw.charges.set(a.body.topupNumber, "PAID");
      const r = await http()
        .post(`/wallets/me/topups/${a.body.topupNumber}/cancel`)
        .set(auth(c.user.id))
        .expect(201);
      expect(r.body.status).toBe("PAID");
      expect(await balance(c.customer.id)).toBe(15000);
    });

    it("scheduler: top-up PENDING kedaluwarsa disinkronkan (3 worker paralel) → satu kredit untuk yang PAID", async () => {
      const a = await createCustomer(prisma);
      const b = await createCustomer(prisma);
      const ta = await topup(a, { amount: 10000, method: "QRIS" }).expect(201);
      const tb = await topup(b, { amount: 10000, method: "QRIS" }).expect(201);
      await prisma.walletTopup.updateMany({
        data: { expiresAt: inMinutes(-10) },
      });
      gw.charges.set(ta.body.topupNumber, "PAID");
      await Promise.all([
        jobs.recoverStuck(),
        jobs.recoverStuck(),
        jobs.recoverStuck(),
      ]);
      expect(await balance(a.customer.id)).toBe(10000);
      expect(await balance(b.customer.id)).toBe(0);
      expect(
        (
          await prisma.walletTopup.findUniqueOrThrow({
            where: { topupNumber: tb.body.topupNumber },
          })
        ).status,
      ).toBe("EXPIRED");
      expect(
        await prisma.walletLedger.count({ where: { referenceType: "TOPUP" } }),
      ).toBe(1);
    });
  });

  describe("top-up terlambat lunas: kredit tunggal, rekonsiliasi & refund eksternal berkompensasi", () => {
    /** Top-up dibatalkan pelanggan lalu dana terverifikasi tetap masuk. */
    async function lateTopup(amount = 25000) {
      const c = await createCustomer(prisma);
      const t = await topup(c, { amount, method: "QRIS" }).expect(201);
      await http()
        .post(`/wallets/me/topups/${t.body.topupNumber}/cancel`)
        .set(auth(c.user.id))
        .expect(201);
      gw.charges.set(t.body.topupNumber, "PAID");
      return { c, t: t.body };
    }
    const owner = async () => {
      const o = await createUser(prisma, UserRole.OWNER);
      return { Authorization: auth(o.id, UserRole.OWNER).Authorization };
    };
    const recOf = async (topupNumber: string) => {
      const t = await prisma.walletTopup.findUniqueOrThrow({
        where: { topupNumber },
      });
      return prisma.paymentReconciliation.findFirstOrThrow({
        where: { topupId: t.id },
      });
    };

    it("webhook + polling + scheduler PARALEL → satu kredit ledger, satu rekonsiliasi beraudit", async () => {
      const { c, t } = await lateTopup();
      await prisma.walletTopup.update({
        where: { topupNumber: t.topupNumber },
        data: { expiresAt: inMinutes(-10) },
      });
      await Promise.all([
        webhook(t),
        webhook(t),
        http().get(`/wallets/me/topups/${t.topupNumber}`).set(auth(c.user.id)),
        jobs.recoverStuck(),
      ]);
      expect(await balance(c.customer.id)).toBe(25000);
      expect(
        await prisma.walletLedger.count({ where: { referenceType: "TOPUP" } }),
      ).toBe(1);
      const rec = await prisma.paymentReconciliation.findMany({
        where: { reason: "TOPUP_LATE_SETTLEMENT" },
      });
      expect(rec).toHaveLength(1);
      expect(
        await prisma.auditLog.count({
          where: {
            entity: "PaymentReconciliation",
            entityId: rec[0].id,
            action: "RECONCILIATION_CREATED",
          },
        }),
      ).toBe(1);
      expect(await ledgerMatchesBalance(c.customer.id)).toBe(true);
    });

    it("refund eksternal wajib disetujui, wajib EXTERNAL + referensi, dan MEMBALIK kredit saldo (debit kompensasi)", async () => {
      const { c, t } = await lateTopup(25000);
      await webhook(t).expect(200);
      const rec = await recOf(t.topupNumber);
      const adm = await owner();
      await http()
        .post(`/payments/reconciliations/${rec.id}/execute`)
        .set(adm)
        .send({ method: "EXTERNAL", reference: "TRF-1" })
        .expect(409);
      await http()
        .post(`/payments/reconciliations/${rec.id}/review`)
        .set(adm)
        .send({ decision: "APPROVE", note: "refund ke rekening" })
        .expect(201);
      await http()
        .post(`/payments/reconciliations/${rec.id}/execute`)
        .set(adm)
        .send({ method: "WALLET_CREDIT" })
        .expect(400);
      await http()
        .post(`/payments/reconciliations/${rec.id}/execute`)
        .set(adm)
        .send({ method: "EXTERNAL" })
        .expect(400);
      expect(await balance(c.customer.id)).toBe(25000);
      await http()
        .post(`/payments/reconciliations/${rec.id}/execute`)
        .set(adm)
        .send({ method: "EXTERNAL", reference: "TRF-BCA-001" })
        .expect(201);
      expect(await balance(c.customer.id)).toBe(0); // kredit dibalik — tidak ada saldo + refund sekaligus
      const comp = await prisma.walletLedger.findMany({
        where: { referenceType: "TOPUP_REFUND" },
      });
      expect(comp).toHaveLength(1);
      expect(Number(comp[0].amount)).toBe(25000);
      expect(
        (
          await prisma.walletTopup.findUniqueOrThrow({
            where: { topupNumber: t.topupNumber },
          })
        ).status,
      ).toBe("REFUNDED");
      expect((await recOf(t.topupNumber)).status).toBe("REFUNDED");
      expect(await ledgerMatchesBalance(c.customer.id)).toBe(true);
      const hist = await http()
        .get(`/payments/reconciliations/${rec.id}/history`)
        .set(adm)
        .expect(200);
      expect(hist.body.map((h: any) => h.action)).toEqual([
        "RECONCILIATION_CREATED",
        "RECONCILIATION_APPROVE",
        "RECONCILIATION_EXECUTED",
      ]);
    });

    it("saldo kredit sudah terpakai → refund eksternal DITOLAK (tanpa ledger, rekonsiliasi tetap APPROVED)", async () => {
      const { c, t } = await lateTopup(25000);
      await webhook(t).expect(200);
      const w = await prisma.wallet.findUniqueOrThrow({
        where: { customerId: c.customer.id },
      });
      await prisma.wallet.update({
        where: { id: w.id },
        data: { balance: 5000 },
      }); // simulasi sudah dibelanjakan
      await prisma.walletLedger.create({
        data: {
          walletId: w.id,
          walletType: "MAIN_BALANCE",
          direction: "DEBIT",
          amount: 20000,
          balanceBefore: 25000,
          balanceAfter: 5000,
          referenceType: "PAYMENT",
        },
      });
      const rec = await recOf(t.topupNumber);
      const adm = await owner();
      await http()
        .post(`/payments/reconciliations/${rec.id}/review`)
        .set(adm)
        .send({ decision: "APPROVE", note: "disetujui owner" })
        .expect(201);
      await http()
        .post(`/payments/reconciliations/${rec.id}/execute`)
        .set(adm)
        .send({ method: "EXTERNAL", reference: "TRF-2" })
        .expect(409);
      expect(await balance(c.customer.id)).toBe(5000);
      expect(
        await prisma.walletLedger.count({
          where: { referenceType: "TOPUP_REFUND" },
        }),
      ).toBe(0);
      expect((await recOf(t.topupNumber)).status).toBe("APPROVED");
    });

    it("eksekusi refund paralel (4×) → tepat satu debit kompensasi; eksekusi ulang 409", async () => {
      const { c, t } = await lateTopup(30000);
      await webhook(t).expect(200);
      const rec = await recOf(t.topupNumber);
      const adm = await owner();
      await http()
        .post(`/payments/reconciliations/${rec.id}/review`)
        .set(adm)
        .send({ decision: "APPROVE", note: "disetujui owner" })
        .expect(201);
      const res = await Promise.all(
        Array.from({ length: 4 }, () =>
          http()
            .post(`/payments/reconciliations/${rec.id}/execute`)
            .set(adm)
            .send({ method: "EXTERNAL", reference: "TRF-3" }),
        ),
      );
      expect(res.filter((r) => r.status === 201)).toHaveLength(1);
      expect(
        await prisma.walletLedger.count({
          where: { referenceType: "TOPUP_REFUND" },
        }),
      ).toBe(1);
      expect(await balance(c.customer.id)).toBe(0);
      await http()
        .post(`/payments/reconciliations/${rec.id}/execute`)
        .set(adm)
        .send({ method: "EXTERNAL", reference: "TRF-3" })
        .expect(409);
      expect(await ledgerMatchesBalance(c.customer.id)).toBe(true);
    });

    it("webhook PAID setelah top-up direfund → tidak dikredit lagi", async () => {
      const { c, t } = await lateTopup(10000);
      await webhook(t).expect(200);
      const rec = await recOf(t.topupNumber);
      const adm = await owner();
      await http()
        .post(`/payments/reconciliations/${rec.id}/review`)
        .set(adm)
        .send({ decision: "APPROVE", note: "disetujui owner" })
        .expect(201);
      await http()
        .post(`/payments/reconciliations/${rec.id}/execute`)
        .set(adm)
        .send({ method: "EXTERNAL", reference: "TRF-4" })
        .expect(201);
      await webhook(t).expect(200);
      expect(await balance(c.customer.id)).toBe(0);
      expect(
        await prisma.walletLedger.count({ where: { referenceType: "TOPUP" } }),
      ).toBe(1);
    });
  });

  it("riwayat top-up milik sendiri, terbaru dulu", async () => {
    const c = await createCustomer(prisma);
    const a = await topup(c, { amount: 10000, method: "QRIS" }).expect(201);
    await webhook(a.body).expect(200);
    await topup(c, { amount: 20000, method: "VA", bank: "BCA" }).expect(201);
    const list = await http()
      .get("/wallets/me/topups")
      .set(auth(c.user.id))
      .expect(200);
    expect(list.body.map((t: any) => [t.amount, t.status])).toEqual([
      [20000, "PENDING"],
      [10000, "PAID"],
    ]);
    expect(Prisma).toBeTruthy();
  });
});
