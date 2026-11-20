/**
 * Batch 2 (T4, T5) — siklus hidup pembayaran pada PostgreSQL NYATA.
 *
 * Gateway = TIRUAN yang bisa dikendalikan (status tagihan per nomor
 * pembayaran; "pelanggan membayar" = status PAID + webhook). Ini BUKAN uji
 * Midtrans sandbox; perilaku API Midtrans (expire/status) dicakup unit test
 * adaptor dan tercatat NOT_VERIFIED di sandbox.
 */
import { Test } from "@nestjs/testing";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { BookingStatus, OrderStatus, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { OrdersService } from "../../src/modules/orders/orders.service";
import { PaymentsService } from "../../src/modules/payments/payments.service";
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
  createCustomer,
  createMachine,
  createOutlet,
  createServiceWithPrice,
  controllableGateway,
  inMinutes,
  resetDb,
} from "./helpers";

describe("Batch 2 — siklus hidup pembayaran (PostgreSQL nyata, gateway tiruan)", () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  const gw = controllableGateway();
  const mqtt = { publishCommand: jest.fn(), eventHandler: undefined as any };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        OrdersService,
        PaymentsService,
        IotMachineService,
        WalletLedgerService,
        { provide: IotMqttService, useValue: mqtt },
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
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    orders = moduleRef.get(OrdersService);
    payments = moduleRef.get(PaymentsService);
  });
  afterAll(() => prisma.$disconnect());

  let outlet: any, machine: any, service: any;
  beforeEach(async () => {
    await resetDb(prisma);
    gw.charges.clear();
    gw.createCharge.mockClear();
    gw.cancelCharge.mockClear();
    mqtt.publishCommand.mockClear();
    outlet = await createOutlet(prisma);
    machine = await createMachine(prisma, outlet.id);
    service = await createServiceWithPrice(prisma, outlet.id, 10000);
  });

  const newOrder = async (c: any, withMachine = true) =>
    (await orders.create(
      {
        customerId: c.customer.id,
        outletId: outlet.id,
        sourcePlatform: "MOBILE_APP",
        items: [{ serviceId: service.id, quantity: 1, machineType: "WASHER" }],
        ...(withMachine ? { deviceId: machine.id } : {}),
      } as any,
      c.user.id,
    )) as any;
  const charge = (
    c: any,
    orderId: string,
    method: "QRIS" | "VA",
    bank?: string,
  ) =>
    payments.createGatewayPayment(c.user.id, { orderId, method, bank } as any);
  /** Pelanggan membayar tagihan di provider → webhook. */
  const customerPays = async (paymentNumber: string) => {
    gw.charges.set(paymentNumber, "PAID");
    const row = await prisma.payment.findUniqueOrThrow({
      where: { paymentNumber },
    });
    await payments.handleWebhook({
      externalId: row.externalId!,
      status: "PAID",
    } as any);
  };
  const attempts = (orderId: string) =>
    prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
    });
  const balance = async (customerId: string) =>
    Number(
      (await prisma.wallet.findUniqueOrThrow({ where: { customerId } }))
        .balance,
    );

  // ── Ganti metode ─────────────────────────────────────────────────────────
  describe("ganti metode (T4)", () => {
    it("QRIS → VA BCA → VA BNI: percobaan baru bernomor unik, lama CANCELLED + dibatalkan di gateway, riwayat lengkap", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      const p1: any = await charge(c, o.id, "QRIS");
      const p2: any = await charge(c, o.id, "VA", "BCA");
      const p3: any = await charge(c, o.id, "VA", "BNI");
      expect([p1.paymentNumber, p2.paymentNumber, p3.paymentNumber]).toEqual([
        `PG-${o.orderNumber}`,
        `PG-${o.orderNumber}-2`,
        `PG-${o.orderNumber}-3`,
      ]);
      expect(p2.vaNumber).toBeTruthy();
      const rows = await attempts(o.id);
      expect(rows.map((r) => r.status)).toEqual([
        PaymentStatus.CANCELLED,
        PaymentStatus.CANCELLED,
        PaymentStatus.PENDING,
      ]);
      expect(rows.filter((r) => r.pendingSlot)).toHaveLength(1);
      expect(gw.cancelCharge.mock.calls.map((x) => x[0])).toEqual([
        p1.paymentNumber,
        p2.paymentNumber,
      ]);
    });

    it("metode & bank sama → tagihan yang sama dipakai ulang (tidak membuat tagihan baru)", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      const a: any = await charge(c, o.id, "VA", "BCA");
      const b: any = await charge(c, o.id, "VA", "BCA");
      expect(b.paymentNumber).toBe(a.paymentNumber);
      expect(gw.createCharge).toHaveBeenCalledTimes(1);
      expect(a.secondsRemaining).toBeGreaterThan(800);
      expect(a.serverTime).toBeTruthy();
    });

    it("ganti metode padahal tagihan lama SUDAH dibayar → 409, order lunas oleh tagihan lama, percobaan baru batal", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      const p1: any = await charge(c, o.id, "QRIS");
      gw.charges.set(p1.paymentNumber, "PAID"); // dibayar, webhook belum tiba
      await expect(charge(c, o.id, "VA", "BCA")).rejects.toBeInstanceOf(
        ConflictException,
      );
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: o.id },
      });
      const rows = await attempts(o.id);
      expect(order.status).toBe(OrderStatus.PAID);
      expect(order.paidPaymentId).toBe(rows[0].id);
      expect(rows[1].status).toBe(PaymentStatus.CANCELLED);
      expect(gw.createCharge).toHaveBeenCalledTimes(1); // tidak menagih lagi
    });

    it("8 permintaan ganti metode paralel → selalu tepat SATU percobaan aktif", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          charge(c, o.id, i % 2 ? "QRIS" : "VA", "BCA"),
        ),
      );
      const rows = await attempts(o.id);
      expect(
        rows.filter((r) => r.status === PaymentStatus.PENDING),
      ).toHaveLength(1);
      expect(rows.filter((r) => r.pendingSlot === o.id)).toHaveLength(1);
      expect(new Set(rows.map((r) => r.paymentNumber)).size).toBe(rows.length);
    });

    it("ganti ke saldo: tagihan QRIS dibatalkan, saldo dipotong sekali; QR lama yang ternyata sudah dibayar → saldo TIDAK dipotong", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const o1 = await newOrder(c, false);
      await charge(c, o1.id, "QRIS");
      await payments.payOrderWithWallet(c.user.id, o1.id);
      expect(await balance(c.customer.id)).toBe(40000);

      const o2 = await newOrder(c, false);
      const p: any = await charge(c, o2.id, "QRIS");
      gw.charges.set(p.paymentNumber, "PAID");
      await expect(
        payments.payOrderWithWallet(c.user.id, o2.id),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await balance(c.customer.id)).toBe(40000);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o2.id } })).status,
      ).toBe(OrderStatus.PAID);
    });
  });

  // ── Webhook & konkurensi ─────────────────────────────────────────────────
  describe("webhook & konkurensi", () => {
    it("webhook PAID ganda (5 paralel) → satu pelunasan, satu log PAID, booking RESERVED", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      const p: any = await charge(c, o.id, "QRIS");
      gw.charges.set(p.paymentNumber, "PAID");
      const row = await prisma.payment.findUniqueOrThrow({
        where: { paymentNumber: p.paymentNumber },
      });
      await Promise.all(
        Array.from({ length: 5 }, () =>
          payments.handleWebhook({
            externalId: row.externalId!,
            status: "PAID",
          } as any),
        ),
      );
      expect(
        await prisma.orderStatusLog.count({
          where: { orderId: o.id, status: OrderStatus.PAID },
        }),
      ).toBe(1);
      expect(
        (
          await prisma.machineBooking.findUniqueOrThrow({
            where: { orderId: o.id },
          })
        ).status,
      ).toBe(BookingStatus.RESERVED);
      expect(await prisma.paymentReconciliation.count()).toBe(0);
    });

    it("dua tagihan berbeda sama-sama dibayar (paralel) → tepat satu melunasi, satunya DUPLICATE_PAYMENT", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      const p1: any = await charge(c, o.id, "QRIS");
      gw.cancelCharge.mockImplementationOnce(async () => "CANCELLED"); // pembatalan "berhasil" tapi QR tetap dibayar
      const p2: any = await charge(c, o.id, "VA", "BCA");
      await Promise.all([
        customerPays(p1.paymentNumber),
        customerPays(p2.paymentNumber),
      ]);
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: o.id },
      });
      const rec = await prisma.paymentReconciliation.findMany({
        where: { orderId: o.id },
      });
      expect(order.status).toBe(OrderStatus.PAID);
      expect(rec).toHaveLength(1);
      expect(rec[0].reason).toBe("DUPLICATE_PAYMENT");
      expect(rec[0].paymentId).not.toBe(order.paidPaymentId);
      expect(
        await prisma.orderStatusLog.count({
          where: { orderId: o.id, status: OrderStatus.PAID },
        }),
      ).toBe(1);
    });

    it("saldo vs QRIS paralel (10×) → order lunas sekali; saldo terpotong paling banyak sekali; sisa → rekonsiliasi", async () => {
      for (let i = 0; i < 10; i++) {
        const c = await createCustomer(prisma, { balance: 50000 });
        const o = await newOrder(c, false);
        const p: any = await charge(c, o.id, "QRIS");
        await Promise.allSettled([
          payments.payOrderWithWallet(c.user.id, o.id),
          customerPays(p.paymentNumber),
        ]);
        const order = await prisma.order.findUniqueOrThrow({
          where: { id: o.id },
        });
        const paid = await prisma.payment.findMany({
          where: { orderId: o.id, status: PaymentStatus.PAID },
        });
        const rec = await prisma.paymentReconciliation.findMany({
          where: { orderId: o.id },
        });
        const debited = 50000 - (await balance(c.customer.id));
        expect(order.status).toBe(OrderStatus.PAID);
        expect(paid.some((x) => x.id === order.paidPaymentId)).toBe(true);
        expect([0, 10000]).toContain(debited);
        // Setiap pembayaran lunas selain yang melunasi order tercatat untuk refund.
        expect(rec).toHaveLength(paid.length - 1);
        expect(
          await prisma.orderStatusLog.count({
            where: { orderId: o.id, status: OrderStatus.PAID },
          }),
        ).toBe(1);
      }
    });

    it("batal vs pelunasan paralel (8×) → PAID tanpa rekonsiliasi, ATAU CANCELLED + PAID_AFTER_CANCEL", async () => {
      for (let i = 0; i < 8; i++) {
        const c = await createCustomer(prisma);
        const o = await newOrder(c);
        const p: any = await charge(c, o.id, "QRIS");
        await Promise.allSettled([
          orders.cancel(
            o.id,
            { cancelReason: "batal" },
            c.user.id,
            c.auth as any,
          ),
          customerPays(p.paymentNumber),
        ]);
        const order = await prisma.order.findUniqueOrThrow({
          where: { id: o.id },
        });
        const rec = await prisma.paymentReconciliation.findMany({
          where: { orderId: o.id },
        });
        if (order.status === OrderStatus.PAID) expect(rec).toHaveLength(0);
        else {
          expect(order.status).toBe(OrderStatus.CANCELLED);
          expect(rec.map((r) => r.reason)).toEqual(["PAID_AFTER_CANCEL"]);
          expect(
            (
              await prisma.machineBooking.findUniqueOrThrow({
                where: { orderId: o.id },
              })
            ).status,
          ).toBe(BookingStatus.CANCELLED);
        }
      }
    });
  });

  // ── Kedaluwarsa otoritatif server (T5) ───────────────────────────────────
  describe("kedaluwarsa (T5)", () => {
    const backdate = (paymentNumber: string, minutesAgo: number) =>
      prisma.payment.update({
        where: { paymentNumber },
        data: { expiresAt: inMinutes(-minutesAgo) },
      });

    it("sebelum lewat batas: tetap PENDING walau klien menganggap habis", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      const p: any = await charge(c, o.id, "QRIS");
      await prisma.payment.update({
        where: { paymentNumber: p.paymentNumber },
        data: { expiresAt: new Date(Date.now() - 10_000) },
      });
      const s: any = await payments.getStatus(p.paymentNumber); // masih dalam toleransi
      expect(s.status).toBe(PaymentStatus.PENDING);
      expect(gw.getChargeStatus).not.toHaveBeenCalledWith(p.paymentNumber);
    });

    it("lewat batas + provider PENDING → dipaksa expire → EXPIRED, canRetry; percobaan baru bisa dibuat", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      const p: any = await charge(c, o.id, "QRIS");
      await backdate(p.paymentNumber, 5);
      const s: any = await payments.getStatus(p.paymentNumber);
      expect(s).toMatchObject({
        status: PaymentStatus.EXPIRED,
        canRetry: true,
        secondsRemaining: 0,
      });
      const again: any = await charge(c, o.id, "QRIS");
      expect(again.paymentNumber).toBe(`PG-${o.orderNumber}-2`);
      expect(again.status).toBe(PaymentStatus.PENDING);
    });

    it("lewat batas tetapi provider bilang SUDAH DIBAYAR → PAID (tidak pernah dianggap expired)", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      const p: any = await charge(c, o.id, "QRIS");
      await backdate(p.paymentNumber, 5);
      gw.charges.set(p.paymentNumber, "PAID");
      const s: any = await payments.getStatus(p.paymentNumber);
      expect(s.status).toBe(PaymentStatus.PAID);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.PAID);
    });

    it("gateway error saat verifikasi → tetap PENDING (tidak menebak)", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      const p: any = await charge(c, o.id, "QRIS");
      await backdate(p.paymentNumber, 5);
      gw.getChargeStatus.mockRejectedValueOnce(new Error("timeout"));
      const s: any = await payments.getStatus(p.paymentNumber);
      expect(s.status).toBe(PaymentStatus.PENDING);
    });

    it("HOLD mesin diperpanjang selama tagihan berlaku; HOLD kedaluwarsa & slot terambil → tidak menagih", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      await charge(c, o.id, "QRIS");
      const b = await prisma.machineBooking.findUniqueOrThrow({
        where: { orderId: o.id },
      });
      expect(b.expiresAt.getTime()).toBeGreaterThan(inMinutes(14).getTime());

      const c2 = await createCustomer(prisma);
      const o2 = await newOrder(c2, false);
      const other = await createCustomer(prisma);
      // Simulasikan HOLD order lain yang kedaluwarsa lalu slotnya diambil.
      await prisma.machineBooking.update({
        where: { orderId: o.id },
        data: { expiresAt: inMinutes(-1) },
      });
      await prisma.payment.updateMany({
        where: { orderId: o.id },
        data: { status: "EXPIRED", pendingSlot: null },
      });
      await orders.create(
        {
          customerId: other.customer.id,
          outletId: outlet.id,
          sourcePlatform: "MOBILE_APP",
          items: [{ serviceId: service.id, quantity: 1 }],
          deviceId: machine.id,
        } as any,
        other.user.id,
      );
      gw.createCharge.mockClear();
      await expect(charge(c, o.id, "QRIS")).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(gw.createCharge).not.toHaveBeenCalled();
      expect(o2).toBeTruthy();
    });
  });

  // ── Invarian di level database & verifikasi server ──────────────────────
  describe("invarian keuangan", () => {
    it("trigger DB: order CANCELLED tidak bisa diubah menjadi PAID (bahkan lewat SQL langsung)", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      await orders.cancel(
        o.id,
        { cancelReason: "x" },
        c.user.id,
        c.auth as any,
      );
      await expect(
        prisma.order.update({
          where: { id: o.id },
          data: { status: OrderStatus.PAID },
        }),
      ).rejects.toThrow(/tidak boleh berubah/);
    });

    it("trigger DB: paidPaymentId harus milik order sendiri; unik (satu pembayaran tidak melunasi dua order)", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const a = await newOrder(c, false);
      const b = await newOrder(c, false);
      await payments.payOrderWithWallet(c.user.id, a.id);
      const pa = (await prisma.order.findUniqueOrThrow({ where: { id: a.id } }))
        .paidPaymentId!;
      await expect(
        prisma.order.update({
          where: { id: b.id },
          data: { paidPaymentId: pa },
        }),
      ).rejects.toThrow();
    });

    it("simulasi pembayaran & callback generik ditolak bila gateway bukan mock", async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      const p: any = await charge(c, o.id, "QRIS");
      gw.name = "midtrans";
      try {
        await expect(
          payments.simulatePaid(p.paymentNumber),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          payments.handleWebhook({
            externalId: `ext-${p.paymentNumber}`,
            status: "PAID",
          } as any),
        ).rejects.toBeInstanceOf(ForbiddenException);
      } finally {
        gw.name = "mock";
      }
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.DRAFT);
    });

    it("order orang lain tidak bisa ditagih", async () => {
      const a = await createCustomer(prisma);
      const b = await createCustomer(prisma);
      const o = await newOrder(a);
      await expect(charge(b, o.id, "QRIS")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
