/** Mode MANUAL mesin (belum terintegrasi IoT) — kondisi diatur admin. */
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

describe("Mesin mode MANUAL (tanpa IoT) — PostgreSQL nyata", () => {
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

  const manualMachine = async (status = "OFFLINE") =>
    prisma.iotDevice.create({
      data: {
        outletId: outlet.id,
        deviceCode: `MAN-${Math.random().toString(36).slice(2, 8)}`,
        deviceType: "WASHING_MACHINE",
        name: "Washer Manual",
        status,
        controlMode: "MANUAL",
      },
    });

  it("mesin manual yang belum pernah terhubung tampil TERSEDIA & bisa dipesan; mesin IoT offline tetap ditolak", async () => {
    const man = await manualMachine("OFFLINE");
    const iotOff = await prisma.iotDevice.create({
      data: { outletId: outlet.id, deviceCode: "IOT-OFF", deviceType: "WASHING_MACHINE", name: "IoT Offline", status: "OFFLINE" },
    });
    const list: any = await bookings.listOutletMachines(outlet.id);
    const byId = (id: string) => list.machines.find((m: any) => (m.deviceId ?? m.id) === id)?.status;
    expect(byId(man.id)).toBe("AVAILABLE");
    expect(byId(iotOff.id)).toBe("OFFLINE");
    const c = await createCustomer(prisma, { balance: 50000 });
    await expect(order(c, man.id)).resolves.toBeTruthy();
    const c2 = await createCustomer(prisma, { balance: 50000 });
    await expect(order(c2, iotOff.id)).rejects.toThrow("Mesin sedang tidak tersedia");
  });

  it("kondisi manual MAINTENANCE → tampil MAINTENANCE & order ditolak", async () => {
    const man = await manualMachine("MAINTENANCE");
    const list: any = await bookings.listOutletMachines(outlet.id);
    expect(list.machines.find((m: any) => (m.deviceId ?? m.id) === man.id)?.status).toBe("MAINTENANCE");
    const c = await createCustomer(prisma, { balance: 50000 });
    await expect(order(c, man.id)).rejects.toThrow("Mesin sedang tidak tersedia");
  });

  it("scan QR → tanpa MQTT, booking langsung IN_USE, pesan minta nyalakan manual; scan ulang tidak membuat perintah baru", async () => {
    const man = await manualMachine();
    const c = await createCustomer(prisma, { balance: 50000 });
    const o = await paidOrder(c, man.id);
    const res: any = await bookings.verifyByDeviceCode(c.user.id, man.deviceCode);
    expect(res.message).toMatch(/nyalakan Washer Manual/);
    expect(res.activation.manual).toBe(true);
    expect(mqtt.publishCommand).not.toHaveBeenCalled();
    const b = await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: o.id } });
    expect(b.status).toBe(BookingStatus.IN_USE);
    expect(b.startedAt).not.toBeNull();
    const again: any = await bookings.verifyByDeviceCode(c.user.id, man.deviceCode);
    expect(again.status).toBe(BookingStatus.IN_USE);
    expect(await prisma.iotCommand.count({ where: { orderId: o.id } })).toBe(1);
    const st: any = await iot.getMachineStatusForOrder(o.id);
    expect(st.commandStatus).toBe("MANUAL");
  });

  it("perintah manual tidak dicap TIMEOUT oleh pemulihan; booking tidak menjadi 'dibayar tidak dipakai'", async () => {
    const man = await manualMachine();
    const c = await createCustomer(prisma, { balance: 50000 });
    const o = await paidOrder(c, man.id);
    await bookings.verifyByDeviceCode(c.user.id, man.deviceCode);
    await prisma.iotCommand.updateMany({ where: { orderId: o.id }, data: { sentAt: inMinutes(-30) } });
    await prisma.machineBooking.update({ where: { orderId: o.id }, data: { expiresAt: inMinutes(-5) } });
    await jobs.recoverStuck();
    await jobs.completeBookings();
    const cmd = await prisma.iotCommand.findFirstOrThrow({ where: { orderId: o.id } });
    expect(cmd.status).toBe("RUNNING");
    expect(await prisma.paymentReconciliation.count({ where: { orderId: o.id } })).toBe(0);
  });

  it("selesai otomatis sesuai estimasi durasi + tenggang (bukan 90 menit); 3 worker paralel → sekali", async () => {
    const man = await manualMachine();
    const c = await createCustomer(prisma, { balance: 50000 });
    const o = await paidOrder(c, man.id);
    await bookings.verifyByDeviceCode(c.user.id, man.deviceCode);
    const b = await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: o.id } });
    const duration = b.durationMinutes ?? 90;
    // Belum lewat durasi + tenggang → belum selesai.
    await prisma.machineBooking.update({ where: { orderId: o.id }, data: { startedAt: inMinutes(-(duration + 2)) } });
    await jobs.completeBookings();
    expect((await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: o.id } })).status).toBe(BookingStatus.IN_USE);
    // Lewat durasi + tenggang (5) → selesai.
    await prisma.machineBooking.update({ where: { orderId: o.id }, data: { startedAt: inMinutes(-(duration + 6)) } });
    const results = await workers(3, () => jobs.completeBookings());
    expect(results.reduce((s, r) => s + r.completed, 0)).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(OrderStatus.COMPLETED);
    expect((await prisma.iotCommand.findFirstOrThrow({ where: { orderId: o.id } })).status).toBe("COMPLETED");
    const log = await prisma.orderStatusLog.findFirstOrThrow({ where: { orderId: o.id, status: OrderStatus.COMPLETED } });
    expect(log.notes).toMatch(/mode manual/);
    // Mesin tersedia lagi.
    const list: any = await bookings.listOutletMachines(outlet.id);
    expect(list.machines.find((m: any) => (m.deviceId ?? m.id) === man.id)?.status).toBe("AVAILABLE");
  });

  it("mesin IoT tetap memakai alur lama (MQTT START dipublikasi)", async () => {
    const m = await createMachine(prisma, outlet.id);
    const c = await createCustomer(prisma, { balance: 50000 });
    await paidOrder(c, m.id);
    await bookings.verifyByDeviceCode(c.user.id, m.deviceCode);
    expect(mqtt.publishCommand).toHaveBeenCalledTimes(1);
  });
});
