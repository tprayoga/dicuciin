/**
 * Regresi temuan uji fungsional 2026-11-21 (docs/Laporan-Uji-Fungsional-Admin-
 * Mobile-2026-11-21.pdf) terhadap PostgreSQL nyata.
 */
import { BadRequestException, ParseEnumPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { BannerPlacement, OrderStatus, OtpPurpose, Prisma, UserRole, WalletType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { generateDailySequence } from '../../src/common/utils/sequence.util';
import { OtpService } from '../../src/modules/auth/otp.service';
import { CustomersService } from '../../src/modules/customers/customers.service';
import { WhatsappService } from '../../src/modules/notifications/whatsapp.service';
import { CreateOutletDto, UpdateOutletDto } from '../../src/modules/outlets/dto/outlet.dto';
import { OutletsService } from '../../src/modules/outlets/outlets.service';
import { CreateServiceDto, CreateServicePriceDto, UpdateServiceDto } from '../../src/modules/services/dto/service.dto';
import { ServicesService } from '../../src/modules/services/services.service';
import { UsersService } from '../../src/modules/users/users.service';
import { VoucherService } from '../../src/modules/vouchers/voucher.service';
import { WalletLedgerService } from '../../src/modules/wallets/wallet-ledger.service';
import { createCustomer, createOutlet, createUser, resetDb } from './helpers';

describe('Temuan uji 2026-11-21 (PostgreSQL nyata)', () => {
  let prisma: PrismaService;
  let customers: CustomersService;
  let services: ServicesService;
  let outlets: OutletsService;
  let users: UsersService;
  let ledger: WalletLedgerService;
  let otp: OtpService;
  let jwt: JwtService;
  let vouchers: VoucherService;
  const sent: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        PrismaService,
        CustomersService,
        ServicesService,
        OutletsService,
        UsersService,
        WalletLedgerService,
        OtpService,
        VoucherService,
        { provide: ConfigService, useValue: { get: (k: string, d?: any) => (k === 'JWT_OTP_SECRET' ? 'otp-secret-uji' : d) } },
        {
          provide: WhatsappService,
          useValue: { isConfigured: () => true, devFallbackAllowed: () => false, sendText: async (_p: string, m: string) => void sent.push(m) },
        },
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    customers = moduleRef.get(CustomersService);
    services = moduleRef.get(ServicesService);
    outlets = moduleRef.get(OutletsService);
    users = moduleRef.get(UsersService);
    ledger = moduleRef.get(WalletLedgerService);
    otp = moduleRef.get(OtpService);
    jwt = moduleRef.get(JwtService);
    vouchers = moduleRef.get(VoucherService);
  });
  beforeEach(() => resetDb(prisma));
  afterAll(() => prisma.$disconnect());

  it('#1 kode member: registrasi app → member loket → registrasi app tidak bentrok', async () => {
    // registrasi app pertama menginisialisasi counter harian
    const app1 = await generateDailySequence(prisma, 'MBR', 'customer', 'memberCode', 6);
    const u1 = await createUser(prisma, UserRole.CUSTOMER);
    await prisma.customer.create({ data: { userId: u1.id, memberCode: app1 } });
    // kasir menambah member di loket
    const loket = await customers.create({ name: 'Member Loket', phone: '081377700001', password: 'Rahasia123!' } as any);
    // registrasi app berikutnya
    const app2 = await generateDailySequence(prisma, 'MBR', 'customer', 'memberCode', 6);
    expect(new Set([app1, loket.memberCode, app2]).size).toBe(3);
    const u2 = await createUser(prisma, UserRole.CUSTOMER);
    await expect(prisma.customer.create({ data: { userId: u2.id, memberCode: app2 } })).resolves.toBeTruthy();
  });

  it('#1 nomor HP duplikat di loket → 409 berbahasa Indonesia', async () => {
    await customers.create({ name: 'A', phone: '081377700002', password: 'Rahasia123!' } as any);
    await expect(customers.create({ name: 'B', phone: '081377700002', password: 'Rahasia123!' } as any)).rejects.toThrow(
      'Nomor telepon sudah terdaftar',
    );
  });

  it('#2 layanan baru → harga di semua outlet; outlet baru → harga semua layanan aktif', async () => {
    const o1 = await createOutlet(prisma, 'A');
    const o2 = await createOutlet(prisma, 'B');
    const svc = await services.createService({ name: 'Cuci 8kg', serviceType: 'WASH', machineType: 'WASHER', basePrice: 15000 } as any);
    const prices = await prisma.servicePrice.findMany({ where: { serviceId: svc.id } });
    expect(prices.map((p) => p.outletId).sort()).toEqual([o1.id, o2.id].sort());
    expect(prices.every((p) => Number(p.price) === 15000)).toBe(true);

    await services.createService({ name: 'Nonaktif', serviceType: 'WASH', basePrice: 9000, isActive: false } as any);
    const o3 = await outlets.create({ name: 'Baru', code: 'OUT-BARU', address: 'Jl', phone: '0' } as any);
    const o3prices = await prisma.servicePrice.findMany({ where: { outletId: o3.id }, include: { service: true } });
    expect(o3prices.map((p) => p.service.name)).toEqual(['Cuci 8kg']);
  });

  it('#2 ubah harga dasar → harga per-outlet ikut, kecuali yang sudah disesuaikan', async () => {
    const o1 = await createOutlet(prisma, 'A');
    const o2 = await createOutlet(prisma, 'B');
    const svc = await services.createService({ name: 'Cuci', serviceType: 'WASH', basePrice: 15000 } as any);
    await prisma.servicePrice.update({
      where: { serviceId_outletId: { serviceId: svc.id, outletId: o2.id } },
      data: { price: new Prisma.Decimal(18000) },
    });
    await services.updateService(svc.id, { basePrice: 16000 } as any);
    const p = async (outletId: string) =>
      Number((await prisma.servicePrice.findUniqueOrThrow({ where: { serviceId_outletId: { serviceId: svc.id, outletId } } })).price);
    expect(await p(o1.id)).toBe(16000);
    expect(await p(o2.id)).toBe(18000);
  });

  it('#3 daftar staff tanpa pelanggan & akun terhapus', async () => {
    await createUser(prisma, UserRole.OWNER, 'Owner');
    await createUser(prisma, UserRole.CASHIER, 'Kasir');
    await createCustomer(prisma);
    const gone = await createUser(prisma, UserRole.CASHIER, 'Dihapus');
    await prisma.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    const res = await users.findAll(1, 100);
    expect(res.data.map((u: any) => u.name).sort()).toEqual(['Kasir', 'Owner']);
    expect(res.meta.total).toBe(2);
  });

  it('#5 refund sesuai asal dana: bagian bonus kembali ke BONUS, sisanya ke MAIN; refund ganda ditolak', async () => {
    const c = await createCustomer(prisma, { balance: 100000 });
    await prisma.wallet.update({ where: { id: c.wallet.id }, data: { bonusBalance: new Prisma.Decimal(350) } });
    const outlet = await createOutlet(prisma);
    const order = await prisma.order.create({
      data: {
        orderNumber: 'ORD-UJI-1', outletId: outlet.id, customerId: c.customer.id, sourcePlatform: 'MOBILE_APP',
        status: OrderStatus.PAID, subtotal: new Prisma.Decimal(15000), totalAmount: new Prisma.Decimal(15000),
      },
    });
    await ledger.debit(WalletType.BONUS_BALANCE, { walletId: c.wallet.id, amount: 350, orderId: order.id, referenceType: 'PAYMENT' });
    await ledger.debit(WalletType.MAIN_BALANCE, { walletId: c.wallet.id, amount: 14650, orderId: order.id, referenceType: 'PAYMENT' });

    await ledger.refundToOrigin({ walletId: c.wallet.id, amount: 15000, orderId: order.id, idempotencyKey: `refund-order-${order.id}` });
    const w = await prisma.wallet.findUniqueOrThrow({ where: { id: c.wallet.id } });
    expect(Number(w.balance)).toBe(100000);
    expect(Number(w.bonusBalance)).toBe(350);

    await expect(
      ledger.refundToOrigin({ walletId: c.wallet.id, amount: 15000, orderId: order.id, idempotencyKey: `refund-order-${order.id}` }),
    ).rejects.toThrow();
    const w2 = await prisma.wallet.findUniqueOrThrow({ where: { id: c.wallet.id } });
    expect(Number(w2.balance)).toBe(100000);
    expect(Number(w2.bonusBalance)).toBe(350);
  });

  it('#5 order tanpa porsi bonus → seluruh refund ke MAIN', async () => {
    const c = await createCustomer(prisma, { balance: 50000 });
    const outlet = await createOutlet(prisma);
    const order = await prisma.order.create({
      data: {
        orderNumber: 'ORD-UJI-2', outletId: outlet.id, customerId: c.customer.id, sourcePlatform: 'MOBILE_APP',
        status: OrderStatus.PAID, subtotal: new Prisma.Decimal(10000), totalAmount: new Prisma.Decimal(10000),
      },
    });
    await ledger.debit(WalletType.MAIN_BALANCE, { walletId: c.wallet.id, amount: 10000, orderId: order.id, referenceType: 'PAYMENT' });
    await ledger.refundToOrigin({ walletId: c.wallet.id, amount: 10000, orderId: order.id, idempotencyKey: 'k2' });
    const w = await prisma.wallet.findUniqueOrThrow({ where: { id: c.wallet.id } });
    expect(Number(w.balance)).toBe(50000);
    expect(Number(w.bonusBalance)).toBe(0);
  });

  it('#6/#7 validasi: jam outlet HH:mm, harga tidak negatif', async () => {
    const errs = async (cls: any, body: object) => (await validate(plainToInstance(cls, body))).map((e) => e.property);
    expect(await errs(UpdateOutletDto, { openTime: '25:99' })).toContain('openTime');
    expect(await errs(UpdateOutletDto, { closeTime: '7:00' })).toContain('closeTime');
    expect(await errs(UpdateOutletDto, { openTime: '06:00', closeTime: '24:00' })).toEqual([]);
    expect(await errs(CreateOutletDto, { name: 'a', code: 'b', address: 'c', phone: 'd', openTime: '0700' })).toContain('openTime');
    expect(await errs(CreateServiceDto, { name: 'a', serviceType: 'WASH', basePrice: -1 })).toContain('basePrice');
    expect(await errs(UpdateServiceDto, { basePrice: -5 })).toContain('basePrice');
    expect(await errs(CreateServicePriceDto, { serviceId: 'a', outletId: 'b', pricingType: 'FIXED', price: -1, unit: 'cycle' })).toContain('price');
  });

  it('#10 placement banner tidak dikenal → 400 (bukan 500)', async () => {
    const pipe = new ParseEnumPipe<any>(BannerPlacement, { optional: true });
    await expect(pipe.transform('HOME', { type: 'query', data: 'placement' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform('HOME_CAROUSEL', { type: 'query', data: 'placement' })).resolves.toBe('HOME_CAROUSEL');
    await expect(pipe.transform(undefined as any, { type: 'query', data: 'placement' })).resolves.toBeUndefined();
  });

  it('#14 token verifikasi OTP membawa waktu terbit presisi milidetik', async () => {
    await otp.requestOtp('081377700009', OtpPurpose.REGISTER);
    const code = sent[sent.length - 1].match(/(\d{4})/)![1];
    const before = Date.now();
    const { verificationToken } = await otp.verifyOtp('081377700009', code, OtpPurpose.REGISTER);
    const payload: any = jwt.decode(verificationToken);
    expect(typeof payload.issuedAtMs).toBe('number');
    expect(payload.issuedAtMs).toBeGreaterThanOrEqual(before);
    const { issuedAt } = await otp.assertVerifiedPhone(verificationToken, '081377700009', OtpPurpose.REGISTER);
    expect(issuedAt?.getTime()).toBe(payload.issuedAtMs);
  });

  it('#15 voucher yang ditahan order belum dibayar → pesan jelas (bukan "status USED")', async () => {
    const c = await createCustomer(prisma);
    const outlet = await createOutlet(prisma);
    const tpl = await prisma.voucherTemplate.create({
      data: { code: 'TPL-UJI', name: 'Hemat', voucherType: 'NOMINAL_DISCOUNT', value: new Prisma.Decimal(5000), segment: 'RETAIL' } as any,
    });
    const uv = await prisma.userVoucher.create({
      data: { templateId: tpl.id, customerId: c.customer.id, code: 'UV-UJI-1', status: 'USED', segment: 'RETAIL' } as any,
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: 'ORD-UJI-HOLD', outletId: outlet.id, customerId: c.customer.id, sourcePlatform: 'MOBILE_APP',
        status: OrderStatus.DRAFT, subtotal: new Prisma.Decimal(20000), totalAmount: new Prisma.Decimal(15000),
      },
    });
    await prisma.voucherRedemption.create({
      data: { userVoucherId: uv.id, orderId: order.id, customerId: c.customer.id, discountApplied: new Prisma.Decimal(5000), status: 'RESERVED' },
    });
    const items = [{ serviceId: 'x', subtotal: 20000 }];
    await expect(vouchers.validate({ code: 'UV-UJI-1', segment: 'RETAIL', items } as any)).rejects.toThrow(
      /sedang dipakai di pesanan ORD-UJI-HOLD yang belum dibayar/,
    );
    await prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID } });
    await prisma.voucherRedemption.update({ where: { orderId: order.id }, data: { status: 'APPLIED' } });
    await expect(vouchers.validate({ code: 'UV-UJI-1', segment: 'RETAIL', items } as any)).rejects.toThrow('Voucher sudah dipakai');
  });
});
