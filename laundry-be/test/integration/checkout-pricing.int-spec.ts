/**
 * Batch 3 (T3, T10, S1, S4) — harga terpadu & checkout pada PostgreSQL NYATA
 * dengan mesin pricing ASLI (PricingService, VoucherService, CampaignService,
 * PromosService, MembershipTierService, …). Hanya gateway pembayaran & MQTT
 * yang tiruan. Bukan uji Midtrans sandbox / mesin fisik.
 */
import { Test } from "@nestjs/testing";
import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  BookingStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { OrdersService } from "../../src/modules/orders/orders.service";
import { PaymentsService } from "../../src/modules/payments/payments.service";
import { PAYMENT_GATEWAY } from "../../src/modules/payments/gateway/payment-gateway.interface";
import { TransactionService } from "../../src/modules/transactions/transaction.service";
import { PricingService } from "../../src/modules/pricing/pricing.service";
import { B2BPricingService } from "../../src/modules/pricing/b2b-pricing.service";
import { PricingCalculationService } from "../../src/modules/pricing/pricing-calculation.service";
import { VoucherService } from "../../src/modules/vouchers/voucher.service";
import { CampaignService } from "../../src/modules/campaigns/campaign.service";
import { PromosService } from "../../src/modules/promos/promos.service";
import { PointService } from "../../src/modules/points/point.service";
import { MembershipTierService } from "../../src/modules/memberships/membership-tier.service";
import { B2BPartnerService } from "../../src/modules/partners/b2b-partner.service";
import { LoyaltyConfigService } from "../../src/modules/loyalty-config/loyalty-config.service";
import { WalletLedgerService } from "../../src/modules/wallets/wallet-ledger.service";
import { IotMachineService } from "../../src/modules/iot/iot-machine.service";
import { IotMqttService } from "../../src/modules/iot/iot-mqtt.service";
import { WalletTopupService } from "../../src/modules/payments/wallet-topup.service";
import { BookingMaintenanceService } from "../../src/modules/operations/booking-maintenance.service";
import {
  controllableGateway,
  createCustomer,
  createMachine,
  createOutlet,
  createServiceWithPrice,
  inMinutes,
  resetDb,
} from "./helpers";

