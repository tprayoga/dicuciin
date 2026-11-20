/**
 * Batch 6 — jam operasional (T8), mesin & layanan (S3), tier (S6),
 * notifikasi (R1), ulasan (S8), tukar poin (R3) pada PostgreSQL nyata.
 */
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookingStatus, MembershipTier, OrderStatus, Prisma, UserRole, UserSegment, VoucherType } from '@prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { PaymentsService } from '../../src/modules/payments/payments.service';
import { PAYMENT_GATEWAY } from '../../src/modules/payments/gateway/payment-gateway.interface';
import { IotMachineService } from '../../src/modules/iot/iot-machine.service';
import { IotMqttService } from '../../src/modules/iot/iot-mqtt.service';
import { IotService } from '../../src/modules/iot/iot.service';
import { WalletLedgerService } from '../../src/modules/wallets/wallet-ledger.service';
import { PromosService } from '../../src/modules/promos/promos.service';
import { PointService } from '../../src/modules/points/point.service';
import { VoucherService } from '../../src/modules/vouchers/voucher.service';
import { MembershipTierService } from '../../src/modules/memberships/membership-tier.service';
import { B2BPartnerService } from '../../src/modules/partners/b2b-partner.service';
import { CampaignService } from '../../src/modules/campaigns/campaign.service';
import { LoyaltyConfigService } from '../../src/modules/loyalty-config/loyalty-config.service';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { MobileMemberService } from '../../src/modules/mobile/mobile-member.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { ReviewsService } from '../../src/modules/reviews/reviews.service';
import { completeBookingForOrder } from '../../src/modules/bookings/booking-lifecycle';
import {
  controllableGateway,
  createCustomer,
  createMachine,
  createOutlet,
  createServiceWithPrice,
  resetDb,
} from './helpers';

/** Besok pada jam WIB tertentu. */
function tomorrowWib(hhmm: string) {
  const d = new Date(Date.now() + 7 * 3600_000 + 24 * 3600_000);
  const day = d.toISOString().slice(0, 10);
  return new Date(`${day}T${hhmm}:00+07:00`);
}

