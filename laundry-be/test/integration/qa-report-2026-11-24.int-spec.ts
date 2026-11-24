/**
 * Regresi laporan QA 2026-11-24 (docs/QA_Report_DiCuciin_2026-11-24.xlsx)
 * terhadap PostgreSQL nyata: validasi promo/voucher/layanan, batas cashback,
 * tanggal lahir, pencarian nomor HP lama, dan aturan password staf.
 */
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PromoType, UserRole, VoucherType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { CustomersService } from '../../src/modules/customers/customers.service';
import { PromosService } from '../../src/modules/promos/promos.service';
import { CreateServiceDto } from '../../src/modules/services/dto/service.dto';
import { ServicesService } from '../../src/modules/services/services.service';
import { CreateUserDto } from '../../src/modules/users/dto/create-user.dto';
import { VoucherService } from '../../src/modules/vouchers/voucher.service';
import { WalletLedgerService } from '../../src/modules/wallets/wallet-ledger.service';
import { createUser, resetDb } from './helpers';

const day = (d: number) => new Date(Date.UTC(2026, 11, d)).toISOString();

describe('Laporan QA 2026-11-24 (PostgreSQL nyata)', () => {
  let prisma: PrismaService;
  let promos: PromosService;
  let vouchers: VoucherService;
  let services: ServicesService;
  let customers: CustomersService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService, PromosService, VoucherService, ServicesService, CustomersService, WalletLedgerService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    promos = moduleRef.get(PromosService);
    vouchers = moduleRef.get(VoucherService);
    services = moduleRef.get(ServicesService);
    customers = moduleRef.get(CustomersService);
  });
  beforeEach(() => resetDb(prisma));
  afterAll(() => prisma.$disconnect());

  const promo = (over: Record<string, unknown> = {}) =>
    ({
      code: 'HEMAT10',
      name: 'Hemat',
      promoType: PromoType.PERCENTAGE,
      value: 10,
      startDate: day(1),
      endDate: day(31),
      ...over,
    }) as any;

  it('BUG-002: promo persentase > 100, periode terbalik, kode berspasi ditolak', async () => {
    await expect(promos.create(promo({ value: 150 }))).rejects.toThrow('antara 1 dan 100');
    await expect(promos.create(promo({ promoType: PromoType.CASHBACK, value: 101 }))).rejects.toThrow(BadRequestException);
    await expect(promos.create(promo({ startDate: day(31), endDate: day(1) }))).rejects.toThrow('Tanggal selesai');
    await expect(promos.create(promo({ code: 'qa test' }))).rejects.toThrow('tanpa spasi');
    await expect(promos.create(promo({ promoType: PromoType.FIXED_AMOUNT, value: 0 }))).rejects.toThrow('lebih dari 0');

    const ok = await promos.create(promo());
    expect(Number(ok.value)).toBe(10);
    // Update memakai nilai lama untuk field yang tidak dikirim.
    await expect(promos.update(ok.id, { value: 150 } as any)).rejects.toThrow('antara 1 dan 100');
    await expect(promos.update(ok.id, { endDate: new Date(Date.UTC(2026, 10, 1)).toISOString() } as any)).rejects.toThrow(
      'Tanggal selesai',
    );
    const updated = await promos.update(ok.id, { value: 20 } as any);
    expect(Number(updated.value)).toBe(20);
  });

  it('Cashback promo lama > 100% dibatasi sebesar subtotal', async () => {
    const now = Date.now();
    await prisma.promo.create({
      data: {
        code: 'LAMA150',
        name: 'Data lama',
        promoType: PromoType.CASHBACK,
        value: new Prisma.Decimal(150),
        startDate: new Date(now - 86_400_000),
        endDate: new Date(now + 86_400_000),
      },
    });
    const r = await promos.evaluatePromo({ code: 'LAMA150', items: [{ subtotal: 10000 }] });
    expect(Number(r.cashback)).toBe(10000);
  });

  it('BUG-003: voucher persentase > 100, nominal 0, kode berspasi, tanggal terbalik ditolak', async () => {
    const tpl = (over: Record<string, unknown> = {}) =>
      ({ code: 'QA-PCT', name: 'Voucher', voucherType: VoucherType.PERCENTAGE_DISCOUNT, value: 10, ...over }) as any;
    await expect(vouchers.createTemplate(tpl({ value: 200 }))).rejects.toThrow('antara 1 dan 100');
    await expect(vouchers.createTemplate(tpl({ voucherType: VoucherType.NOMINAL_DISCOUNT, value: 0 }))).rejects.toThrow(
      'lebih dari 0',
    );
    await expect(vouchers.createTemplate(tpl({ code: 'Test Voucher 01' }))).rejects.toThrow('tanpa spasi');
    await expect(
      vouchers.createTemplate(tpl({ startDate: new Date(day(31)), endDate: new Date(day(1)) })),
    ).rejects.toThrow('Tanggal selesai');
    // Gratis cuci tidak butuh nilai.
    await expect(vouchers.createTemplate(tpl({ code: 'QA-FREE', voucherType: VoucherType.FREE_WASH, value: 0 }))).resolves.toBeTruthy();

    const ok = await vouchers.createTemplate(tpl());
    await expect(vouchers.updateTemplate(ok.id, { value: 200 })).rejects.toThrow('antara 1 dan 100');
    await expect(vouchers.updateTemplate(ok.id, { value: 25 })).resolves.toBeTruthy();
  });

  it('BUG-001: layanan aktif wajib harga > 0; form API wajib harga & estimasi', async () => {
    const dtoErrors = await validate(plainToInstance(CreateServiceDto, { name: 'X', serviceType: 'WASH' }));
    const props = dtoErrors.map((e) => e.property).sort();
    expect(props).toEqual(['basePrice', 'estimateMinutes']);
    const bad = await validate(
      plainToInstance(CreateServiceDto, { name: 'X', serviceType: 'WASH', basePrice: 0, estimateMinutes: 0 }),
    );
    expect(bad.map((e) => e.property).sort()).toEqual(['basePrice', 'estimateMinutes']);

    await expect(services.createService({ name: 'Tanpa harga', serviceType: 'WASH' } as any)).rejects.toThrow(
      'wajib punya harga',
    );
    // Boleh disimpan nonaktif dulu tanpa harga.
    const draft = await services.createService({ name: 'Draft', serviceType: 'WASH', isActive: false } as any);
    await expect(services.updateService(draft.id, { isActive: true } as any)).rejects.toThrow('wajib punya harga');
    const active = await services.updateService(draft.id, { isActive: true, basePrice: 12000 } as any);
    expect(active.isActive).toBe(true);
    await expect(services.updateService(draft.id, { basePrice: 0 } as any)).rejects.toThrow('wajib punya harga');
  });

  it('BUG-053: tanggal lahir di masa depan ditolak', async () => {
    await expect(
      customers.create({ name: 'Masa Depan', phone: '081377700099', password: 'Rahasia123!', birthDate: '2099-01-01' } as any),
    ).rejects.toThrow('masa depan');
    await expect(
      customers.create({ name: 'Normal', phone: '081377700098', password: 'Rahasia123!', birthDate: '1999-08-17' } as any),
    ).resolves.toBeTruthy();
  });

  it('BUG-020: cari "62…" menemukan data lama yang tersimpan "08…"', async () => {
    const u = await createUser(prisma, UserRole.CUSTOMER, 'Nomor Lama');
    await prisma.user.update({ where: { id: u.id }, data: { phone: '081308130813' } });
    await prisma.customer.create({ data: { userId: u.id, memberCode: 'MBR-LAMA' } });
    const byIntl = await customers.findAll(1, 10, { search: '6281308130813' });
    expect(byIntl.data.map((c: any) => c.memberCode)).toEqual(['MBR-LAMA']);
    const byLocal = await customers.findAll(1, 10, { search: '0813081308' });
    expect(byLocal.data.map((c: any) => c.memberCode)).toEqual(['MBR-LAMA']);
  });

  it('BUG-011: password staf wajib huruf dan angka', async () => {
    const base = { name: 'Staf', email: 'staf@example.com' };
    for (const password of ['12345678', 'abcdefgh']) {
      const errors = await validate(plainToInstance(CreateUserDto, { ...base, password }));
      expect(errors.map((e) => e.property)).toContain('password');
    }
    const ok = await validate(plainToInstance(CreateUserDto, { ...base, password: 'kasir2026' }));
    expect(ok).toEqual([]);
  });
});
