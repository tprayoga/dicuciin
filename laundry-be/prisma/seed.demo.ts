import {
  CampaignType,
  DeviceType,
  LedgerDirection,
  MembershipTier,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  PromoType,
  UserRole,
  UserSegment,
  VoucherStatus,
  VoucherType,
  WalletTransactionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const now = new Date();
const future = new Date(now.getTime() + 90 * 86_400_000);
const past = new Date(now.getTime() - 30 * 86_400_000);

const money = (value: number) => new Prisma.Decimal(value);

async function upsertUser(input: {
  email: string;
  phone: string;
  name: string;
  role: UserRole;
  passwordHash: string;
}) {
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      phone: input.phone,
      role: input.role,
      isActive: true,
    },
    create: {
      email: input.email,
      phone: input.phone,
      name: input.name,
      role: input.role,
      passwordHash: input.passwordHash,
      isActive: true,
      phoneVerifiedAt: now,
    },
  });
}

async function upsertService(input: {
  name: string;
  serviceType: string;
  machineType?: string;
  basePrice: number;
  estimateMinutes: number;
}) {
  const existing = await prisma.service.findFirst({ where: { name: input.name } });
  const data = {
    name: input.name,
    serviceType: input.serviceType,
    machineType: input.machineType,
    basePrice: money(input.basePrice),
    estimateMinutes: input.estimateMinutes,
    isActive: true,
  };
  if (existing) {
    return prisma.service.update({ where: { id: existing.id }, data });
  }
  return prisma.service.create({ data });
}

async function upsertVoucherTemplate(input: {
  code: string;
  name: string;
  voucherType: VoucherType;
  value: number;
  minTransaction?: number;
  maxDiscount?: number;
  tierRestriction?: MembershipTier;
}) {
  return prisma.voucherTemplate.upsert({
    where: { code: input.code },
    update: {
      name: input.name,
      voucherType: input.voucherType,
      value: money(input.value),
      minTransaction: input.minTransaction ? money(input.minTransaction) : null,
      maxDiscount: input.maxDiscount ? money(input.maxDiscount) : null,
      tierRestriction: input.tierRestriction,
      segment: UserSegment.RETAIL,
      validityDays: 45,
      startDate: past,
      endDate: future,
      isActive: true,
    },
    create: {
      code: input.code,
      name: input.name,
      voucherType: input.voucherType,
      value: money(input.value),
      minTransaction: input.minTransaction ? money(input.minTransaction) : undefined,
      maxDiscount: input.maxDiscount ? money(input.maxDiscount) : undefined,
      tierRestriction: input.tierRestriction,
      segment: UserSegment.RETAIL,
      validityDays: 45,
      startDate: past,
      endDate: future,
      isActive: true,
    },
  });
}

async function upsertUserVoucher(input: {
  templateId: string;
  customerId: string;
  code: string;
  status: VoucherStatus;
  expiresAt: Date;
}) {
  return prisma.userVoucher.upsert({
    where: { code: input.code },
    update: {
      templateId: input.templateId,
      customerId: input.customerId,
      segment: UserSegment.RETAIL,
      status: input.status,
      expiresAt: input.expiresAt,
      usedAt: input.status === VoucherStatus.USED ? past : null,
      sourceType: 'DEMO',
    },
    create: {
      templateId: input.templateId,
      customerId: input.customerId,
      segment: UserSegment.RETAIL,
      code: input.code,
      status: input.status,
      expiresAt: input.expiresAt,
      usedAt: input.status === VoucherStatus.USED ? past : undefined,
      sourceType: 'DEMO',
    },
  });
}

