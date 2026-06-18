import {
  B2BPartnerTier,
  MembershipTier,
  Prisma,
  PrismaClient,
  PromoType,
  UserRole,
  UserSegment,
  VoucherStatus,
  VoucherType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

export const TEST_PREFIX = 'TEST_';

export const TEST_CODES = {
  retailUserEmail: 'test.promo.retail@dicuciin.local',
  retailUserPhone: '089900000001',
  retailMemberCode: 'TEST_CUSTOMER_RETAIL',
  b2bUserEmail: 'test.promo.b2b@dicuciin.local',
  b2bUserPhone: '089900000002',
  activePartnerCode: 'TEST_B2B_ACTIVE',
  inactivePartnerCode: 'TEST_B2B_INACTIVE',
  hhActive: 'TEST_HAPPY_HOUR_ACTIVE',
  hhInactive: 'TEST_HAPPY_HOUR_INACTIVE',
  voucherPercentTemplate: 'TEST_VOUCHER_PERCENT',
  voucherFixedTemplate: 'TEST_VOUCHER_FIXED',
  voucherExpiredTemplate: 'TEST_VOUCHER_EXPIRED',
  voucherMinTemplate: 'TEST_VOUCHER_MIN_HIGH',
  voucherStackTemplate: 'TEST_VOUCHER_STACK_FIXED',
  voucherB2BTemplate: 'TEST_VOUCHER_B2B_FIXED',
  voucherRefundTemplate: 'TEST_VOUCHER_REFUND',
  voucherPercentCode: 'TEST_VOUCHER_PERCENT_CODE',
  voucherFixedCode: 'TEST_VOUCHER_FIXED_CODE',
  voucherExpiredCode: 'TEST_VOUCHER_EXPIRED_CODE',
  voucherMinCode: 'TEST_VOUCHER_MIN_HIGH_CODE',
  voucherStackCode: 'TEST_VOUCHER_STACK_CODE',
  voucherB2BCode: 'TEST_VOUCHER_B2B_CODE',
  voucherRefundCode: 'TEST_VOUCHER_REFUND_CODE',
  b2bRule: 'TEST_B2B_SPECIAL_PRICE',
  promoFixedCode: 'TEST_PROMO_FIXED_CODE',
};

export interface PromoLoyaltySmokeSeedResult {
  outletId: string;
  outletName: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  machineType: string | null;
  retailCustomerId: string;
  retailWalletId: string;
  activePartnerId: string;
  activePartnerWalletId: string;
  inactivePartnerId: string;
}

const now = new Date();
const validStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const validEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const expiredStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const expiredEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);

function currentDayCsv() {
  const day = now.getDay() === 0 ? 7 : now.getDay();
  return String(day);
}

