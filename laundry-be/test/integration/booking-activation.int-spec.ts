/**
 * Fase 1 Batch 1 (K2, T2) — integration test terhadap PostgreSQL NYATA.
 *
 * Service ASLI: OrdersService, BookingsService, IotService, IotMachineService,
 * PaymentsService, WalletLedgerService (semua lewat Prisma ke Postgres uji).
 * Di-mock: broker MQTT (dicatat publish-nya), gateway Midtrans, dan modul
 * loyalty (poin/tier/campaign — di luar cakupan batch ini).
 */
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { BookingStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { IotService } from '../../src/modules/iot/iot.service';
import { IotMachineService, START_MACHINE } from '../../src/modules/iot/iot-machine.service';
import { IotMqttService } from '../../src/modules/iot/iot-mqtt.service';
import { PaymentsService } from '../../src/modules/payments/payments.service';
import { PAYMENT_GATEWAY } from '../../src/modules/payments/gateway/payment-gateway.interface';
import { WalletLedgerService } from '../../src/modules/wallets/wallet-ledger.service';
import { PromosService } from '../../src/modules/promos/promos.service';
import { PointService } from '../../src/modules/points/point.service';
import { MembershipTierService } from '../../src/modules/memberships/membership-tier.service';
import { B2BPartnerService } from '../../src/modules/partners/b2b-partner.service';
import { CampaignService } from '../../src/modules/campaigns/campaign.service';
import { LoyaltyConfigService } from '../../src/modules/loyalty-config/loyalty-config.service';
import { TransactionService } from '../../src/modules/transactions/transaction.service';
import { PricingService } from '../../src/modules/pricing/pricing.service';
import { VoucherService } from '../../src/modules/vouchers/voucher.service';
import {
  createCustomer,
  createMachine,
  createOutlet,
  createServiceWithPrice,
  inMinutes,
  resetDb,
} from './helpers';

describe('K2/T2 — booking ↔ order ↔ pembayaran ↔ aktivasi (PostgreSQL nyata)', () => {
  let prisma: PrismaService;
  let orders: OrdersService;
  let bookings: BookingsService;
  let payments: PaymentsService;
  let iotMachine: IotMachineService;
  let transactions: TransactionService;
  // Harga setelah voucher (mis. potongan Rp2.000) — PricingService di-mock.
  const pricing = {
    calculate: jest.fn(async () => ({
      basePrice: 10000, b2bDiscount: 0, happyHourDiscount: 0, voucherDiscount: 2000, promoDiscount: 0,
      finalAmount: 8000, spendingAmount: 8000, pointsToEarn: 0, cashbackToCredit: 0,
      happyHourRules: [], b2bPricingRules: [], voucherId: null, promoId: null,
    })),
  };
  const mqtt = { publishCommand: jest.fn(), eventHandler: undefined as any };
  let chargeSeq = 0;
  const gateway = {
    name: 'mock',
    createCharge: jest.fn(async () => ({
      externalId: `ext-${++chargeSeq}`,
      qrString: 'https://qr.test/x',
      expiresAt: inMinutes(15),
    })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        OrdersService,
        BookingsService,
        IotService,
        IotMachineService,
        PaymentsService,
        WalletLedgerService,
        TransactionService,
        { provide: PricingService, useValue: pricing },
        { provide: VoucherService, useValue: { redeem: jest.fn() } },
        { provide: IotMqttService, useValue: mqtt },
        { provide: PAYMENT_GATEWAY, useValue: gateway },
        { provide: PromosService, useValue: { evaluatePromo: jest.fn(), commitUsage: jest.fn() } },
        { provide: PointService, useValue: { earn: jest.fn() } },
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
    bookings = moduleRef.get(BookingsService);
    payments = moduleRef.get(PaymentsService);
    iotMachine = moduleRef.get(IotMachineService);
    transactions = moduleRef.get(TransactionService);
  });

  afterAll(async () => prisma.$disconnect());

  let outlet: any, machine: any, service: any;
  beforeEach(async () => {
    await resetDb(prisma);
    mqtt.publishCommand.mockClear();
    outlet = await createOutlet(prisma);
    machine = await createMachine(prisma, outlet.id);
    service = await createServiceWithPrice(prisma, outlet.id, 10000);
  });

  const orderDto = (customerId: string, extra: Record<string, unknown> = {}) => ({
    customerId,
    outletId: outlet.id,
    sourcePlatform: 'MOBILE_APP',
    items: [{ serviceId: service.id, quantity: 1, machineType: 'WASHER' }],
    deviceId: machine.id,
    ...extra,
  });
  const startCommands = () => prisma.iotCommand.count({ where: { command: START_MACHINE } });

  // ── Pembuatan order + booking ───────────────────────────────────────────
  it('order + booking HOLD dibuat atomik dan berelasi (FK)', async () => {
    const c = await createCustomer(prisma);
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    expect(order.status).toBe(OrderStatus.DRAFT);
    const b = await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: order.id }, include: { order: true } });
    expect(b.status).toBe(BookingStatus.HOLD);
    expect(b.order?.id).toBe(order.id); // relasi nyata
    expect(Number(order.totalAmount)).toBe(10000); // harga dari server
  });

  it('mesin bentrok → 409 dan TIDAK ada order yatim (rollback atomik)', async () => {
    const a = await createCustomer(prisma);
    const b = await createCustomer(prisma);
    await orders.create(orderDto(a.customer.id) as any, a.user.id);
    await expect(orders.create(orderDto(b.customer.id) as any, b.user.id)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.order.count({ where: { customerId: b.customer.id } })).toBe(0);
  });

  it('konkurensi: 8 pelanggan memesan slot yang sama bersamaan → tepat 1 berhasil', async () => {
    const custs = await Promise.all(Array.from({ length: 8 }, () => createCustomer(prisma)));
    const results = await Promise.allSettled(
      custs.map((c) => orders.create(orderDto(c.customer.id) as any, c.user.id)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').every((r: any) => r.reason instanceof ConflictException)).toBe(true);
    expect(await prisma.machineBooking.count({ where: { deviceId: machine.id } })).toBe(1);
    expect(await prisma.order.count()).toBe(1);
  });

  it('slot berbeda (2 jam terpisah) pada mesin yang sama → keduanya berhasil', async () => {
    const a = await createCustomer(prisma);
    const b = await createCustomer(prisma);
    await orders.create(orderDto(a.customer.id, { scheduledAt: inMinutes(60).toISOString() }) as any, a.user.id);
    await orders.create(orderDto(b.customer.id, { scheduledAt: inMinutes(180).toISOString() }) as any, b.user.id);
    expect(await prisma.machineBooking.count({ where: { deviceId: machine.id } })).toBe(2);
  });

  it('mesin dari outlet lain ditolak', async () => {
    const other = await createOutlet(prisma, 'Lain');
    const foreign = await createMachine(prisma, other.id);
    const c = await createCustomer(prisma);
    await expect(
      orders.create(orderDto(c.customer.id, { deviceId: foreign.id }) as any, c.user.id),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('API lama POST /bookings (HOLD tanpa order) dipakai ulang saat order dibuat — tanpa booking ganda', async () => {
    const c = await createCustomer(prisma);
    const hold: any = await bookings.reserve(c.user.id, { deviceId: machine.id });
    expect(hold.status).toBe(BookingStatus.HOLD);
    expect(hold.orderId).toBeNull();
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    expect(await prisma.machineBooking.count()).toBe(1);
    const b = await prisma.machineBooking.findUniqueOrThrow({ where: { id: hold.id } });
    expect(b.orderId).toBe(order.id);
  });

  // ── Aktivasi wajib lewat pembayaran ─────────────────────────────────────
  it('K2: scan QR sebelum bayar → ditolak, tidak ada perintah START', async () => {
    const c = await createCustomer(prisma);
    await orders.create(orderDto(c.customer.id) as any, c.user.id);
    await expect(bookings.verifyByDeviceCode(c.user.id, machine.deviceCode)).rejects.toThrow(/pembayaran/i);
    expect(await startCommands()).toBe(0);
    expect(mqtt.publishCommand).not.toHaveBeenCalled();
  });

  it('K2: alur lama "Booking & Pakai" (reserve tanpa order lalu scan) → ditolak', async () => {
    const c = await createCustomer(prisma);
    await bookings.reserve(c.user.id, { deviceCode: machine.deviceCode });
    await expect(bookings.verifyByDeviceCode(c.user.id, machine.deviceCode)).rejects.toBeInstanceOf(BadRequestException);
    expect(await startCommands()).toBe(0);
  });

  it('bayar saldo (order yang sama) → PAID, booking RESERVED, mesin BELUM start', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    const res = await payments.payOrderWithWallet(c.user.id, order.id);
    expect(res.status).toBe(OrderStatus.PAID);
    expect(await prisma.order.count()).toBe(1); // tidak ada order baru
    const b = await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(b.status).toBe(BookingStatus.RESERVED);
    const w = await prisma.wallet.findUniqueOrThrow({ where: { customerId: c.customer.id } });
    expect(Number(w.balance)).toBe(40000); // nominal dari server
    expect(await startCommands()).toBe(0); // aktivasi ditunda sampai scan
  });

  it('K2: scan oleh pemilik setelah bayar → START dipublikasikan tepat sekali; scan ulang & paralel tidak menggandakan', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    await payments.payOrderWithWallet(c.user.id, order.id);

    const first: any = await bookings.verifyByDeviceCode(c.user.id, machine.deviceCode);
    expect(first.activation.status).toBe('PUBLISHED');
    await bookings.verifyByDeviceCode(c.user.id, machine.deviceCode); // replay
    await Promise.allSettled(Array.from({ length: 5 }, () => bookings.verifyByDeviceCode(c.user.id, machine.deviceCode)));
    expect(await startCommands()).toBe(1);
    expect(mqtt.publishCommand).toHaveBeenCalledTimes(1);
    const cmd = await prisma.iotCommand.findFirstOrThrow({ where: { command: START_MACHINE } });
    expect(cmd.orderId).toBe(order.id);
    expect(cmd.deviceId).toBe(machine.id);
  });

  it('K2: pelanggan lain tidak bisa mengaktifkan mesin yang dipesan & dibayar orang lain', async () => {
    const owner = await createCustomer(prisma, { balance: 50000 });
    const intruder = await createCustomer(prisma);
    const order: any = await orders.create(orderDto(owner.customer.id) as any, owner.user.id);
    await payments.payOrderWithWallet(owner.user.id, order.id);
    await expect(bookings.verifyByDeviceCode(intruder.user.id, machine.deviceCode)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await startCommands()).toBe(0);
  });

  it('K2: order PAID untuk mesin A tidak bisa dipakai di mesin B', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const machineB = await createMachine(prisma, outlet.id);
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    await payments.payOrderWithWallet(c.user.id, order.id);
    await expect(bookings.verifyByDeviceCode(c.user.id, machineB.deviceCode)).rejects.toBeInstanceOf(BadRequestException);
    await expect(iotMachine.requestMachineStart(order.id, machineB.id)).rejects.toBeInstanceOf(BadRequestException);
    expect(await startCommands()).toBe(0);
  });

  it('K2: status PAID palsu (diubah langsung tanpa Payment PAID) tidak diterima', async () => {
    const c = await createCustomer(prisma);
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    // Simulasi data rusak/manipulasi: order & booking dipaksa PAID/RESERVED tanpa pembayaran.
    await prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID } });
    await prisma.machineBooking.update({
      where: { orderId: order.id },
      data: { status: BookingStatus.RESERVED, expiresAt: inMinutes(30) },
    });
    await expect(bookings.verifyByDeviceCode(c.user.id, machine.deviceCode)).rejects.toThrow(/belum terverifikasi/i);
    expect(await startCommands()).toBe(0);
  });

  it('booking terjadwal: scan terlalu awal ditolak', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const order: any = await orders.create(
      orderDto(c.customer.id, { scheduledAt: inMinutes(120).toISOString() }) as any,
      c.user.id,
    );
    await payments.payOrderWithWallet(c.user.id, order.id);
    await expect(bookings.verifyByDeviceCode(c.user.id, machine.deviceCode)).rejects.toThrow(/Belum waktunya/);
    expect(await startCommands()).toBe(0);
  });

  it('booking IN_USE hanya setelah mesin melapor RUNNING (bukan saat perintah dikirim)', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    await payments.payOrderWithWallet(c.user.id, order.id);
    const res: any = await bookings.verifyByDeviceCode(c.user.id, machine.deviceCode);
    expect((await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe(BookingStatus.RESERVED);
    await iotMachine.handleDeviceEvent({ deviceCode: machine.deviceCode, eventType: 'RUNNING', commandId: res.activation.commandId } as any);
    expect((await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe(BookingStatus.IN_USE);
    const again: any = await bookings.verifyByDeviceCode(c.user.id, machine.deviceCode);
    expect(again.message).toMatch(/sudah aktif/);
    expect(await startCommands()).toBe(1);
  });

  it('START FAILED boleh dicoba ulang, maksimal 3 percobaan', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    await payments.payOrderWithWallet(c.user.id, order.id);
    for (let i = 0; i < 3; i++) {
      const r: any = await bookings.verifyByDeviceCode(c.user.id, machine.deviceCode);
      await iotMachine.handleDeviceEvent({ deviceCode: machine.deviceCode, eventType: 'FAILED', commandId: r.activation.commandId } as any);
    }
    await expect(bookings.verifyByDeviceCode(c.user.id, machine.deviceCode)).rejects.toThrow(/gagal dinyalakan/);
    expect(await startCommands()).toBe(3);
  });

  it('hook PAID (activateMachineForOrder) tidak menyalakan mesin untuk order booking', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    await payments.payOrderWithWallet(c.user.id, order.id);
    expect(await iotMachine.activateMachineForOrder(order.id)).toBeNull();
    expect(await startCommands()).toBe(0);
  });

  // ── Jalur pembayaran ─────────────────────────────────────────────────────
  it('gateway (QRIS) + webhook PAID → booking RESERVED pada order yang sama', async () => {
    const c = await createCustomer(prisma);
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    const pay: any = await payments.createGatewayPayment(c.user.id, { orderId: order.id, method: 'QRIS' } as any);
    expect(pay.status).toBe('PENDING');
    const p = await prisma.payment.findUniqueOrThrow({ where: { paymentNumber: pay.paymentNumber } });
    await payments.handleWebhook({ externalId: p.externalId!, status: 'PAID' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.PAID);
    expect((await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe(BookingStatus.RESERVED);
    // Webhook ganda tidak mengubah apa pun
    await payments.handleWebhook({ externalId: p.externalId!, status: 'PAID' });
    expect(await prisma.payment.count({ where: { orderId: order.id, status: PaymentStatus.PAID } })).toBe(1);
  });

  it('bayar saldo paralel 4x untuk order yang sama → tepat 1 pembayaran, saldo terpotong sekali', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => payments.payOrderWithWallet(c.user.id, order.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.payment.count({ where: { orderId: order.id, status: PaymentStatus.PAID } })).toBe(1);
    const w = await prisma.wallet.findUniqueOrThrow({ where: { customerId: c.customer.id } });
    expect(Number(w.balance)).toBe(40000);
  });

  it('bayar saldo ditolak selama tagihan QRIS/VA masih aktif (cegah bayar dobel)', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const order: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    await payments.createGatewayPayment(c.user.id, { orderId: order.id, method: 'QRIS' } as any);
    await expect(payments.payOrderWithWallet(c.user.id, order.id)).rejects.toBeInstanceOf(ConflictException);
    expect(Number((await prisma.wallet.findUniqueOrThrow({ where: { customerId: c.customer.id } })).balance)).toBe(50000);
  });

  it('bayar saldo order milik orang lain → 403; saldo kurang → gagal tanpa efek', async () => {
    const owner = await createCustomer(prisma, { balance: 50000 });
    const other = await createCustomer(prisma, { balance: 100 });
    const order: any = await orders.create(orderDto(owner.customer.id) as any, owner.user.id);
    await expect(payments.payOrderWithWallet(other.user.id, order.id)).rejects.toBeInstanceOf(ForbiddenException);
    const poorOrder: any = await orders.create(
      orderDto(other.customer.id, { scheduledAt: inMinutes(180).toISOString() }) as any,
      other.user.id,
    );
    await expect(payments.payOrderWithWallet(other.user.id, poorOrder.id)).rejects.toBeInstanceOf(BadRequestException);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: poorOrder.id } })).status).toBe(OrderStatus.DRAFT);
    expect(await prisma.payment.count({ where: { orderId: poorOrder.id } })).toBe(0);
  });

  it('saldo + voucher (/transactions/checkout) dengan mesin → order PAID + booking RESERVED atomik; START hanya lewat scan', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const res = await transactions.checkout({
      customerId: c.customer.id, outletId: outlet.id, sourcePlatform: 'MOBILE_APP',
      items: [{ serviceId: service.id, quantity: 1 }], voucherCode: 'HEMAT', deviceId: machine.id,
    });
    expect(res.status).toBe(OrderStatus.PAID);
    const b = await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: res.orderId } });
    expect(b.status).toBe(BookingStatus.RESERVED);
    expect(Number((await prisma.wallet.findUniqueOrThrow({ where: { customerId: c.customer.id } })).balance)).toBe(42000);
    expect(await startCommands()).toBe(0);
    await bookings.verifyByDeviceCode(c.user.id, machine.deviceCode);
    expect(await startCommands()).toBe(1);
  });

  it('saldo + voucher pada mesin yang sudah dipesan → 409, tanpa order & tanpa potongan saldo', async () => {
    const a = await createCustomer(prisma);
    const b = await createCustomer(prisma, { balance: 50000 });
    await orders.create(orderDto(a.customer.id) as any, a.user.id);
    await expect(
      transactions.checkout({
        customerId: b.customer.id, outletId: outlet.id, sourcePlatform: 'MOBILE_APP',
        items: [{ serviceId: service.id, quantity: 1 }], voucherCode: 'HEMAT', deviceId: machine.id,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.order.count({ where: { customerId: b.customer.id } })).toBe(0);
    expect(Number((await prisma.wallet.findUniqueOrThrow({ where: { customerId: b.customer.id } })).balance)).toBe(50000);
  });

  // ── Pembatalan & kedaluwarsa ─────────────────────────────────────────────
  it('order dibatalkan → booking dilepas → mesin bisa dipesan pelanggan lain', async () => {
    const a = await createCustomer(prisma);
    const b = await createCustomer(prisma);
    const order: any = await orders.create(orderDto(a.customer.id) as any, a.user.id);
    await orders.cancel(order.id, { cancelReason: 'ganti jadwal' }, a.user.id, a.auth);
    expect((await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe(BookingStatus.CANCELLED);
    await expect(orders.create(orderDto(b.customer.id) as any, b.user.id)).resolves.toBeDefined();
  });

  it('batalkan booking yang belum dibayar → order ikut dibatalkan; yang sudah dibayar → ditolak', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const unpaid: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    const ub = await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: unpaid.id } });
    await bookings.cancel(c.user.id, ub.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: unpaid.id } })).status).toBe(OrderStatus.CANCELLED);

    const paid: any = await orders.create(orderDto(c.customer.id) as any, c.user.id);
    await payments.payOrderWithWallet(c.user.id, paid.id);
    const pb = await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: paid.id } });
    await expect(bookings.cancel(c.user.id, pb.id)).rejects.toThrow(/sudah dibayar/);
  });

  it('HOLD kedaluwarsa tidak memblokir pelanggan lain; pembayaran terlambat atas slot yang terambil → booking dibatalkan', async () => {
    const a = await createCustomer(prisma, { balance: 50000 });
    const b = await createCustomer(prisma);
    const late: any = await orders.create(orderDto(a.customer.id) as any, a.user.id);
    await prisma.machineBooking.update({ where: { orderId: late.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const winner: any = await orders.create(orderDto(b.customer.id) as any, b.user.id); // slot diambil B
    expect(winner).toBeDefined();
    await payments.payOrderWithWallet(a.user.id, late.id); // A bayar terlambat
    expect((await prisma.machineBooking.findUniqueOrThrow({ where: { orderId: late.id } })).status).toBe(BookingStatus.CANCELLED);
    await expect(bookings.verifyByDeviceCode(a.user.id, machine.deviceCode)).rejects.toBeDefined();
    expect(await startCommands()).toBe(0);
  });
});