describe('Batch 6 — fitur aplikasi (PostgreSQL nyata)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let bookings: BookingsService;
  let iot: IotService;
  let member: MobileMemberService;
  let notifications: NotificationsService;
  let reviews: ReviewsService;
  let points: PointService;
  const gw = controllableGateway();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        OrdersService,
        PaymentsService,
        IotMachineService,
        IotService,
        BookingsService,
        WalletLedgerService,
        MobileMemberService,
        NotificationsService,
        ReviewsService,
        PointService,
        VoucherService,
        { provide: IotMqttService, useValue: { publishCommand: jest.fn() } },
        { provide: PAYMENT_GATEWAY, useValue: gw },
        { provide: PromosService, useValue: { evaluatePromo: jest.fn(), commitUsage: jest.fn() } },
        {
          provide: MembershipTierService,
          useValue: {
            ensureStatus: jest.fn(async () => ({ currentTier: null })),
            getBenefits: jest.fn(async () => ({ pointMultiplier: 1, cashbackRate: 0 })),
            recordSuccessfulTransaction: jest.fn(),
          },
        },
        { provide: B2BPartnerService, useValue: { recordSuccessfulTransaction: jest.fn() } },
        { provide: CampaignService, useValue: { qualifyReferralOnFirstTransaction: jest.fn() } },
        { provide: LoyaltyConfigService, useValue: { pointEarnRate: 1000 } },
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    orders = moduleRef.get(OrdersService);
    payments = moduleRef.get(PaymentsService);
    bookings = moduleRef.get(BookingsService);
    iot = moduleRef.get(IotService);
    member = moduleRef.get(MobileMemberService);
    notifications = moduleRef.get(NotificationsService);
    reviews = moduleRef.get(ReviewsService);
    points = moduleRef.get(PointService);
  });
  afterAll(() => prisma.$disconnect());

  let outlet: any, machine: any, service: any;
  beforeEach(async () => {
    await resetDb(prisma);
    gw.charges.clear();
    outlet = await createOutlet(prisma);
    machine = await createMachine(prisma, outlet.id);
    service = await createServiceWithPrice(prisma, outlet.id, 10000);
  });

  const newOrder = (c: any, extra: Record<string, unknown> = {}, svcId = service.id, deviceId = machine.id) =>
    orders.create(
      {
        customerId: c.customer.id,
        outletId: outlet.id,
        sourcePlatform: 'MOBILE_APP',
        items: [{ serviceId: svcId, quantity: 1, machineType: 'WASHER' }],
        deviceId,
        ...extra,
      } as any,
      c.user.id,
    ) as Promise<any>;

  async function pay(c: any, orderId: string) {
    const p: any = await payments.createGatewayPayment(c.user.id, { orderId, method: 'QRIS' } as any);
    gw.charges.set(p.paymentNumber, 'PAID');
    const row = await prisma.payment.findUniqueOrThrow({ where: { paymentNumber: p.paymentNumber } });
    await payments.handleWebhook({ externalId: row.externalId!, status: 'PAID' } as any);
    return p.paymentNumber as string;
  }

  // ===================================================================== T8
  describe('T8 — jam operasional outlet', () => {
    beforeEach(() => prisma.outlet.update({ where: { id: outlet.id }, data: { openTime: '07:00', closeTime: '22:00' } }));

    it('order booking terjadwal di luar jam operasional → 400; di dalam → booking HOLD', async () => {
      const c = await createCustomer(prisma);
      await expect(newOrder(c, { scheduledAt: tomorrowWib('22:30').toISOString() })).rejects.toThrow(/jam operasional/);
      await expect(newOrder(c, { scheduledAt: tomorrowWib('06:30').toISOString() })).rejects.toBeInstanceOf(BadRequestException);
      expect(await prisma.order.count()).toBe(0);
      const ok = await newOrder(c, { scheduledAt: tomorrowWib('10:00').toISOString() });
      expect(ok.booking.status).toBe(BookingStatus.HOLD);
    });

    it('reservasi lama (POST /bookings) juga ditolak di luar jam', async () => {
      const c = await createCustomer(prisma);
      await expect(
        bookings.reserve(c.user.id, { deviceId: machine.id }, undefined, tomorrowWib('23:00').toISOString()),
      ).rejects.toThrow(/jam operasional/);
    });

    it('outlet tanpa jam → tanpa batasan (perilaku lama)', async () => {
      await prisma.outlet.update({ where: { id: outlet.id }, data: { openTime: null, closeTime: null } });
      const c = await createCustomer(prisma);
      const o = await newOrder(c, { scheduledAt: tomorrowWib('23:30').toISOString() });
      expect(o.booking).toBeTruthy();
    });

    it('daftar mesin membawa jam operasional untuk slot di aplikasi', async () => {
      const r: any = await bookings.listOutletMachines(outlet.id);
      expect(r.operatingHours).toEqual(
        expect.objectContaining({ openTime: '07:00', closeTime: '22:00', utcOffsetMinutes: 420 }),
      );
      expect(typeof r.operatingHours.openNow).toBe('boolean');
    });
  });

  // ===================================================================== S3
  describe('S3 — kapasitas & layanan per mesin', () => {
    it('mesin tanpa data → capacity/service null; dengan data → harga & durasi outlet', async () => {
      let r: any = await bookings.listOutletMachines(outlet.id);
      expect(r.machines[0]).toEqual(expect.objectContaining({ capacityKg: null, service: null }));

      await iot.updateDevice(machine.id, { capacityKg: 12, serviceId: service.id } as any);
      r = await bookings.listOutletMachines(outlet.id);
      expect(r.machines[0]).toEqual(
        expect.objectContaining({
          capacityKg: 12,
          service: expect.objectContaining({ serviceId: service.id, price: 10000, estimateMinutes: 25, unit: 'CYCLE' }),
        }),
      );
    });

    it('layanan tanpa harga aktif di outlet → service null (aplikasi tidak menampilkan harga salah)', async () => {
      await iot.updateDevice(machine.id, { serviceId: service.id } as any);
      await prisma.servicePrice.updateMany({ where: { serviceId: service.id }, data: { isActive: false } });
      const r: any = await bookings.listOutletMachines(outlet.id);
      expect(r.machines[0].service).toBeNull();
    });

    it('order dengan layanan yang bukan layanan mesin → 400, tanpa order', async () => {
      const other = await createServiceWithPrice(prisma, outlet.id, 5000);
      await iot.updateDevice(machine.id, { serviceId: service.id } as any);
      const c = await createCustomer(prisma);
      await expect(newOrder(c, {}, other.id)).rejects.toThrow(/tidak sesuai dengan mesin/);
      expect(await prisma.order.count()).toBe(0);
      const ok = await newOrder(c, {}, service.id);
      expect(ok.booking).toBeTruthy();
    });

    it('layanan pengering tidak bisa dipasang di mesin cuci (dan sebaliknya)', async () => {
      const dryerSvc = await prisma.service.create({
        data: { name: 'Kering', serviceType: 'DRY', machineType: 'DRYER', estimateMinutes: 40 },
      });
      await expect(iot.updateDevice(machine.id, { serviceId: dryerSvc.id } as any)).rejects.toBeInstanceOf(BadRequestException);
      const dryer = await createMachine(prisma, outlet.id, 'DRYER_MACHINE');
      await expect(iot.updateDevice(dryer.id, { serviceId: service.id } as any)).rejects.toBeInstanceOf(BadRequestException);
      await expect(iot.updateDevice(dryer.id, { serviceId: dryerSvc.id } as any)).resolves.toBeTruthy();
    });
  });

  // ===================================================================== S6
  it('S6 — tier tertinggi: nextTier null (bukan "Silver")', async () => {
    await prisma.membershipTierConfig.createMany({
      data: [
        { tier: MembershipTier.SILVER, name: 'Silver', level: 1, thresholdSpending: new Prisma.Decimal(0), isActive: true } as any,
        { tier: MembershipTier.GOLD, name: 'Gold', level: 2, thresholdSpending: new Prisma.Decimal(500000), isActive: true } as any,
      ],
    });
    const c = await createCustomer(prisma);
    await prisma.userMembershipStatus.create({
      data: { customerId: c.customer.id, segment: UserSegment.RETAIL, currentTier: MembershipTier.GOLD } as any,
    });
    const s: any = await member.getSummary(c.user.id);
    expect(s.membership.tier).toBe('Gold');
    expect(s.membership.nextTier).toBeNull();
    expect(s.membership.tierProgressPercent).toBe(100);
  });

  // ============================================================= R1 + S8
  describe('R1 — notifikasi dalam aplikasi & S8 — ulasan', () => {
    it('order lunas → 1 notifikasi ORDER_PAID walau webhook diulang; selesai → ORDER_COMPLETED (minta ulasan)', async () => {
      const c = await createCustomer(prisma);
      const o = await newOrder(c);
      const pn = await pay(c, o.id);
      const row = await prisma.payment.findUniqueOrThrow({ where: { paymentNumber: pn } });
      await Promise.all([
        payments.handleWebhook({ externalId: row.externalId!, status: 'PAID' } as any),
        payments.handleWebhook({ externalId: row.externalId!, status: 'PAID' } as any),
      ]);
      let list = await notifications.listForUser(c.user.id);
      expect(list.items.map((n: any) => n.type)).toEqual(['ORDER_PAID']);
      expect(list.unreadCount).toBe(1);

      await Promise.all([
        completeBookingForOrder(prisma, o.id, 'DURATION_FALLBACK'),
        completeBookingForOrder(prisma, o.id, 'DURATION_FALLBACK'),
      ]);
      list = await notifications.listForUser(c.user.id);
      expect(list.items.map((n: any) => n.type).sort()).toEqual(['ORDER_COMPLETED', 'ORDER_PAID']);
      const completed: any = list.items.find((n: any) => n.type === 'ORDER_COMPLETED');
      expect(completed.data).toEqual(expect.objectContaining({ orderId: o.id, reviewRequested: true }));
    });

    it('baca notifikasi: milik sendiri saja; read-all', async () => {
      const a = await createCustomer(prisma);
      const b = await createCustomer(prisma);
      const o = await newOrder(a);
      await pay(a, o.id);
      const [n] = (await notifications.listForUser(a.user.id)).items;
      await expect(notifications.markRead(b.user.id, n.id)).rejects.toBeInstanceOf(NotFoundException);
      await notifications.markRead(a.user.id, n.id);
      expect((await notifications.listForUser(a.user.id)).unreadCount).toBe(0);
      expect((await notifications.markAllRead(a.user.id)).updated).toBe(0);
      expect((await notifications.listForUser(b.user.id)).items).toHaveLength(0);
    });

    it('order tamu kiosk (tanpa customer) tidak membuat notifikasi', async () => {
      const kiosk = await prisma.kiosk.create({ data: { outletId: outlet.id, name: 'K', kioskCode: `K-${Date.now()}` } as any });
      const o: any = await orders.create(
        { outletId: outlet.id, sourcePlatform: 'KIOSK', kioskId: kiosk.id, items: [{ serviceId: service.id, quantity: 1 }] } as any,
        undefined as any,
      );
      await prisma.order.update({ where: { id: o.id }, data: { status: OrderStatus.WAITING_PAYMENT } });
      expect(await prisma.notification.count()).toBe(0);
    });

    it('S8 — pelanggan tidak bisa mengulas order yang belum dibayar / milik orang lain; setelah lunas bisa', async () => {
      const c = await createCustomer(prisma);
      const other = await createCustomer(prisma);
      const o = await newOrder(c);
      await expect(reviews.create({ orderId: o.id, rating: 5 } as any, c.user.id)).rejects.toThrow(/setelah order dibayar/);
      await pay(c, o.id);
      await expect(reviews.create({ orderId: o.id, rating: 5 } as any, other.user.id)).rejects.toThrow(/milik orang lain/);
      await expect(reviews.create({ orderId: o.id, rating: 5, comment: 'Bersih' } as any, c.user.id)).resolves.toBeTruthy();
    });
  });

  // ===================================================================== R3
  describe('R3 — tukar poin dengan voucher', () => {
    const template = (patch: Record<string, unknown> = {}) =>
      prisma.voucherTemplate.create({
        data: {
          code: `V${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          name: 'Diskon 5rb',
          voucherType: VoucherType.NOMINAL_DISCOUNT,
          value: new Prisma.Decimal(5000),
          pointCost: 100,
          perUserLimit: 1,
          segment: UserSegment.RETAIL,
          ...patch,
        } as any,
      });
    const withPoints = async (pts: number) => {
      const c = await createCustomer(prisma);
      await prisma.wallet.update({ where: { id: c.wallet.id }, data: { pointBalance: pts } });
      return c;
    };
    const redeem = (c: any, templateId: string) =>
      points.redeemVoucherForUser({ walletId: c.wallet.id, templateId } as any, { userId: c.user.id, role: UserRole.CUSTOMER } as any);

    it('katalog: hanya yang relevan tampil, dengan status & alasan', async () => {
      const ok = await template();
      const gold = await template({ tierRestriction: MembershipTier.GOLD });
      await template({ isActive: false });
      await template({ endDate: new Date(Date.now() - 86_400_000) });
      await template({ segment: UserSegment.B2B });
      await template({ pointCost: null });
      const expensive = await template({ pointCost: 1000 });
      const c = await withPoints(150);
      const r: any = await member.getRewards(c.user.id);
      const byId = new Map(r.items.map((i: any) => [i.templateId, i]));
      expect(r.pointBalance).toBe(150);
      expect(r.items).toHaveLength(3);
      expect(byId.get(ok.id)).toEqual(expect.objectContaining({ canRedeem: true, reason: null }));
      expect(byId.get(gold.id)).toEqual(expect.objectContaining({ canRedeem: false, reason: 'Voucher khusus tier lain' }));
      expect(byId.get(expensive.id)).toEqual(expect.objectContaining({ canRedeem: false, reason: 'Poin tidak cukup' }));
    });

    it('penukaran menegakkan tier, periode, dan batas per pengguna (dulu tidak)', async () => {
      const c = await withPoints(1000);
      const gold = await template({ tierRestriction: MembershipTier.GOLD });
      await expect(redeem(c, gold.id)).rejects.toThrow('Voucher khusus tier lain');
      const future = await template({ startDate: new Date(Date.now() + 86_400_000) });
      await expect(redeem(c, future.id)).rejects.toThrow('Penukaran voucher belum dibuka');
      const once = await template();
      await expect(redeem(c, once.id)).resolves.toBeTruthy();
      await expect(redeem(c, once.id)).rejects.toThrow('Batas penukaran voucher ini sudah tercapai');
      expect((await prisma.wallet.findUniqueOrThrow({ where: { id: c.wallet.id } })).pointBalance).toBe(900);
    });

    it('6 penukaran PARALEL voucher kuota 2 (tanpa batas per pengguna) → tepat 2 berhasil, poin dipotong 2×', async () => {
      const t = await template({ quota: 2, perUserLimit: null });
      const c = await withPoints(1000);
      const rs = await Promise.allSettled(Array.from({ length: 6 }, () => redeem(c, t.id)));
      expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
      expect((await prisma.voucherTemplate.findUniqueOrThrow({ where: { id: t.id } })).issuedCount).toBe(2);
      expect((await prisma.wallet.findUniqueOrThrow({ where: { id: c.wallet.id } })).pointBalance).toBe(800);
      expect(await prisma.userVoucher.count({ where: { templateId: t.id } })).toBe(2);
    });
  });
});