async function resetTestVouchers(prisma: PrismaClient) {
  const testVouchers = await prisma.userVoucher.findMany({
    where: { code: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  await prisma.voucherRedemption.deleteMany({
    where: { userVoucherId: { in: testVouchers.map((voucher) => voucher.id) } },
  });
  await prisma.userVoucher.deleteMany({ where: { code: { startsWith: TEST_PREFIX } } });
  await prisma.voucherTemplate.updateMany({
    where: { code: { startsWith: TEST_PREFIX } },
    data: { issuedCount: 0 },
  });
}

export async function seedPromoLoyaltySmokeData(
  prisma = new PrismaClient(),
  options: { disconnect?: boolean } = {},
): Promise<PromoLoyaltySmokeSeedResult> {
  const shouldDisconnect = options.disconnect ?? true;
  try {
    const servicePrice = await prisma.servicePrice.findFirst({
      where: { isActive: true },
      include: { outlet: true, service: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!servicePrice) {
      throw new Error('Service price aktif tidak tersedia. Jalankan prisma seed utama dulu.');
    }

    const passwordHash = await bcrypt.hash('Password123!', 10);
    const retailUser = await prisma.user.upsert({
      where: { email: TEST_CODES.retailUserEmail },
      update: {
        name: 'TEST_CUSTOMER_RETAIL',
        phone: TEST_CODES.retailUserPhone,
        role: UserRole.CUSTOMER,
        isActive: true,
      },
      create: {
        email: TEST_CODES.retailUserEmail,
        phone: TEST_CODES.retailUserPhone,
        name: 'TEST_CUSTOMER_RETAIL',
        passwordHash,
        role: UserRole.CUSTOMER,
        isActive: true,
      },
    });
    const retailCustomer = await prisma.customer.upsert({
      where: { memberCode: TEST_CODES.retailMemberCode },
      update: { userId: retailUser.id },
      create: {
        userId: retailUser.id,
        memberCode: TEST_CODES.retailMemberCode,
        gender: 'L',
        occupation: 'Smoke Tester',
      },
    });
    const retailWallet = await prisma.wallet.upsert({
      where: { customerId: retailCustomer.id },
      update: {
        balance: new Prisma.Decimal(5_000_000),
        bonusBalance: new Prisma.Decimal(0),
        pointBalance: 0,
      },
      create: {
        customerId: retailCustomer.id,
        balance: new Prisma.Decimal(5_000_000),
        bonusBalance: new Prisma.Decimal(0),
        pointBalance: 0,
      },
    });
    await prisma.userMembershipStatus.upsert({
      where: { customerId: retailCustomer.id },
      update: {
        segment: UserSegment.RETAIL,
        currentTier: MembershipTier.SILVER,
        earnedSpending: new Prisma.Decimal(0),
        successfulTxnCount: 0,
      },
      create: {
        customerId: retailCustomer.id,
        segment: UserSegment.RETAIL,
        currentTier: MembershipTier.SILVER,
      },
    });

    await prisma.membershipTierConfig.upsert({
      where: { tier: MembershipTier.SILVER },
      update: { name: 'Silver', level: 1, pointMultiplier: 1, cashbackRate: 0, isActive: true },
      create: { tier: MembershipTier.SILVER, name: 'Silver', level: 1, pointMultiplier: 1, cashbackRate: 0, isActive: true },
    });

    await prisma.b2BPartnerTierConfig.upsert({
      where: { tier: B2BPartnerTier.BUSINESS_PARTNER },
      update: { name: 'Business Partner', level: 1, discountRate: 0, pointMultiplier: 1, cashbackRate: 0, isActive: true },
      create: { tier: B2BPartnerTier.BUSINESS_PARTNER, name: 'Business Partner', level: 1, discountRate: 0, pointMultiplier: 1, cashbackRate: 0, isActive: true },
    });
    await prisma.b2BPartnerTierConfig.upsert({
      where: { tier: B2BPartnerTier.GOLD_PARTNER },
      update: { name: 'Gold Partner', level: 2, discountRate: 10, pointMultiplier: 1, cashbackRate: 0, isActive: true },
      create: { tier: B2BPartnerTier.GOLD_PARTNER, name: 'Gold Partner', level: 2, discountRate: 10, pointMultiplier: 1, cashbackRate: 0, isActive: true },
    });

    await prisma.happyHourRule.upsert({
      where: { id: TEST_CODES.hhActive },
      update: {
        name: TEST_CODES.hhActive,
        outletId: servicePrice.outletId,
        serviceId: servicePrice.serviceId,
        machineType: servicePrice.service.machineType,
        daysOfWeek: currentDayCsv(),
        startTime: '00:00',
        endTime: '23:59',
        adjustmentType: 'PERCENTAGE_OFF',
        value: new Prisma.Decimal(20),
        quota: 100,
        usedQuota: 0,
        allowVoucherStack: true,
        priority: 100,
        startDate: validStart,
        endDate: validEnd,
        isActive: true,
      },
      create: {
        id: TEST_CODES.hhActive,
        name: TEST_CODES.hhActive,
        outletId: servicePrice.outletId,
        serviceId: servicePrice.serviceId,
        machineType: servicePrice.service.machineType,
        daysOfWeek: currentDayCsv(),
        startTime: '00:00',
        endTime: '23:59',
        adjustmentType: 'PERCENTAGE_OFF',
        value: new Prisma.Decimal(20),
        quota: 100,
        usedQuota: 0,
        allowVoucherStack: true,
        priority: 100,
        startDate: validStart,
        endDate: validEnd,
        isActive: true,
      },
    });
    await prisma.happyHourRule.upsert({
      where: { id: TEST_CODES.hhInactive },
      update: {
        name: TEST_CODES.hhInactive,
        outletId: servicePrice.outletId,
        serviceId: servicePrice.serviceId,
        daysOfWeek: '7',
        startTime: '00:00',
        endTime: '00:01',
        adjustmentType: 'FIXED_OFF',
        value: new Prisma.Decimal(9999),
        allowVoucherStack: false,
        priority: 1,
        isActive: false,
      },
      create: {
        id: TEST_CODES.hhInactive,
        name: TEST_CODES.hhInactive,
        outletId: servicePrice.outletId,
        serviceId: servicePrice.serviceId,
        daysOfWeek: '7',
        startTime: '00:00',
        endTime: '00:01',
        adjustmentType: 'FIXED_OFF',
        value: new Prisma.Decimal(9999),
        allowVoucherStack: false,
        priority: 1,
        isActive: false,
      },
    });

    await resetTestVouchers(prisma);
    const templates = [
      {
        code: TEST_CODES.voucherPercentTemplate,
        name: 'TEST Voucher Percent 20%',
        voucherType: VoucherType.PERCENTAGE_DISCOUNT,
        value: new Prisma.Decimal(20),
        maxDiscount: new Prisma.Decimal(15_000),
        minTransaction: new Prisma.Decimal(50_000),
        segment: UserSegment.RETAIL,
        startDate: validStart,
        endDate: validEnd,
      },
      {
        code: TEST_CODES.voucherFixedTemplate,
        name: 'TEST Voucher Fixed 10K',
        voucherType: VoucherType.NOMINAL_DISCOUNT,
        value: new Prisma.Decimal(10_000),
        maxDiscount: new Prisma.Decimal(10_000),
        minTransaction: new Prisma.Decimal(50_000),
        segment: UserSegment.RETAIL,
        startDate: validStart,
        endDate: validEnd,
      },
      {
        code: TEST_CODES.voucherExpiredTemplate,
        name: 'TEST Voucher Expired',
        voucherType: VoucherType.NOMINAL_DISCOUNT,
        value: new Prisma.Decimal(10_000),
        maxDiscount: new Prisma.Decimal(10_000),
        minTransaction: new Prisma.Decimal(50_000),
        segment: UserSegment.RETAIL,
        startDate: expiredStart,
        endDate: expiredEnd,
      },
      {
        code: TEST_CODES.voucherMinTemplate,
        name: 'TEST Voucher High Minimum',
        voucherType: VoucherType.NOMINAL_DISCOUNT,
        value: new Prisma.Decimal(10_000),
        maxDiscount: new Prisma.Decimal(10_000),
        minTransaction: new Prisma.Decimal(999_999),
        segment: UserSegment.RETAIL,
        startDate: validStart,
        endDate: validEnd,
      },
      {
        code: TEST_CODES.voucherStackTemplate,
        name: 'TEST Voucher Stack Fixed 5K',
        voucherType: VoucherType.NOMINAL_DISCOUNT,
        value: new Prisma.Decimal(5_000),
        maxDiscount: new Prisma.Decimal(5_000),
        minTransaction: new Prisma.Decimal(30_000),
        segment: UserSegment.RETAIL,
        startDate: validStart,
        endDate: validEnd,
      },
      {
        code: TEST_CODES.voucherB2BTemplate,
        name: 'TEST Voucher B2B Fixed 5K',
        voucherType: VoucherType.B2B_EXCLUSIVE,
        value: new Prisma.Decimal(5_000),
        maxDiscount: new Prisma.Decimal(5_000),
        minTransaction: new Prisma.Decimal(30_000),
        segment: UserSegment.B2B,
        startDate: validStart,
        endDate: validEnd,
      },
      {
        code: TEST_CODES.voucherRefundTemplate,
        name: 'TEST Voucher Refund Fixed 10K',
        voucherType: VoucherType.NOMINAL_DISCOUNT,
        value: new Prisma.Decimal(10_000),
        maxDiscount: new Prisma.Decimal(10_000),
        minTransaction: new Prisma.Decimal(50_000),
        segment: UserSegment.RETAIL,
        startDate: validStart,
        endDate: validEnd,
      },
    ];
    for (const template of templates) {
      await prisma.voucherTemplate.upsert({
        where: { code: template.code },
        update: {
          ...template,
          quota: 100,
          issuedCount: 0,
          perUserLimit: 10,
          isActive: true,
          applicableOutlets: servicePrice.outletId,
          applicableServices: servicePrice.serviceId,
          validityDays: null,
          isStackable: false,
        } as any,
        create: {
          ...template,
          quota: 100,
          issuedCount: 0,
          perUserLimit: 10,
          isActive: true,
          applicableOutlets: servicePrice.outletId,
          applicableServices: servicePrice.serviceId,
          validityDays: null,
          isStackable: false,
        } as any,
      });
    }

    const activePartner = await prisma.b2BPartner.upsert({
      where: { partnerCode: TEST_CODES.activePartnerCode },
      update: {
        companyName: 'TEST_B2B_ACTIVE Company',
        picName: 'TEST PIC Active',
        phone: '089900000101',
        tier: B2BPartnerTier.GOLD_PARTNER,
        status: 'ACTIVE',
      },
      create: {
        partnerCode: TEST_CODES.activePartnerCode,
        companyName: 'TEST_B2B_ACTIVE Company',
        picName: 'TEST PIC Active',
        phone: '089900000101',
        tier: B2BPartnerTier.GOLD_PARTNER,
        status: 'ACTIVE',
      },
    });
    const inactivePartner = await prisma.b2BPartner.upsert({
      where: { partnerCode: TEST_CODES.inactivePartnerCode },
      update: {
        companyName: 'TEST_B2B_INACTIVE Company',
        picName: 'TEST PIC Inactive',
        phone: '089900000102',
        tier: B2BPartnerTier.GOLD_PARTNER,
        status: 'SUSPENDED',
      },
      create: {
        partnerCode: TEST_CODES.inactivePartnerCode,
        companyName: 'TEST_B2B_INACTIVE Company',
        picName: 'TEST PIC Inactive',
        phone: '089900000102',
        tier: B2BPartnerTier.GOLD_PARTNER,
        status: 'SUSPENDED',
      },
    });
    const activePartnerWallet = await prisma.wallet.upsert({
      where: { partnerId: activePartner.id },
      update: { balance: new Prisma.Decimal(5_000_000), bonusBalance: 0, pointBalance: 0 },
      create: { partnerId: activePartner.id, balance: new Prisma.Decimal(5_000_000) },
    });
    const inactivePartnerWallet = await prisma.wallet.upsert({
      where: { partnerId: inactivePartner.id },
      update: { balance: new Prisma.Decimal(5_000_000), bonusBalance: 0, pointBalance: 0 },
      create: { partnerId: inactivePartner.id, balance: new Prisma.Decimal(5_000_000) },
    });
    await prisma.userMembershipStatus.upsert({
      where: { partnerId: activePartner.id },
      update: {
        segment: UserSegment.B2B,
        currentB2BTier: B2BPartnerTier.GOLD_PARTNER,
        earnedSpending: 0,
        successfulTxnCount: 0,
      },
      create: {
        partnerId: activePartner.id,
        segment: UserSegment.B2B,
        currentB2BTier: B2BPartnerTier.GOLD_PARTNER,
      },
    });
    await prisma.userMembershipStatus.upsert({
      where: { partnerId: inactivePartner.id },
      update: {
        segment: UserSegment.B2B,
        currentB2BTier: B2BPartnerTier.GOLD_PARTNER,
        earnedSpending: 0,
        successfulTxnCount: 0,
      },
      create: {
        partnerId: inactivePartner.id,
        segment: UserSegment.B2B,
        currentB2BTier: B2BPartnerTier.GOLD_PARTNER,
      },
    });

    await prisma.b2BPricingRule.upsert({
      where: { id: TEST_CODES.b2bRule },
      update: {
        name: TEST_CODES.b2bRule,
        partnerId: activePartner.id,
        outletId: servicePrice.outletId,
        serviceId: servicePrice.serviceId,
        machineType: servicePrice.service.machineType,
        priceType: 'FIXED_PRICE',
        value: new Prisma.Decimal(30_000),
        priority: 100,
        startDate: validStart,
        endDate: validEnd,
        isActive: true,
      },
      create: {
        id: TEST_CODES.b2bRule,
        name: TEST_CODES.b2bRule,
        partnerId: activePartner.id,
        outletId: servicePrice.outletId,
        serviceId: servicePrice.serviceId,
        machineType: servicePrice.service.machineType,
        priceType: 'FIXED_PRICE',
        value: new Prisma.Decimal(30_000),
        priority: 100,
        startDate: validStart,
        endDate: validEnd,
        isActive: true,
      },
    });

    // Promo code (publik) untuk skenario smoke promo discount. Idempoten: upsert promo
    // lalu ganti rule-nya (PromoRule tak punya unique selain id).
    const promo = await prisma.promo.upsert({
      where: { code: TEST_CODES.promoFixedCode },
      update: {
        name: 'TEST Promo Fixed 8K',
        promoType: PromoType.FIXED_AMOUNT,
        value: new Prisma.Decimal(8_000),
        startDate: validStart,
        endDate: validEnd,
        quota: null,
        usedCount: 0,
        isActive: true,
      },
      create: {
        code: TEST_CODES.promoFixedCode,
        name: 'TEST Promo Fixed 8K',
        promoType: PromoType.FIXED_AMOUNT,
        value: new Prisma.Decimal(8_000),
        startDate: validStart,
        endDate: validEnd,
        isActive: true,
      },
    });
    await prisma.promoRule.deleteMany({ where: { promoId: promo.id } });
    await prisma.promoRule.create({
      data: {
        promoId: promo.id,
        minTransaction: new Prisma.Decimal(50_000),
        applicableOutlets: servicePrice.outletId,
        applicableServices: servicePrice.serviceId,
        maxUsagePerCustomer: null,
      },
    });

    const templateByCode = new Map(
      await prisma.voucherTemplate
        .findMany({ where: { code: { startsWith: TEST_PREFIX } } })
        .then((rows) => rows.map((row) => [row.code, row] as const)),
    );
    const userVoucherRows = [
      [TEST_CODES.voucherPercentCode, TEST_CODES.voucherPercentTemplate, retailCustomer.id, null, UserSegment.RETAIL, validEnd],
      [TEST_CODES.voucherFixedCode, TEST_CODES.voucherFixedTemplate, retailCustomer.id, null, UserSegment.RETAIL, validEnd],
      [TEST_CODES.voucherExpiredCode, TEST_CODES.voucherExpiredTemplate, retailCustomer.id, null, UserSegment.RETAIL, expiredEnd],
      [TEST_CODES.voucherMinCode, TEST_CODES.voucherMinTemplate, retailCustomer.id, null, UserSegment.RETAIL, validEnd],
      [TEST_CODES.voucherStackCode, TEST_CODES.voucherStackTemplate, retailCustomer.id, null, UserSegment.RETAIL, validEnd],
      [TEST_CODES.voucherB2BCode, TEST_CODES.voucherB2BTemplate, null, activePartner.id, UserSegment.B2B, validEnd],
      [TEST_CODES.voucherRefundCode, TEST_CODES.voucherRefundTemplate, retailCustomer.id, null, UserSegment.RETAIL, validEnd],
    ] as const;
    for (const [code, templateCode, customerId, partnerId, segment, expiresAt] of userVoucherRows) {
      const template = templateByCode.get(templateCode);
      if (!template) throw new Error(`Template ${templateCode} tidak ditemukan`);
      await prisma.userVoucher.create({
        data: {
          templateId: template.id,
          customerId: customerId ?? undefined,
          partnerId: partnerId ?? undefined,
          segment,
          code,
          status: VoucherStatus.ACTIVE,
          sourceType: 'SMOKE_SEED',
          sourceId: template.id,
          expiresAt,
        },
      });
      await prisma.voucherTemplate.update({
        where: { id: template.id },
        data: { issuedCount: { increment: 1 } },
      });
    }

    return {
      outletId: servicePrice.outletId,
      outletName: servicePrice.outlet.name,
      serviceId: servicePrice.serviceId,
      serviceName: servicePrice.service.name,
      servicePrice: Number(servicePrice.price),
      machineType: servicePrice.service.machineType,
      retailCustomerId: retailCustomer.id,
      retailWalletId: retailWallet.id,
      activePartnerId: activePartner.id,
      activePartnerWalletId: activePartnerWallet.id,
      inactivePartnerId: inactivePartner.id,
    };
  } finally {
    if (shouldDisconnect) await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedPromoLoyaltySmokeData()
    .then((result) => {
      console.log(JSON.stringify({ ok: true, seed: result }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
