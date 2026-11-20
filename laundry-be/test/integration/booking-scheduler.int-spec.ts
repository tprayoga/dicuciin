/**
 * Batch 2 (T9, S2) — job terjadwal pada PostgreSQL NYATA, termasuk beberapa
 * "worker" yang menjalankan job yang sama secara paralel (pemanggilan service
 * konkuren = setara beberapa instance BullMQ; kunci yang diuji ada di DB).
 * MQTT & gateway = tiruan. BUKAN uji mesin IoT fisik.
 */
import { Test } from "@nestjs/testing";
import { BookingStatus, OrderStatus, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { OrdersService } from "../../src/modules/orders/orders.service";
import { BookingsService } from "../../src/modules/bookings/bookings.service";
import { IotService } from "../../src/modules/iot/iot.service";
import { PaymentsService } from "../../src/modules/payments/payments.service";
import { PAYMENT_GATEWAY } from "../../src/modules/payments/gateway/payment-gateway.interface";
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

describe("Batch 2 — scheduler booking (PostgreSQL nyata, multi-worker)", () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let bookings: BookingsService;
  let iot: IotMachineService;
  let jobs: BookingMaintenanceService;
  const gw = controllableGateway();
  const mqtt = { publishCommand: jest.fn(), eventHandler: undefined as any };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        OrdersService,
        BookingsService,
        IotService,
        PaymentsService,
        IotMachineService,
        WalletLedgerService,
        BookingMaintenanceService,
        // Batch 4: sapuan top-up diuji di wallet-topup.int-spec.
        { provide: WalletTopupService, useValue: { syncPending: jest.fn() } },
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
    bookings = moduleRef.get(BookingsService);
    iot = moduleRef.get(IotMachineService);
    jobs = moduleRef.get(BookingMaintenanceService);
  });
  afterAll(() => prisma.$disconnect());

  let outlet: any, service: any;
  beforeEach(async () => {
    await resetDb(prisma);
    gw.charges.clear();
    gw.cancelCharge.mockClear();
    mqtt.publishCommand.mockClear();
    outlet = await createOutlet(prisma);
    service = await createServiceWithPrice(prisma, outlet.id, 10000);
  });

  const order = async (c: any, machineId: string) =>
    (await orders.create(
      {
        customerId: c.customer.id,
        outletId: outlet.id,
        sourcePlatform: "MOBILE_APP",
        items: [{ serviceId: service.id, quantity: 1 }],
        deviceId: machineId,
      } as any,
      c.user.id,
    )) as any;
  const expireBooking = (orderId: string, minutes = -5) =>
    prisma.machineBooking.update({
      where: { orderId },
      data: { expiresAt: inMinutes(minutes) },
    });
  const workers = <T>(n: number, fn: () => Promise<T>) =>
    Promise.all(Array.from({ length: n }, fn));
  const paidOrder = async (c: any, machineId: string) => {
    const o = await order(c, machineId);
    await payments.payOrderWithWallet(c.user.id, o.id);
    return o;
  };

  // ── A. HOLD kedaluwarsa ───────────────────────────────────────────────────
  describe("A. HOLD kedaluwarsa", () => {
    it("HOLD lewat batas → EXPIRED, order CANCELLED, tagihan aktif EXPIRED + di-expire di gateway; mesin bisa dipesan lagi", async () => {
      const c = await createCustomer(prisma);
      const m = await createMachine(prisma, outlet.id);
      const o = await order(c, m.id);
      const p: any = await payments.createGatewayPayment(c.user.id, {
        orderId: o.id,
        method: "QRIS",
      } as any);
      await expireBooking(o.id);
      await prisma.payment.update({
        where: { paymentNumber: p.paymentNumber },
        data: { expiresAt: inMinutes(-5) },
      });
      const r = await jobs.expireHolds();
      expect(r.expired).toBe(1);
      expect(
        (
          await prisma.machineBooking.findUniqueOrThrow({
            where: { orderId: o.id },
          })
        ).status,
      ).toBe(BookingStatus.EXPIRED);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.CANCELLED);
      expect(
        (
          await prisma.payment.findUniqueOrThrow({
            where: { paymentNumber: p.paymentNumber },
          })
        ).status,
      ).toBe(PaymentStatus.EXPIRED);
      expect(gw.cancelCharge).toHaveBeenCalledWith(p.paymentNumber);
      const c2 = await createCustomer(prisma);
      await expect(order(c2, m.id)).resolves.toBeTruthy();
    });

    it("HOLD dengan tagihan yang MASIH berlaku tidak disentuh; HOLD order yang sudah dibayar tidak disentuh", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const m1 = await createMachine(prisma, outlet.id);
      const m2 = await createMachine(prisma, outlet.id);
      const o1 = await order(c, m1.id);
      await payments.createGatewayPayment(c.user.id, {
        orderId: o1.id,
        method: "QRIS",
      } as any);
      await expireBooking(o1.id);
      const o2 = await paidOrder(c, m2.id);
      await prisma.machineBooking.update({
        where: { orderId: o2.id },
        data: { status: "HOLD", expiresAt: inMinutes(-5) },
      });
      const r = await jobs.expireHolds();
      expect(r.expired).toBe(0);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o1.id } })).status,
      ).toBe(OrderStatus.DRAFT);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o2.id } })).status,
      ).toBe(OrderStatus.PAID);
    });

    it("4 worker paralel atas 15 HOLD kedaluwarsa → setiap booking diproses tepat sekali", async () => {
      const ids: string[] = [];
      for (let i = 0; i < 15; i++) {
        const c = await createCustomer(prisma);
        const m = await createMachine(prisma, outlet.id);
        const o = await order(c, m.id);
        await expireBooking(o.id);
        ids.push(o.id);
      }
      const results = await workers(4, () => jobs.expireHolds());
      expect(results.reduce((s, r) => s + r.expired, 0)).toBe(15);
      expect(
        await prisma.machineBooking.count({
          where: { status: BookingStatus.EXPIRED },
        }),
      ).toBe(15);
      expect(
        await prisma.orderStatusLog.count({
          where: { orderId: { in: ids }, status: OrderStatus.CANCELLED },
        }),
      ).toBe(15);
    });

    it("pembayaran tiba SETELAH HOLD kedaluwarsa → order tetap CANCELLED, rekonsiliasi PAID_AFTER_CANCEL, mesin tidak menyala", async () => {
      const c = await createCustomer(prisma);
      const m = await createMachine(prisma, outlet.id);
      const o = await order(c, m.id);
      const p: any = await payments.createGatewayPayment(c.user.id, {
        orderId: o.id,
        method: "QRIS",
      } as any);
      await expireBooking(o.id);
      await prisma.payment.update({
        where: { paymentNumber: p.paymentNumber },
        data: { expiresAt: inMinutes(-5) },
      });
      gw.cancelCharge.mockImplementationOnce(async () => "PAID"); // provider: sudah dibayar
      await jobs.expireHolds();
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.CANCELLED);
      const rec = await prisma.paymentReconciliation.findMany({
        where: { orderId: o.id },
      });
      expect(rec.map((r) => r.reason)).toEqual(["PAID_AFTER_CANCEL"]);
      expect(await prisma.iotCommand.count()).toBe(0);
    });
  });

  // ── B. Penyelesaian booking ──────────────────────────────────────────────
  describe("B. penyelesaian booking", () => {
    async function inUse(minutesAgo: number) {
      const c = await createCustomer(prisma, { balance: 50000 });
      const m = await createMachine(prisma, outlet.id);
      const o = await paidOrder(c, m.id);
      await bookings.verifyByDeviceCode(c.user.id, m.deviceCode);
      const cmd = await prisma.iotCommand.findFirstOrThrow({
        where: { orderId: o.id },
      });
      await iot.handleDeviceEvent({
        deviceCode: m.deviceCode,
        eventType: "RUNNING",
        commandId: cmd.id,
      } as any);
      await prisma.machineBooking.update({
        where: { orderId: o.id },
        data: { startedAt: inMinutes(-minutesAgo) },
      });
      return { c, m, o };
    }

    it("event COMPLETED dari mesin → booking DONE + order COMPLETED (satu transaksi)", async () => {
      const { m, o } = await inUse(30);
      await iot.handleDeviceEvent({
        deviceCode: m.deviceCode,
        eventType: "COMPLETED",
      } as any);
      expect(
        (
          await prisma.machineBooking.findUniqueOrThrow({
            where: { orderId: o.id },
          })
        ).status,
      ).toBe(BookingStatus.DONE);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.COMPLETED);
    });

    it("melewati batas durasi tanpa event baru → DONE (fallback) + audit; 3 worker paralel → satu log COMPLETED", async () => {
      const { o } = await inUse(200);
      await prisma.iotEvent.updateMany({
        data: { createdAt: inMinutes(-190) },
      }); // RUNNING lama
      const results = await workers(3, () => jobs.completeBookings());
      expect(results.reduce((s, r) => s + r.completed, 0)).toBe(1);
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status,
      ).toBe(OrderStatus.COMPLETED);
      expect(
        await prisma.orderStatusLog.count({
          where: { orderId: o.id, status: OrderStatus.COMPLETED },
        }),
      ).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: { action: "OPS_BOOKING_COMPLETED_FALLBACK" },
        }),
      ).toBe(1);
    });

    it("mesin masih melapor RUNNING → TIDAK diselesaikan, ditandai macet sekali walau job berulang", async () => {
      const { o } = await inUse(200); // event RUNNING baru saja (segar)
      await workers(3, () => jobs.completeBookings());
      await jobs.completeBookings();
      expect(
        (
          await prisma.machineBooking.findUniqueOrThrow({
            where: { orderId: o.id },
          })
        ).status,
      ).toBe(BookingStatus.IN_USE);
      expect(
        await prisma.auditLog.count({ where: { action: "OPS_BOOKING_STUCK" } }),
      ).toBe(1);
    });

    it("RESERVED dibayar tapi tak dipakai → EXPIRED + rekonsiliasi PAID_NOT_USED sekali (paralel); tidak bisa dipakai lagi", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const m = await createMachine(prisma, outlet.id);
      const o = await paidOrder(c, m.id);
      await expireBooking(o.id);
      const res = await workers(3, () => jobs.completeBookings());
      expect(res.reduce((s, r) => s + r.noShow, 0)).toBe(1);
      const rec = await prisma.paymentReconciliation.findMany({
        where: { orderId: o.id },
      });
      expect(rec).toHaveLength(1);
      expect(rec[0]).toMatchObject({ reason: "PAID_NOT_USED", status: "OPEN" });
      await expect(
        bookings.verifyByDeviceCode(c.user.id, m.deviceCode),
      ).rejects.toThrow();
      expect(
        await prisma.iotCommand.count({ where: { command: START_MACHINE } }),
      ).toBe(0);
    });

    it("RESERVED dengan START aktif tidak dikedaluwarsakan (mesin mungkin menyala)", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const m = await createMachine(prisma, outlet.id);
      const o = await paidOrder(c, m.id);
      await bookings.verifyByDeviceCode(c.user.id, m.deviceCode);
      await expireBooking(o.id);
      await jobs.completeBookings();
      expect(
        (
          await prisma.machineBooking.findUniqueOrThrow({
            where: { orderId: o.id },
          })
        ).status,
      ).toBe(BookingStatus.RESERVED);
    });
  });

  // ── C. Pemulihan kegagalan ───────────────────────────────────────────────
  describe("C. pemulihan", () => {
    it("START tertinggal PENDING → dipublikasikan ulang TEPAT SEKALI oleh 4 worker paralel", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const m = await createMachine(prisma, outlet.id);
      const o = await paidOrder(c, m.id);
      await iot.createStartMachineCommand(
        { orderId: o.id },
        { publish: false },
      );
      await prisma.iotCommand.updateMany({
        data: { createdAt: inMinutes(-5) },
      });
      await workers(4, () => jobs.recoverStuck());
      expect(mqtt.publishCommand).toHaveBeenCalledTimes(1);
      expect(
        (await prisma.iotCommand.findFirstOrThrow({ where: { orderId: o.id } }))
          .status,
      ).toBe("PUBLISHED");
    });

    it("START tanpa ACK → TIMEOUT + audit; boleh dicoba ulang; RUNNING terlambat tetap diterima", async () => {
      const c = await createCustomer(prisma, { balance: 50000 });
      const m = await createMachine(prisma, outlet.id);
      const o = await paidOrder(c, m.id);
      await bookings.verifyByDeviceCode(c.user.id, m.deviceCode);
      await prisma.iotCommand.updateMany({ data: { sentAt: inMinutes(-10) } });
      const r = await jobs.recoverStuck();
      expect(r.startsTimedOut).toBe(1);
      expect(
        await prisma.auditLog.count({ where: { action: "OPS_START_TIMEOUT" } }),
      ).toBe(1);
      await bookings.verifyByDeviceCode(c.user.id, m.deviceCode); // coba ulang
      expect(await prisma.iotCommand.count({ where: { orderId: o.id } })).toBe(
        2,
      );
      const first = await prisma.iotCommand.findFirstOrThrow({
        where: { orderId: o.id, status: "TIMEOUT" },
      });
      await iot.handleDeviceEvent({
        deviceCode: m.deviceCode,
        eventType: "RUNNING",
        commandId: first.id,
      } as any);
      expect(
        (
          await prisma.machineBooking.findUniqueOrThrow({
            where: { orderId: o.id },
          })
        ).status,
      ).toBe(BookingStatus.IN_USE);
    });

    it("pembayaran PENDING kedaluwarsa disinkronkan: provider PAID → lunas; provider PENDING → EXPIRED; paralel aman", async () => {
      const a = await createCustomer(prisma);
      const b = await createCustomer(prisma);
      const oa = await order(a, (await createMachine(prisma, outlet.id)).id);
      const ob = await order(b, (await createMachine(prisma, outlet.id)).id);
      const pa: any = await payments.createGatewayPayment(a.user.id, {
        orderId: oa.id,
        method: "QRIS",
      } as any);
      const pb: any = await payments.createGatewayPayment(b.user.id, {
        orderId: ob.id,
        method: "QRIS",
      } as any);
      await prisma.payment.updateMany({ data: { expiresAt: inMinutes(-10) } });
      gw.charges.set(pa.paymentNumber, "PAID");
      await workers(3, () => jobs.recoverStuck());
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { id: oa.id } })).status,
      ).toBe(OrderStatus.PAID);
      expect(
        await prisma.orderStatusLog.count({
          where: { orderId: oa.id, status: OrderStatus.PAID },
        }),
      ).toBe(1);
      expect(
        (
          await prisma.payment.findUniqueOrThrow({
            where: { paymentNumber: pb.paymentNumber },
          })
        ).status,
      ).toBe(PaymentStatus.EXPIRED);
    });
  });
});