async function main() {
  console.log('Seed Di.Cuciin demo started...');
  const passwordHash = await bcrypt.hash('password123', 10);

  const users = await Promise.all([
    upsertUser({
      email: 'admin@dicuciin.local',
      phone: '080000000001',
      name: 'DEMO Admin Di.Cuciin',
      role: UserRole.SUPER_ADMIN,
      passwordHash,
    }),
    upsertUser({
      email: 'outlet.manager@dicuciin.local',
      phone: '080000000002',
      name: 'DEMO Outlet Manager',
      role: UserRole.ADMIN_OUTLET,
      passwordHash,
    }),
    upsertUser({
      email: 'operator@dicuciin.local',
      phone: '080000000003',
      name: 'DEMO Operator',
      role: UserRole.OPERATOR,
      passwordHash,
    }),
  ]);

  const outletInputs = [
    ['DEMO_DAGO', 'Di.Cuciin Bandung Dago', 'Jl. Ir. H. Juanda No. 88, Bandung', '022-1000-0001'],
    ['DEMO_TEBET', 'Di.Cuciin Jakarta Tebet', 'Jl. Tebet Raya No. 12, Jakarta Selatan', '021-1000-0002'],
    ['DEMO_GALAXY', 'Di.Cuciin Bekasi Galaxy', 'Jl. Galaxy Raya No. 21, Bekasi', '021-1000-0003'],
  ] as const;
  const outlets = [];
  for (const [code, name, address, phone] of outletInputs) {
    outlets.push(
      await prisma.outlet.upsert({
        where: { code },
        update: { name, address, phone, openTime: '07:00', closeTime: '22:00', isActive: true },
        create: { code, name, address, phone, openTime: '07:00', closeTime: '22:00', isActive: true },
      }),
    );
  }

  for (const outlet of outlets) {
    await prisma.outletUser.upsert({
      where: { outletId_userId: { outletId: outlet.id, userId: users[1].id } },
      update: { shiftName: 'FULL_DAY' },
      create: { outletId: outlet.id, userId: users[1].id, shiftName: 'FULL_DAY' },
    });
    await prisma.kiosk.upsert({
      where: { kioskCode: `DEMO_KIOSK_${outlet.code}` },
      update: { name: `Kiosk ${outlet.name}`, status: 'ACTIVE', lastHeartbeat: now },
      create: {
        outletId: outlet.id,
        kioskCode: `DEMO_KIOSK_${outlet.code}`,
        name: `Kiosk ${outlet.name}`,
        status: 'ACTIVE',
        lastHeartbeat: now,
      },
    });

    const statuses = ['AVAILABLE', 'RUNNING', 'OFFLINE', 'MAINTENANCE', 'AVAILABLE'];
    for (let i = 0; i < 5; i += 1) {
      const isDryer = i >= 3;
      const deviceCode = `DEMO_${outlet.code}_${isDryer ? 'DRYER' : 'WASHER'}_${i + 1}`;
      await prisma.iotDevice.upsert({
        where: { deviceCode },
        update: {
          name: `${isDryer ? 'Dryer' : 'Washing Machine'} ${i + 1}`,
          status: statuses[i],
          lastHeartbeatAt: statuses[i] === 'OFFLINE' ? null : now,
        },
        create: {
          outletId: outlet.id,
          deviceCode,
          deviceType: isDryer ? DeviceType.DRYER_MACHINE : DeviceType.WASHING_MACHINE,
          name: `${isDryer ? 'Dryer' : 'Washing Machine'} ${i + 1}`,
          manufacturer: 'DEMO',
          model: isDryer ? 'Dryer 12kg' : 'Washer 10kg',
          status: statuses[i],
          lastHeartbeatAt: statuses[i] === 'OFFLINE' ? undefined : now,
        },
      });
    }
  }

  const services = await Promise.all([
    upsertService({ name: 'Cuci Reguler', serviceType: 'WASH', machineType: 'WASHER', basePrice: 15000, estimateMinutes: 45 }),
    upsertService({ name: 'Cuci Express', serviceType: 'WASH', machineType: 'WASHER', basePrice: 25000, estimateMinutes: 30 }),
    upsertService({ name: 'Drying Only', serviceType: 'DRY', machineType: 'DRYER', basePrice: 10000, estimateMinutes: 35 }),
    upsertService({ name: 'Cuci + Kering', serviceType: 'WASH_DRY', machineType: 'WASHER_DRYER', basePrice: 30000, estimateMinutes: 80 }),
    upsertService({ name: 'Premium Care', serviceType: 'PREMIUM', machineType: 'WASHER', basePrice: 45000, estimateMinutes: 100 }),
  ]);
  for (const outlet of outlets) {
    for (const service of services) {
      await prisma.servicePrice.upsert({
        where: { serviceId_outletId: { serviceId: service.id, outletId: outlet.id } },
        update: {
          price: service.basePrice ?? money(0),
          unit: 'cycle',
          pricingType: 'FIXED',
          isActive: true,
        },
        create: {
          serviceId: service.id,
          outletId: outlet.id,
          price: service.basePrice ?? money(0),
          unit: 'cycle',
          pricingType: 'FIXED',
          isActive: true,
        },
      });
    }
  }

  const tierInputs = [
    [MembershipTier.SILVER, 'Silver', 1, 0, 0, 1, 1, '1 voucher bulanan, cashback poin 1%'],
    [MembershipTier.GOLD, 'Gold', 2, 250000, 5, 2, 2, '2 voucher bulanan, cashback poin 2%'],
    [MembershipTier.PLATINUM, 'Platinum', 3, 750000, 15, 3, 3, '3 voucher bulanan, cashback poin 3%'],
  ] as const;
  for (const [tier, name, level, spending, txn, multiplier, cashback, benefit] of tierInputs) {
    await prisma.membershipTierConfig.upsert({
      where: { tier },
      update: {
        name,
        level,
        thresholdSpending: money(spending),
        thresholdTxnCount: txn,
        pointMultiplier: money(multiplier),
        cashbackRate: money(cashback),
        benefitDescription: benefit,
        isActive: true,
      },
      create: {
        tier,
        name,
        level,
        thresholdSpending: money(spending),
        thresholdTxnCount: txn,
        pointMultiplier: money(multiplier),
        cashbackRate: money(cashback),
        benefitDescription: benefit,
        isActive: true,
      },
    });
  }

  const templates = {
    VOUCHER10K: await upsertVoucherTemplate({ code: 'DEMO_VOUCHER10K', name: 'VOUCHER10K', voucherType: VoucherType.NOMINAL_DISCOUNT, value: 10000, minTransaction: 30000 }),
    HEMAT20: await upsertVoucherTemplate({ code: 'DEMO_HEMAT20', name: 'HEMAT20', voucherType: VoucherType.PERCENTAGE_DISCOUNT, value: 20, maxDiscount: 15000 }),
    FREE_DRY: await upsertVoucherTemplate({ code: 'DEMO_FREE_DRY', name: 'FREE_DRY', voucherType: VoucherType.FREE_DRY, value: 10000 }),
    GOLD_MONTHLY: await upsertVoucherTemplate({ code: 'DEMO_GOLD_MONTHLY', name: 'GOLD_MONTHLY', voucherType: VoucherType.TIER_EXCLUSIVE, value: 15000, tierRestriction: MembershipTier.GOLD }),
    PLATINUM_SPECIAL: await upsertVoucherTemplate({ code: 'DEMO_PLATINUM_SPECIAL', name: 'PLATINUM_SPECIAL', voucherType: VoucherType.TIER_EXCLUSIVE, value: 25000, tierRestriction: MembershipTier.PLATINUM }),
  };

  const promoInputs = [
    ['DEMO_HAPPY_HOUR_PAGI', 'Happy Hour Pagi', PromoType.PERCENTAGE, 20, 'Aktif pukul 07:00-10:00'],
    ['DEMO_MEMBER_BARU', 'Member Baru', PromoType.FIXED_AMOUNT, 10000, 'Diskon member baru'],
    ['DEMO_GOLD_CASHBACK', 'Gold Cashback Booster', PromoType.CASHBACK, 2, 'Ekstra cashback poin Gold'],
    ['DEMO_PLATINUM_EXCLUSIVE', 'Platinum Exclusive', PromoType.PERCENTAGE, 25, 'Diskon khusus Platinum'],
    ['DEMO_WEEKEND_LAUNDRY', 'Weekend Laundry', PromoType.PERCENTAGE, 15, 'Diskon Sabtu-Minggu'],
  ] as const;
  for (const [code, name, promoType, value, description] of promoInputs) {
    const promo = await prisma.promo.upsert({
      where: { code },
      update: { name, promoType, value: money(value), description, startDate: past, endDate: future, isActive: true, quota: 500 },
      create: { code, name, promoType, value: money(value), description, startDate: past, endDate: future, isActive: true, quota: 500 },
    });
    await prisma.promoRule.deleteMany({ where: { promoId: promo.id } });
    await prisma.promoRule.create({
      data: {
        promoId: promo.id,
        minTransaction: code === 'DEMO_MEMBER_BARU' ? money(30000) : money(0),
        maxDiscount: promoType === PromoType.PERCENTAGE ? money(25000) : null,
        maxUsagePerCustomer: 3,
      },
    });
  }

  await prisma.happyHourRule.deleteMany({ where: { name: { startsWith: 'DEMO_' } } });
  await prisma.happyHourRule.create({
    data: {
      name: 'DEMO_Happy Hour Pagi',
      outletId: outlets[0].id,
      daysOfWeek: '1,2,3,4,5,6,7',
      startTime: '07:00',
      endTime: '10:00',
      adjustmentType: 'PERCENTAGE_OFF',
      value: money(20),
      startDate: past,
      endDate: future,
      isActive: true,
    },
  });

  await prisma.campaign.upsert({
    where: { id: 'DEMO_MONTHLY_TIER_CAMPAIGN' },
    update: {
      type: CampaignType.MONTHLY_TIER_BENEFIT,
      name: 'DEMO Monthly Tier Benefit',
      status: 'ACTIVE',
      isActive: true,
      startDate: past,
      endDate: future,
    },
    create: {
      id: 'DEMO_MONTHLY_TIER_CAMPAIGN',
      type: CampaignType.MONTHLY_TIER_BENEFIT,
      name: 'DEMO Monthly Tier Benefit',
      status: 'ACTIVE',
      isActive: true,
      startDate: past,
      endDate: future,
    },
  });

  const customerInputs = [
    ['andi.silver@dicuciin.local', '081111111111', 'Andi Silver', 'DEMO_CUST_SILVER', MembershipTier.SILVER, 50000, 120, 120000, 3],
    ['budi.gold@dicuciin.local', '082222222222', 'Budi Gold', 'DEMO_CUST_GOLD', MembershipTier.GOLD, 150000, 850, 360000, 7],
    ['citra.platinum@dicuciin.local', '083333333333', 'Citra Platinum', 'DEMO_CUST_PLATINUM', MembershipTier.PLATINUM, 300000, 2400, 980000, 18],
    ['deni.low@dicuciin.local', '084444444444', 'Deni Low Balance', 'DEMO_CUST_LOW', MembershipTier.SILVER, 5000, 50, 50000, 1],
    ['eka.novoucher@dicuciin.local', '085555555555', 'Eka No Voucher', 'DEMO_CUST_NOVOUCHER', MembershipTier.SILVER, 75000, 0, 0, 0],
  ] as const;
  const customers = new Map<string, { id: string; walletId: string }>();
  for (const [email, phone, name, memberCode, tier, balance, points, spending, txn] of customerInputs) {
    const user = await upsertUser({ email, phone, name, role: UserRole.CUSTOMER, passwordHash });
    const customer = await prisma.customer.upsert({
      where: { userId: user.id },
      update: { memberCode },
      create: { userId: user.id, memberCode },
    });
    const wallet = await prisma.wallet.upsert({
      where: { customerId: customer.id },
      update: { balance: money(balance), bonusBalance: money(0), pointBalance: points },
      create: { customerId: customer.id, balance: money(balance), bonusBalance: money(0), pointBalance: points },
    });
    await prisma.userMembershipStatus.upsert({
      where: { customerId: customer.id },
      update: {
        segment: UserSegment.RETAIL,
        currentTier: tier,
        earnedSpending: money(spending),
        successfulTxnCount: txn,
        evaluatedAt: now,
      },
      create: {
        customerId: customer.id,
        segment: UserSegment.RETAIL,
        currentTier: tier,
        earnedSpending: money(spending),
        successfulTxnCount: txn,
        achievedAt: now,
        evaluatedAt: now,
      },
    });
    customers.set(memberCode, { id: customer.id, walletId: wallet.id });

    await prisma.walletTransaction.upsert({
      where: { idempotencyKey: `DEMO_WALLET_TOPUP_${memberCode}` },
      update: { amount: money(balance), balanceBefore: money(0), balanceAfter: money(balance), description: 'DEMO top up saldo awal' },
      create: {
        walletId: wallet.id,
        transactionType: WalletTransactionType.TOPUP,
        amount: money(balance),
        balanceBefore: money(0),
        balanceAfter: money(balance),
        description: 'DEMO top up saldo awal',
        idempotencyKey: `DEMO_WALLET_TOPUP_${memberCode}`,
      },
    });
    if (points > 0) {
      await prisma.pointLedger.upsert({
        where: { idempotencyKey: `DEMO_POINT_EARN_${memberCode}` },
        update: { points, balanceBefore: 0, balanceAfter: points, description: 'DEMO akumulasi poin transaksi' },
        create: {
          walletId: wallet.id,
          direction: LedgerDirection.CREDIT,
          points,
          balanceBefore: 0,
          balanceAfter: points,
          sourceType: 'ORDER',
          sourceId: `DEMO_${memberCode}`,
          expiresAt: future,
          description: 'DEMO akumulasi poin transaksi',
          idempotencyKey: `DEMO_POINT_EARN_${memberCode}`,
        },
      });
    }
  }

  const c = (memberCode: string) => {
    const customer = customers.get(memberCode);
    if (!customer) throw new Error(`Missing customer ${memberCode}`);
    return customer;
  };
  const active = future;
  const expired = new Date(now.getTime() - 3 * 86_400_000);
  await upsertUserVoucher({ templateId: templates.VOUCHER10K.id, customerId: c('DEMO_CUST_SILVER').id, code: 'DEMO_ANDI_VOUCHER10K', status: VoucherStatus.ACTIVE, expiresAt: active });
  await upsertUserVoucher({ templateId: templates.HEMAT20.id, customerId: c('DEMO_CUST_SILVER').id, code: 'DEMO_ANDI_HEMAT20', status: VoucherStatus.ACTIVE, expiresAt: active });
  await upsertUserVoucher({ templateId: templates.FREE_DRY.id, customerId: c('DEMO_CUST_SILVER').id, code: 'DEMO_ANDI_EXPIRED', status: VoucherStatus.EXPIRED, expiresAt: expired });
  await upsertUserVoucher({ templateId: templates.VOUCHER10K.id, customerId: c('DEMO_CUST_GOLD').id, code: 'DEMO_BUDI_VOUCHER10K', status: VoucherStatus.ACTIVE, expiresAt: active });
  await upsertUserVoucher({ templateId: templates.GOLD_MONTHLY.id, customerId: c('DEMO_CUST_GOLD').id, code: 'DEMO_BUDI_GOLD_MONTHLY', status: VoucherStatus.ACTIVE, expiresAt: active });
  await upsertUserVoucher({ templateId: templates.HEMAT20.id, customerId: c('DEMO_CUST_GOLD').id, code: 'DEMO_BUDI_HEMAT20_USED', status: VoucherStatus.USED, expiresAt: active });
  await upsertUserVoucher({ templateId: templates.FREE_DRY.id, customerId: c('DEMO_CUST_GOLD').id, code: 'DEMO_BUDI_EXPIRED', status: VoucherStatus.EXPIRED, expiresAt: expired });
  const citraVoucher = await upsertUserVoucher({ templateId: templates.PLATINUM_SPECIAL.id, customerId: c('DEMO_CUST_PLATINUM').id, code: 'DEMO_CITRA_PLATINUM_SPECIAL', status: VoucherStatus.ACTIVE, expiresAt: active });
  await upsertUserVoucher({ templateId: templates.GOLD_MONTHLY.id, customerId: c('DEMO_CUST_PLATINUM').id, code: 'DEMO_CITRA_GOLD_MONTHLY', status: VoucherStatus.ACTIVE, expiresAt: active });
  await upsertUserVoucher({ templateId: templates.VOUCHER10K.id, customerId: c('DEMO_CUST_PLATINUM').id, code: 'DEMO_CITRA_VOUCHER10K', status: VoucherStatus.ACTIVE, expiresAt: active });
  await upsertUserVoucher({ templateId: templates.HEMAT20.id, customerId: c('DEMO_CUST_PLATINUM').id, code: 'DEMO_CITRA_HEMAT20', status: VoucherStatus.ACTIVE, expiresAt: active });
  await upsertUserVoucher({ templateId: templates.FREE_DRY.id, customerId: c('DEMO_CUST_PLATINUM').id, code: 'DEMO_CITRA_USED', status: VoucherStatus.USED, expiresAt: active });
  await upsertUserVoucher({ templateId: templates.VOUCHER10K.id, customerId: c('DEMO_CUST_LOW').id, code: 'DEMO_DENI_VOUCHER10K', status: VoucherStatus.ACTIVE, expiresAt: active });
  await upsertUserVoucher({ templateId: templates.FREE_DRY.id, customerId: c('DEMO_CUST_NOVOUCHER').id, code: 'DEMO_EKA_EXPIRED', status: VoucherStatus.EXPIRED, expiresAt: expired });

  const paidPromo = await prisma.promo.findUniqueOrThrow({ where: { code: 'DEMO_HAPPY_HOUR_PAGI' } });
  const orderInputs = [
    ['DEMO_ORDER_PAID', c('DEMO_CUST_SILVER').id, OrderStatus.PAID, 30000, 10000],
    ['DEMO_ORDER_PENDING', c('DEMO_CUST_GOLD').id, OrderStatus.WAITING_PAYMENT, 45000, 0],
    ['DEMO_ORDER_PROCESSING', c('DEMO_CUST_PLATINUM').id, OrderStatus.WASHING, 60000, 15000],
    ['DEMO_ORDER_COMPLETED', c('DEMO_CUST_PLATINUM').id, OrderStatus.COMPLETED, 90000, 25000],
    ['DEMO_ORDER_CANCELLED', c('DEMO_CUST_LOW').id, OrderStatus.CANCELLED, 30000, 0],
  ] as const;
  for (const [orderNumber, customerId, status, subtotal, discount] of orderInputs) {
    const order = await prisma.order.upsert({
      where: { orderNumber },
      update: {
        customerId,
        outletId: outlets[0].id,
        promoId: orderNumber === 'DEMO_ORDER_PAID' ? paidPromo.id : null,
        sourcePlatform: 'MOBILE_APP',
        status,
        subtotal: money(subtotal),
        discountAmount: money(discount),
        totalAmount: money(subtotal - discount),
      },
      create: {
        orderNumber,
        customerId,
        outletId: outlets[0].id,
        promoId: orderNumber === 'DEMO_ORDER_PAID' ? paidPromo.id : undefined,
        sourcePlatform: 'MOBILE_APP',
        status,
        subtotal: money(subtotal),
        discountAmount: money(discount),
        totalAmount: money(subtotal - discount),
      },
    });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.orderStatusLog.deleteMany({ where: { orderId: order.id } });
    await prisma.payment.deleteMany({ where: { orderId: order.id } });
    await prisma.promoUsage.deleteMany({ where: { orderId: order.id } });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        serviceId: services[3].id,
        serviceName: services[3].name,
        quantity: 1,
        unit: 'cycle',
        pricePerUnit: money(subtotal),
        subtotal: money(subtotal),
      },
    });
    await prisma.orderStatusLog.create({ data: { orderId: order.id, status, notes: 'DEMO status order' } });
    await prisma.payment.create({
      data: {
        orderId: order.id,
        paymentNumber: `PAY_${orderNumber}`,
        paymentMethod: PaymentMethod.WALLET,
        amount: money(subtotal - discount),
        status: status === OrderStatus.WAITING_PAYMENT ? PaymentStatus.PENDING : status === OrderStatus.CANCELLED ? PaymentStatus.FAILED : PaymentStatus.PAID,
        paidAt: status === OrderStatus.WAITING_PAYMENT || status === OrderStatus.CANCELLED ? undefined : now,
      },
    });
    if (orderNumber === 'DEMO_ORDER_PAID') {
      await prisma.promoUsage.create({
        data: { promoId: paidPromo.id, customerId, orderId: order.id, discount: money(discount) },
      });
    }
    if (orderNumber === 'DEMO_ORDER_COMPLETED') {
      await prisma.voucherRedemption.deleteMany({ where: { orderId: order.id } });
      await prisma.voucherRedemption.create({
        data: {
          userVoucherId: citraVoucher.id,
          orderId: order.id,
          customerId,
          discountApplied: money(discount),
          status: 'APPLIED',
        },
      });
    }
  }

  const summary = {
    outlets: await prisma.outlet.count({ where: { code: { startsWith: 'DEMO_' } } }),
    machines: await prisma.iotDevice.count({ where: { deviceCode: { startsWith: 'DEMO_' } } }),
    customers: await prisma.customer.count({ where: { memberCode: { startsWith: 'DEMO_' } } }),
    wallets: await prisma.wallet.count({ where: { customer: { memberCode: { startsWith: 'DEMO_' } } } }),
    tiers: await prisma.membershipTierConfig.count({ where: { tier: { in: [MembershipTier.SILVER, MembershipTier.GOLD, MembershipTier.PLATINUM] } } }),
    vouchers: await prisma.voucherTemplate.count({ where: { code: { startsWith: 'DEMO_' } } }),
    userVouchers: await prisma.userVoucher.count({ where: { code: { startsWith: 'DEMO_' } } }),
    promoCampaigns: await prisma.promo.count({ where: { code: { startsWith: 'DEMO_' } } }),
    orders: await prisma.order.count({ where: { orderNumber: { startsWith: 'DEMO_' } } }),
    payments: await prisma.payment.count({ where: { paymentNumber: { startsWith: 'PAY_DEMO_' } } }),
    pointLedgers: await prisma.pointLedger.count({ where: { idempotencyKey: { startsWith: 'DEMO_' } } }),
  };

  console.log('Seed completed:');
  Object.entries(summary).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