describe("Batch 3 — harga terpadu, voucher, happy hour, siklus dryer (PostgreSQL nyata, pricing asli)", () => {
  let prisma: PrismaService;
  let tx: TransactionService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let jobs: BookingMaintenanceService;
  let preview: PricingCalculationService;
  const gw = controllableGateway();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        TransactionService,
        OrdersService,
        PaymentsService,
        PricingService,
        B2BPricingService,
        VoucherService,
        CampaignService,
        PromosService,
        PointService,
        MembershipTierService,
        B2BPartnerService,
        LoyaltyConfigService,
        WalletLedgerService,
        IotMachineService,
        BookingMaintenanceService,
        // Batch 4: sapuan top-up diuji di wallet-topup.int-spec.
        { provide: WalletTopupService, useValue: { syncPending: jest.fn() } },
        PricingCalculationService,
        { provide: IotMqttService, useValue: { publishCommand: jest.fn() } },
        { provide: PAYMENT_GATEWAY, useValue: gw },
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    tx = moduleRef.get(TransactionService);
    orders = moduleRef.get(OrdersService);
    payments = moduleRef.get(PaymentsService);
    jobs = moduleRef.get(BookingMaintenanceService);
    preview = moduleRef.get(PricingCalculationService);
  });
  afterAll(() => prisma.$disconnect());

  let outlet: any, washer: any, dryerSvc: any, washSvc: any, dryer: any;
  beforeEach(async () => {
    await resetDb(prisma);
    gw.charges.clear();
    outlet = await createOutlet(prisma);
    washer = await createMachine(prisma, outlet.id, "WASHING_MACHINE");
    dryer = await createMachine(prisma, outlet.id, "DRYER_MACHINE");
    washSvc = await createServiceWithPrice(prisma, outlet.id, 20000);
    dryerSvc = await prisma.service.create({
      data: {
        name: "Kering",
        serviceType: "DRY",
        machineType: "DRYER",
        estimateMinutes: 40,
      },
    });
    await prisma.servicePrice.create({
      data: {
        serviceId: dryerSvc.id,
        outletId: outlet.id,
        pricingType: "FIXED",
        price: new Prisma.Decimal(10000),
        unit: "CYCLE",
      },
    });
  });

  async function voucherFor(customerId: string, value = 5000) {
    const tpl =
      (await prisma.voucherTemplate.findFirst({ where: { code: "HEMAT5" } })) ??
      (await prisma.voucherTemplate.create({
        data: {
          code: "HEMAT5",
          name: "Hemat 5rb",
          voucherType: "NOMINAL_DISCOUNT",
          value: new Prisma.Decimal(value),
        },
      }));
    return prisma.userVoucher.create({
      data: {
        templateId: tpl.id,
        customerId,
        segment: "RETAIL",
        code: `HEMAT5-${customerId.slice(0, 6)}`,
      },
    });
  }
  const happyHour = (quota: number | null = null) =>
    prisma.happyHourRule.create({
      data: {
        name: "HH uji",
        outletId: outlet.id,
        daysOfWeek: "1,2,3,4,5,6,7",
        startTime: "00:00",
        endTime: "23:59",
        adjustmentType: "PERCENTAGE_OFF",
        value: new Prisma.Decimal(20),
        quota,
      },
    });
  const washInput = (c: any, extra: Record<string, unknown> = {}) => ({
    customerId: c.customer.id,
    outletId: outlet.id,
    sourcePlatform: "MOBILE_APP",
    items: [{ serviceId: washSvc.id, quantity: 1 }],
    deviceId: washer.id,
    ...extra,
  });
  const balance = async (customerId: string) =>
    Number(
      (await prisma.wallet.findUniqueOrThrow({ where: { customerId } }))
        .balance,
    );
  const payQr = async (paymentNumber: string) => {
    gw.charges.set(paymentNumber, "PAID");
    const row = await prisma.payment.findUniqueOrThrow({
      where: { paymentNumber },
    });
    await payments.handleWebhook({
      externalId: row.externalId!,
      status: "PAID",
    } as any);
  };

  // ── T10: harga sama untuk semua metode ─────────────────────────────────────
  describe("T10 — voucher & happy hour di semua metode", () => {
    it("quote = total order = nominal QRIS = nominal VA = potongan saldo (voucher + happy hour)", async () => {
      const c = await createCustomer(prisma, { balance: 100000 });
      const v = await voucherFor(c.customer.id);
      await happyHour();
      const quote: any = await tx.quote(
        washInput(c, { voucherCode: v.code }) as any,
      );
      expect(quote.happyHourDiscount).toBe(4000); // 20% × 20.000
      expect(quote.voucherDiscount).toBe(5000);
      expect(quote.finalAmount).toBe(11000);

      const o: any = await tx.createOrder(
        washInput(c, { voucherCode: v.code }) as any,
        c.user.id,
      );
      expect(Number(o.totalAmount)).toBe(11000);
      const qris: any = await payments.createGatewayPayment(c.user.id, {
        orderId: o.id,
        method: "QRIS",
      } as any);
      expect(qris.amount).toBe(11000);
      const va: any = await payments.createGatewayPayment(c.user.id, {
        orderId: o.id,
        method: "VA",
        bank: "BCA",
      } as any);
      expect(va.amount).toBe(11000);
      await payments.payOrderWithWallet(c.user.id, o.id);
      expect(await balance(c.customer.id)).toBe(100000 - 11000);
      expect(await prisma.order.count()).toBe(1); // tidak ada order duplikat
    });

    it("voucher direservasi saat order dibuat → APPLIED saat lunas via QRIS", async () => {
      const c = await createCustomer(prisma);
      const v = await voucherFor(c.customer.id);
      const o: any = await tx.createOrder(
        washInput(c, { voucherCode: v.code }) as any,
        c.user.id,
      );
      expect(
        (await prisma.userVoucher.findUniqueOrThrow({ where: { id: v.id } }))
          .status,
      ).toBe("USED");
      expect(
        (
          await prisma.voucherRedemption.findUniqueOrThrow({
            where: { orderId: o.id },
          })
        ).status,
      ).toBe("RESERVED");
      const p: any = await payments.createGatewayPayment(c.user.id, {
        orderId: o.id,
        method: "QRIS",
      } as any);
      await payQr(p.paymentNumber);
      expect(
        (
          await prisma.voucherRedemption.findUniqueOrThrow({
            where: { orderId: o.id },
          })
        ).status,
      ).toBe("APPLIED");
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.PAID);
    });

    it("satu voucher, 5 order paralel → tepat satu memegang voucher", async () => {
      const c = await createCustomer(prisma);
      const v = await voucherFor(c.customer.id);
      const machines = await Promise.all(
        Array.from({ length: 5 }, () => createMachine(prisma, outlet.id)),
      );
      const res = await Promise.allSettled(
        machines.map((m) =>
          tx.createOrder(
            washInput(c, { voucherCode: v.code, deviceId: m.id }) as any,
            c.user.id,
          ),
        ),
      );
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.voucherRedemption.count()).toBe(1);
      expect(await prisma.order.count()).toBe(1); // order gagal di-rollback, tanpa booking yatim
      expect(await prisma.machineBooking.count()).toBe(1);
    });

    it("batal order belum bayar → voucher kembali ACTIVE & bisa dipakai lagi; kuota happy hour dikembalikan", async () => {
      const c = await createCustomer(prisma);
      const v = await voucherFor(c.customer.id);
      const hh = await happyHour(5);
      const o: any = await tx.createOrder(
        washInput(c, { voucherCode: v.code }) as any,
        c.user.id,
      );
      expect(
        (await prisma.happyHourRule.findUniqueOrThrow({ where: { id: hh.id } }))
          .usedQuota,
      ).toBe(1);
      await orders.cancel(
        o.id,
        { cancelReason: "ganti pikiran" },
        c.user.id,
        c.auth as any,
      );
      await orders
        .cancel(o.id, { cancelReason: "x" }, undefined)
        .catch(() => undefined); // tidak melepas dua kali
      expect(
        (await prisma.userVoucher.findUniqueOrThrow({ where: { id: v.id } }))
          .status,
      ).toBe("ACTIVE");
      expect(
        (await prisma.happyHourRule.findUniqueOrThrow({ where: { id: hh.id } }))
          .usedQuota,
      ).toBe(0);
      const again: any = await tx.createOrder(
        washInput(c, { voucherCode: v.code }) as any,
        c.user.id,
      );
      expect(Number(again.totalAmount)).toBe(20000 - 4000 - 5000);
    });

    it("kuota happy hour 2, 5 order paralel → tepat 2 mendapat diskon, sisanya 409 sebelum bayar", async () => {
      await happyHour(2);
      const machines = await Promise.all(
        Array.from({ length: 5 }, () => createMachine(prisma, outlet.id)),
      );
      const customers = await Promise.all(
        machines.map(() => createCustomer(prisma)),
      );
      const res = await Promise.allSettled(
        machines.map((m, i) =>
          tx.createOrder(
            washInput(customers[i], { deviceId: m.id }) as any,
            customers[i].user.id,
          ),
        ),
      );
      const ok = res.filter((r) => r.status === "fulfilled");
      const rejected = res.filter(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult[];
      expect(ok.length + rejected.length).toBe(5);
      // Order yang dihargai saat kuota sudah habis tidak mendapat diskon (bukan
      // gagal); yang berbalapan pada reservasi terakhir → 409 sebelum bayar.
      const used = (await prisma.happyHourRule.findFirstOrThrow()).usedQuota;
      const all = await prisma.order.findMany();
      const discounted = all.filter(
        (o) => ((o.pricingSnapshot as any)?.happyHourDiscount ?? 0) > 0,
      );
      expect(used).toBe(2);
      expect(discounted).toHaveLength(2);
      rejected.forEach((r) =>
        expect(r.reason).toBeInstanceOf(ConflictException),
      );
      expect(all).toHaveLength(ok.length);
    });

    it("happy hour kini berlaku untuk QRIS (dulu dipaksa ke saldo)", async () => {
      const c = await createCustomer(prisma);
      await happyHour();
      const o: any = await tx.createOrder(washInput(c) as any, c.user.id);
      const p: any = await payments.createGatewayPayment(c.user.id, {
        orderId: o.id,
        method: "QRIS",
      } as any);
      expect(p.amount).toBe(16000);
    });
  });

  // ── S1: satu order untuk semua metode ─────────────────────────────────────
  describe("S1 — satu order, lanjutkan/batalkan", () => {
    it("checkout saldo dengan orderId membayar order YANG ADA (tanpa order baru)", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const o: any = await tx.createOrder(washInput(c) as any, c.user.id);
      const res = await tx.checkout({
        ...(washInput(c) as any),
        orderId: o.id,
      });
      expect(res.orderId).toBe(o.id);
      expect(await prisma.order.count()).toBe(1);
      expect(await balance(c.customer.id)).toBe(30000);
    });

    it("checkout saldo gagal (saldo kurang) → order baru dibatalkan, voucher & mesin dilepas", async () => {
      const c = await createCustomer(prisma, { balance: 1000 });
      const v = await voucherFor(c.customer.id);
      await expect(
        tx.checkout(washInput(c, { voucherCode: v.code }) as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      const o = await prisma.order.findFirstOrThrow();
      expect(o.status).toBe(OrderStatus.CANCELLED);
      expect(
        (await prisma.userVoucher.findUniqueOrThrow({ where: { id: v.id } }))
          .status,
      ).toBe("ACTIVE");
      expect((await prisma.machineBooking.findFirstOrThrow()).status).toBe(
        BookingStatus.CANCELLED,
      );
      expect(await balance(c.customer.id)).toBe(1000);
    });

    it("4 checkout saldo paralel dengan voucher yang sama → satu lunas, saldo terpotong sekali, voucher dipakai sekali", async () => {
      const c = await createCustomer(prisma, { balance: 100000 });
      const v = await voucherFor(c.customer.id);
      const machines = await Promise.all(
        Array.from({ length: 4 }, () => createMachine(prisma, outlet.id)),
      );
      const res = await Promise.allSettled(
        machines.map((m) =>
          tx.checkout(
            washInput(c, { voucherCode: v.code, deviceId: m.id }) as any,
          ),
        ),
      );
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await balance(c.customer.id)).toBe(100000 - 15000);
      expect(
        await prisma.voucherRedemption.count({ where: { status: "APPLIED" } }),
      ).toBe(1);
      expect(
        await prisma.order.count({ where: { status: OrderStatus.PAID } }),
      ).toBe(1);
    });

    it("order belum bayar yang ditinggalkan (tanpa mesin) → dibatalkan scheduler, voucher dikembalikan; tagihan aktif tidak disentuh", async () => {
      const c = await createCustomer(prisma);
      const v = await voucherFor(c.customer.id);
      const stale: any = await tx.createOrder(
        washInput(c, { voucherCode: v.code, deviceId: undefined }) as any,
        c.user.id,
      );
      const active: any = await tx.createOrder(
        washInput(c, { deviceId: undefined }) as any,
        c.user.id,
      );
      await payments.createGatewayPayment(c.user.id, {
        orderId: active.id,
        method: "QRIS",
      } as any);
      await prisma.order.updateMany({ data: { createdAt: inMinutes(-120) } });
      const res = await Promise.all([
        jobs.expireUnpaidOrders(),
        jobs.expireUnpaidOrders(),
      ]);
      expect(res[0].cancelled + res[1].cancelled).toBe(1);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: stale.id } }))
          .status,
      ).toBe(OrderStatus.CANCELLED);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: active.id } }))
          .status,
      ).toBe(OrderStatus.DRAFT);
      expect(
        (await prisma.userVoucher.findUniqueOrThrow({ where: { id: v.id } }))
          .status,
      ).toBe("ACTIVE");
    });

    it("HOLD kedaluwarsa → voucher order ikut dikembalikan", async () => {
      const c = await createCustomer(prisma);
      const v = await voucherFor(c.customer.id);
      const o: any = await tx.createOrder(
        washInput(c, { voucherCode: v.code }) as any,
        c.user.id,
      );
      await prisma.machineBooking.update({
        where: { orderId: o.id },
        data: { expiresAt: inMinutes(-5) },
      });
      await jobs.expireHolds();
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.CANCELLED);
      expect(
        (await prisma.userVoucher.findUniqueOrThrow({ where: { id: v.id } }))
          .status,
      ).toBe("ACTIVE");
    });

    it("dana masuk setelah order (ber-voucher) batal → rekonsiliasi; voucher tidak terpakai lagi", async () => {
      const c = await createCustomer(prisma);
      const v = await voucherFor(c.customer.id);
      const o: any = await tx.createOrder(
        washInput(c, { voucherCode: v.code }) as any,
        c.user.id,
      );
      const p: any = await payments.createGatewayPayment(c.user.id, {
        orderId: o.id,
        method: "QRIS",
      } as any);
      gw.cancelCharge.mockImplementationOnce(async () => "CANCELLED");
      await orders.cancel(
        o.id,
        { cancelReason: "batal" },
        c.user.id,
        c.auth as any,
      );
      await payQr(p.paymentNumber);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.CANCELLED);
      expect(
        (await prisma.paymentReconciliation.findFirstOrThrow()).reason,
      ).toBe("PAID_AFTER_CANCEL");
      expect(
        (await prisma.userVoucher.findUniqueOrThrow({ where: { id: v.id } }))
          .status,
      ).toBe("ACTIVE");
      expect(
        (
          await prisma.payment.findFirstOrThrow({
            where: { paymentNumber: p.paymentNumber },
          })
        ).status,
      ).toBe(PaymentStatus.PAID);
    });
  });

  // ── S4: siklus dryer ──────────────────────────────────────────────────────
  describe("S4 — siklus dryer", () => {
    const dryInput = (
      c: any,
      quantity: number,
      extra: Record<string, unknown> = {},
    ) => ({
      customerId: c.customer.id,
      outletId: outlet.id,
      sourcePlatform: "MOBILE_APP",
      items: [{ serviceId: dryerSvc.id, quantity }],
      deviceId: dryer.id,
      ...extra,
    });

    it("1–3 siklus: harga & durasi dikali di server; booking memegang mesin sepanjang durasi", async () => {
      const c = await createCustomer(prisma);
      for (const q of [1, 2, 3]) {
        const quote: any = await tx.quote(dryInput(c, q) as any);
        expect(quote.finalAmount).toBe(10000 * q);
        expect(quote.estimatedMinutes).toBe(40 * q);
      }
      const o: any = await tx.createOrder(dryInput(c, 3) as any, c.user.id);
      expect(Number(o.totalAmount)).toBe(30000);
      const b = await prisma.machineBooking.findUniqueOrThrow({
        where: { orderId: o.id },
      });
      expect(b.durationMinutes).toBe(120);
      // Slot default 60 menit tidak lagi cukup: jadwal +90 menit bentrok dengan 3 siklus.
      const other = await createCustomer(prisma);
      await expect(
        tx.createOrder(
          dryInput(other, 1, {
            scheduledAt: inMinutes(90).toISOString(),
          }) as any,
          other.user.id,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        tx.createOrder(
          dryInput(other, 1, {
            scheduledAt: inMinutes(130).toISOString(),
          }) as any,
          other.user.id,
        ),
      ).resolves.toBeTruthy();
    });

    it("booking 3 siklus BARU bentrok dengan booking lain yang dijadwalkan dalam durasinya", async () => {
      const a = await createCustomer(prisma);
      const b = await createCustomer(prisma);
      await tx.createOrder(
        dryInput(a, 1, { scheduledAt: inMinutes(90).toISOString() }) as any,
        a.user.id,
      );
      await expect(
        tx.createOrder(dryInput(b, 3) as any, b.user.id),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        tx.createOrder(dryInput(b, 2) as any, b.user.id),
      ).resolves.toBeTruthy(); // 80 menit < 90
    });

    it("jumlah tidak valid ditolak server: dryer 4 / 1.5, mesin cuci 2, nol, negatif", async () => {
      const c = await createCustomer(prisma);
      await expect(tx.quote(dryInput(c, 4) as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(tx.quote(dryInput(c, 1.5) as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        tx.quote(
          washInput(c, {
            items: [{ serviceId: washSvc.id, quantity: 2 }],
          }) as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(tx.quote(dryInput(c, 0) as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        tx.createOrder(dryInput(c, -1) as any, c.user.id),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await prisma.order.count()).toBe(0);
    });

    it("pratinjau app (/pricing/calculate) = quote = total order untuk dryer 1–3 siklus + happy hour + voucher", async () => {
      const c = await createCustomer(prisma);
      await prisma.happyHourRule.create({
        data: {
          name: "HH fixed",
          outletId: outlet.id,
          daysOfWeek: "1,2,3,4,5,6,7",
          startTime: "00:00",
          endTime: "23:59",
          adjustmentType: "FIXED_OFF",
          value: new Prisma.Decimal(1000),
        },
      });
      const templateId = (await voucherFor(c.customer.id)).templateId;
      for (const q of [1, 2, 3]) {
        const v = await prisma.userVoucher.create({
          data: {
            templateId,
            customerId: c.customer.id,
            segment: "RETAIL",
            code: `V-${q}-${Date.now()}`,
          },
        });
        const input = dryInput(c, q, { voucherCode: v.code });
        const p: any = await preview.calculate({
          ...input,
          items: input.items,
        } as any);
        const quote: any = await tx.quote(input as any);
        expect(p.finalAmount).toBe(quote.finalAmount);
        expect(p.estimatedMinutes).toBe(40 * q);
        const o: any = await tx.createOrder(input as any, c.user.id);
        expect(Number(o.totalAmount)).toBe(p.finalAmount);
        await orders.cancel(
          o.id,
          { cancelReason: "uji" },
          c.user.id,
          c.auth as any,
        );
      }
    });

    it("dryer 2 siklus + happy hour dibayar QRIS: nominal = harga server", async () => {
      const c = await createCustomer(prisma);
      await happyHour();
      const o: any = await tx.createOrder(dryInput(c, 2) as any, c.user.id);
      const p: any = await payments.createGatewayPayment(c.user.id, {
        orderId: o.id,
        method: "QRIS",
      } as any);
      expect(p.amount).toBe(16000); // 20.000 − 20%
    });
  });
});
