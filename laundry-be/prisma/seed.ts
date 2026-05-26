import {
  DeviceType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  PromoType,
  UserRole,
  WalletTransactionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type SeedUser = {
  email: string;
  phone: string;
  name: string;
  role: UserRole;
  isActive?: boolean;
};

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

async function cleanTransactionalData() {
  await prisma.auditLog.deleteMany();
  await prisma.iotEvent.deleteMany();
  await prisma.iotCommand.deleteMany();
  await prisma.kioskSession.deleteMany();
  await prisma.promoUsage.deleteMany();
  await prisma.promoRule.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.orderStatusLog.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.customerAddress.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.iotDevice.deleteMany();
  await prisma.kiosk.deleteMany();
  await prisma.servicePrice.deleteMany();
  await prisma.service.deleteMany();
  await prisma.outletUser.deleteMany();
  await prisma.promo.deleteMany();
  await prisma.outlet.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log('🌱 Starting comprehensive seed...');

  const hashedPassword = await bcrypt.hash('Password123!', 10);
  await cleanTransactionalData();

  const userSeeds: SeedUser[] = [
    {
      email: 'admin@laundry.local',
      phone: '081234567890',
      name: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
    },
    {
      email: 'owner@dicuciin.id',
      phone: '081200000001',
      name: 'Owner Laundry',
      role: UserRole.OWNER,
    },
    {
      email: 'admin.outlet1@dicuciin.id',
      phone: '081200000011',
      name: 'Admin Sudirman',
      role: UserRole.ADMIN_OUTLET,
    },
    {
      email: 'admin.outlet2@dicuciin.id',
      phone: '081200000012',
      name: 'Admin Kemang',
      role: UserRole.ADMIN_OUTLET,
    },
    {
      email: 'cashier.1@dicuciin.id',
      phone: '081200000021',
      name: 'Kasir Pagi',
      role: UserRole.CASHIER,
    },
    {
      email: 'cashier.2@dicuciin.id',
      phone: '081200000022',
      name: 'Kasir Sore',
      role: UserRole.CASHIER,
    },
    {
      email: 'operator.1@dicuciin.id',
      phone: '081200000031',
      name: 'Operator Washer',
      role: UserRole.OPERATOR,
    },
    {
      email: 'operator.2@dicuciin.id',
      phone: '081200000032',
      name: 'Operator Dryer',
      role: UserRole.OPERATOR,
    },
    {
      email: 'tech.1@dicuciin.id',
      phone: '081200000041',
      name: 'Teknisi Mesin',
      role: UserRole.TECHNICIAN,
    },
    {
      email: 'member.1@dicuciin.id',
      phone: '081811111001',
      name: 'Budi Sudarsono',
      role: UserRole.CUSTOMER,
    },
    {
      email: 'member.2@dicuciin.id',
      phone: '081811111002',
      name: 'Siti Aminah',
      role: UserRole.CUSTOMER,
    },
    {
      email: 'member.3@dicuciin.id',
      phone: '081811111003',
      name: 'Andi Saputra',
      role: UserRole.CUSTOMER,
    },
    {
      email: 'member.4@dicuciin.id',
      phone: '081811111004',
      name: 'Citra Lestari',
      role: UserRole.CUSTOMER,
    },
    {
      email: 'member.5@dicuciin.id',
      phone: '081811111005',
      name: 'Dewi Maharani',
      role: UserRole.CUSTOMER,
    },
  ];

  for (const user of userSeeds) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive ?? true,
      },
      create: {
        email: user.email,
        phone: user.phone,
        name: user.name,
        passwordHash: hashedPassword,
        role: user.role,
        isActive: user.isActive ?? true,
      },
    });
  }
  const users = await prisma.user.findMany({ where: { email: { not: null } } });
  const userByEmail = new Map(users.map((u) => [u.email!, u]));
  console.log(`✅ Users ready: ${users.length}`);

  const outlets = [
    {
      code: 'OUT-001',
      name: 'Cleanova Sudirman',
      address: 'Jl. Jend. Sudirman No. 12, Jakarta Selatan',
      phone: '021-8800001',
      openTime: '07:00',
      closeTime: '22:00',
      imageUrl: '/uploads/outlet-sudirman.jpg',
      latitude: -6.21462,
      longitude: 106.84513,
    },
    {
      code: 'OUT-002',
      name: 'Cleanova Kemang',
      address: 'Jl. Kemang Raya No. 8, Jakarta Selatan',
      phone: '021-8800002',
      openTime: '08:00',
      closeTime: '22:00',
      imageUrl: '/uploads/outlet-kemang.jpg',
      latitude: -6.26149,
      longitude: 106.81195,
    },
    {
      code: 'OUT-003',
      name: 'Cleanova Bekasi',
      address: 'Jl. Ahmad Yani No. 21, Bekasi',
      phone: '021-8800003',
      openTime: '07:30',
      closeTime: '21:00',
      imageUrl: '/uploads/outlet-bekasi.jpg',
      latitude: -6.24159,
      longitude: 106.99242,
    },
  ];

  for (const outlet of outlets) {
    await prisma.outlet.upsert({
      where: { code: outlet.code },
      update: outlet,
      create: outlet,
    });
  }
  const outletRows = await prisma.outlet.findMany();
  const outletByCode = new Map(outletRows.map((o) => [o.code, o]));
  console.log(`✅ Outlets ready: ${outletRows.length}`);

  const outletAssignments = [
    { outletCode: 'OUT-001', email: 'owner@dicuciin.id', shiftName: 'FULL DAY' },
    {
      outletCode: 'OUT-001',
      email: 'admin.outlet1@dicuciin.id',
      shiftName: 'FULL DAY',
    },
    { outletCode: 'OUT-001', email: 'cashier.1@dicuciin.id', shiftName: 'PAGI' },
    { outletCode: 'OUT-001', email: 'operator.1@dicuciin.id', shiftName: 'PAGI' },
    { outletCode: 'OUT-001', email: 'tech.1@dicuciin.id', shiftName: 'ON_CALL' },
    { outletCode: 'OUT-002', email: 'owner@dicuciin.id', shiftName: 'FULL DAY' },
    {
      outletCode: 'OUT-002',
      email: 'admin.outlet2@dicuciin.id',
      shiftName: 'FULL DAY',
    },
    { outletCode: 'OUT-002', email: 'cashier.2@dicuciin.id', shiftName: 'SORE' },
    { outletCode: 'OUT-002', email: 'operator.2@dicuciin.id', shiftName: 'SORE' },
    { outletCode: 'OUT-003', email: 'owner@dicuciin.id', shiftName: 'FULL DAY' },
  ];

  for (const assignment of outletAssignments) {
    const outlet = outletByCode.get(assignment.outletCode);
    const user = userByEmail.get(assignment.email);
    if (!outlet || !user) continue;
    await prisma.outletUser.upsert({
      where: {
        outletId_userId: {
          outletId: outlet.id,
          userId: user.id,
        },
      },
      update: { shiftName: assignment.shiftName },
      create: {
        outletId: outlet.id,
        userId: user.id,
        shiftName: assignment.shiftName,
      },
    });
  }
  console.log('✅ Outlet assignments ready');

  const services = [
    {
      name: 'Cuci Dingin (Cold Wash) 15kg',
      serviceType: 'WASH',
      machineType: 'WASHER',
      capacityKg: 15,
      estimateMinutes: 30,
      basePrice: 50000,
      description: 'Paket cuci dingin untuk mesin washer 15kg',
    },
    {
      name: 'Cuci + Kering 15kg',
      serviceType: 'WASH_DRY',
      machineType: 'WASHER_DRYER',
      capacityKg: 15,
      estimateMinutes: 60,
      basePrice: 80000,
      description: 'Paket cuci + kering mesin kapasitas 15kg',
    },
    {
      name: 'Setrika Premium',
      serviceType: 'IRON',
      machineType: 'IRON',
      capacityKg: 10,
      estimateMinutes: 45,
      basePrice: 35000,
      description: 'Layanan setrika premium anti kusut',
    },
    {
      name: 'Express 3 Jam',
      serviceType: 'EXPRESS',
      machineType: 'WASHER_DRYER',
      capacityKg: 8,
      estimateMinutes: 180,
      basePrice: 120000,
      description: 'Selesai dalam 3 jam',
    },
    {
      name: 'Dry Clean Jas',
      serviceType: 'DRY_CLEAN',
      machineType: 'DRY_CLEAN',
      capacityKg: 2,
      estimateMinutes: 1440,
      basePrice: 90000,
      description: 'Dry clean khusus jas/suit',
    },
    {
      name: 'Cuci Sepatu',
      serviceType: 'SHOES',
      machineType: 'MANUAL',
      capacityKg: 1,
      estimateMinutes: 240,
      basePrice: 60000,
      description: 'Cuci sepatu dan detailing',
    },
  ];

  for (const service of services) {
    const existingService = await prisma.service.findFirst({
      where: { name: service.name },
    });
    if (existingService) {
      await prisma.service.update({
        where: { id: existingService.id },
        data: service,
      });
    } else {
      await prisma.service.create({ data: service });
    }
  }
  const serviceRows = await prisma.service.findMany();
  const serviceByName = new Map(serviceRows.map((s) => [s.name, s]));
  console.log(`✅ Services ready: ${serviceRows.length}`);

  const outletPriceMultiplier: Record<string, number> = {
    'OUT-001': 1,
    'OUT-002': 1.05,
    'OUT-003': 0.95,
  };
  for (const outlet of outletRows) {
    for (const service of serviceRows) {
      const price = Math.round((service.basePrice ?? 0) * outletPriceMultiplier[outlet.code]);
      await prisma.servicePrice.upsert({
        where: {
          serviceId_outletId: {
            serviceId: service.id,
            outletId: outlet.id,
          },
        },
        update: {
          pricingType: 'FLAT',
          price,
          unit: 'paket',
          estimatedDurationHours: Math.max(
            1,
            Math.round((service.estimateMinutes ?? 60) / 60),
          ),
          isActive: true,
        },
        create: {
          serviceId: service.id,
          outletId: outlet.id,
          pricingType: 'FLAT',
          price,
          unit: 'paket',
          estimatedDurationHours: Math.max(
            1,
            Math.round((service.estimateMinutes ?? 60) / 60),
          ),
          isActive: true,
        },
      });
    }
  }
  console.log('✅ Service prices ready');

  const customerSeeds = [
    { email: 'member.1@dicuciin.id', memberCode: 'MBR001', gender: 'L', balance: 350000 },
    { email: 'member.2@dicuciin.id', memberCode: 'MBR002', gender: 'P', balance: 175000 },
    { email: 'member.3@dicuciin.id', memberCode: 'MBR003', gender: 'L', balance: 225000 },
    { email: 'member.4@dicuciin.id', memberCode: 'MBR004', gender: 'P', balance: 90000 },
    { email: 'member.5@dicuciin.id', memberCode: 'MBR005', gender: 'P', balance: 420000 },
  ];

  for (let i = 0; i < customerSeeds.length; i += 1) {
    const seed = customerSeeds[i];
    const user = userByEmail.get(seed.email);
    if (!user) continue;
    const birthYear = 1992 + i;
    const customer = await prisma.customer.upsert({
      where: { memberCode: seed.memberCode },
      update: {
        userId: user.id,
        gender: seed.gender,
        birthDate: new Date(`${birthYear}-05-10T00:00:00.000Z`),
      },
      create: {
        userId: user.id,
        memberCode: seed.memberCode,
        gender: seed.gender,
        birthDate: new Date(`${birthYear}-05-10T00:00:00.000Z`),
      },
    });

    await prisma.customerAddress.create({
      data: {
        customerId: customer.id,
        label: 'Rumah',
        recipientName: user.name,
        phone: user.phone ?? '-',
        address: `Jl. Contoh No. ${i + 1}`,
        city: 'Jakarta',
        province: 'DKI Jakarta',
        postalCode: `12${i}45`,
        isDefault: true,
      },
    });

    if (i < 2) {
      await prisma.customerAddress.create({
        data: {
          customerId: customer.id,
          label: 'Kantor',
          recipientName: user.name,
          phone: user.phone ?? '-',
          address: `Gedung Perkantoran ${i + 1}, Lt. ${i + 3}`,
          city: 'Jakarta',
          province: 'DKI Jakarta',
          postalCode: `13${i}77`,
          isDefault: false,
        },
      });
    }

    await prisma.wallet.upsert({
      where: { customerId: customer.id },
      update: { balance: seed.balance },
      create: {
        customerId: customer.id,
        balance: seed.balance,
      },
    });
  }

  const customers = await prisma.customer.findMany({ include: { user: true, wallet: true } });
  console.log(`✅ Customers ready: ${customers.length}`);

  for (const customer of customers) {
    if (!customer.wallet) continue;
    const balance = customer.wallet.balance;
    await prisma.walletTransaction.create({
      data: {
        walletId: customer.wallet.id,
        transactionType: WalletTransactionType.TOPUP,
        amount: balance,
        balanceBefore: 0,
        balanceAfter: balance,
        description: `Topup awal saldo member ${customer.memberCode}`,
        idempotencyKey: `seed-topup-${customer.memberCode}`,
      },
    });
  }
  console.log('✅ Wallet transactions ready');

  const promoSeeds = [
    {
      code: 'WELCOME20',
      name: 'Diskon Member Baru 20%',
      description: 'Diskon 20% maksimal Rp 25.000 untuk transaksi pertama',
      promoType: PromoType.PERCENTAGE,
      value: 20,
      quota: 1000,
      isActive: true,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.000Z'),
      maxDiscount: 25000,
      minTransaction: 50000,
    },
    {
      code: 'HEMAT10K',
      name: 'Potongan Rp 10.000',
      description: 'Potongan langsung Rp 10.000',
      promoType: PromoType.FIXED_AMOUNT,
      value: 10000,
      quota: 300,
      isActive: true,
      startDate: new Date('2026-03-01T00:00:00.000Z'),
      endDate: new Date('2026-08-31T23:59:59.000Z'),
      maxDiscount: 10000,
      minTransaction: 70000,
    },
    {
      code: 'CASHBACK5',
      name: 'Cashback Wallet 5%',
      description: 'Cashback 5% ke wallet member',
      promoType: PromoType.CASHBACK,
      value: 5,
      quota: 500,
      isActive: true,
      startDate: new Date('2026-04-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.000Z'),
      maxDiscount: 30000,
      minTransaction: 60000,
    },
  ];

  for (const promo of promoSeeds) {
    const savedPromo = await prisma.promo.upsert({
      where: { code: promo.code },
      update: {
        name: promo.name,
        description: promo.description,
        promoType: promo.promoType,
        value: promo.value,
        quota: promo.quota,
        isActive: promo.isActive,
        startDate: promo.startDate,
        endDate: promo.endDate,
        usedCount: 0,
      },
      create: {
        code: promo.code,
        name: promo.name,
        description: promo.description,
        bannerUrl: `/uploads/promo-${promo.code.toLowerCase()}.jpg`,
        promoType: promo.promoType,
        value: promo.value,
        quota: promo.quota,
        isActive: promo.isActive,
        startDate: promo.startDate,
        endDate: promo.endDate,
        usedCount: 0,
      },
    });

    await prisma.promoRule.create({
      data: {
        promoId: savedPromo.id,
        minTransaction: promo.minTransaction,
        maxDiscount: promo.maxDiscount,
        maxUsagePerCustomer: 2,
        applicableServices: 'ALL',
        applicableOutlets: 'ALL',
      },
    });
  }
  const promos = await prisma.promo.findMany();
  console.log(`✅ Promos ready: ${promos.length}`);

  const kioskSeeds = [
    { outletCode: 'OUT-001', kioskCode: 'KSK-SDM-01', name: 'Kiosk Sudirman A', location: 'Lobby' },
    { outletCode: 'OUT-001', kioskCode: 'KSK-SDM-02', name: 'Kiosk Sudirman B', location: 'Kasir' },
    { outletCode: 'OUT-002', kioskCode: 'KSK-KMG-01', name: 'Kiosk Kemang', location: 'Depan Toko' },
    { outletCode: 'OUT-003', kioskCode: 'KSK-BKS-01', name: 'Kiosk Bekasi', location: 'Area Tunggu' },
  ];

  for (const kiosk of kioskSeeds) {
    const outlet = outletByCode.get(kiosk.outletCode);
    if (!outlet) continue;
    await prisma.kiosk.upsert({
      where: { kioskCode: kiosk.kioskCode },
      update: {
        outletId: outlet.id,
        name: kiosk.name,
        location: kiosk.location,
        status: 'ACTIVE',
        lastHeartbeat: new Date(),
      },
      create: {
        outletId: outlet.id,
        kioskCode: kiosk.kioskCode,
        name: kiosk.name,
        location: kiosk.location,
        status: 'ACTIVE',
        lastHeartbeat: new Date(),
      },
    });
  }
  const kiosks = await prisma.kiosk.findMany();
  const kioskByCode = new Map(kiosks.map((k) => [k.kioskCode, k]));
  console.log(`✅ Kiosks ready: ${kiosks.length}`);

  for (const customer of customers.slice(0, 3)) {
    const kiosk = kiosks[Math.floor(Math.random() * kiosks.length)];
    await prisma.kioskSession.create({
      data: {
        kioskId: kiosk.id,
        customerId: customer.id,
        startedAt: addHours(new Date(), -2),
        endedAt: addHours(new Date(), -1),
      },
    });
  }

  const deviceSeeds = [
    {
      outletCode: 'OUT-001',
      kioskCode: 'KSK-SDM-01',
      deviceCode: 'WS-01',
      deviceType: DeviceType.WASHING_MACHINE,
      name: 'Washer LG 01',
    },
    {
      outletCode: 'OUT-001',
      kioskCode: 'KSK-SDM-01',
      deviceCode: 'DR-01',
      deviceType: DeviceType.DRYER_MACHINE,
      name: 'Dryer LG 01',
    },
    {
      outletCode: 'OUT-001',
      kioskCode: 'KSK-SDM-02',
      deviceCode: 'SC-01',
      deviceType: DeviceType.DIGITAL_SCALE,
      name: 'Timbangan Digital',
    },
    {
      outletCode: 'OUT-002',
      kioskCode: 'KSK-KMG-01',
      deviceCode: 'WS-02',
      deviceType: DeviceType.WASHING_MACHINE,
      name: 'Washer Samsung 02',
    },
    {
      outletCode: 'OUT-002',
      kioskCode: 'KSK-KMG-01',
      deviceCode: 'PR-01',
      deviceType: DeviceType.RECEIPT_PRINTER,
      name: 'Printer Kasir 01',
    },
    {
      outletCode: 'OUT-003',
      kioskCode: 'KSK-BKS-01',
      deviceCode: 'WS-03',
      deviceType: DeviceType.WASHING_MACHINE,
      name: 'Washer Electrolux 03',
    },
  ];

  for (const device of deviceSeeds) {
    const outlet = outletByCode.get(device.outletCode);
    const kiosk = kioskByCode.get(device.kioskCode);
    if (!outlet) continue;
    await prisma.iotDevice.upsert({
      where: { deviceCode: device.deviceCode },
      update: {
        outletId: outlet.id,
        kioskId: kiosk?.id,
        deviceType: device.deviceType,
        name: device.name,
        manufacturer: 'LG',
        model: 'Smart Laundry V2',
        firmwareVersion: '2.5.1',
        status: 'ONLINE',
        lastHeartbeatAt: new Date(),
        metadata: { seed: true, area: device.outletCode },
      },
      create: {
        outletId: outlet.id,
        kioskId: kiosk?.id,
        deviceCode: device.deviceCode,
        deviceType: device.deviceType,
        name: device.name,
        manufacturer: 'LG',
        model: 'Smart Laundry V2',
        firmwareVersion: '2.5.1',
        status: 'ONLINE',
        lastHeartbeatAt: new Date(),
        metadata: { seed: true, area: device.outletCode },
      },
    });
  }
  const devices = await prisma.iotDevice.findMany();
  console.log(`✅ IoT devices ready: ${devices.length}`);

  for (const device of devices) {
    await prisma.iotCommand.create({
      data: {
        deviceId: device.id,
        command: 'PING',
        payload: { source: 'seed' },
        status: 'SUCCESS',
        sentAt: addHours(new Date(), -1),
        executedAt: addHours(new Date(), -1),
        response: { ok: true },
      },
    });
    await prisma.iotEvent.create({
      data: {
        deviceId: device.id,
        eventType: 'HEARTBEAT',
        payload: { battery: 95, signal: 'strong' },
      },
    });
  }
  console.log('✅ IoT commands/events ready');

  const addressMap = new Map(
    (
      await prisma.customerAddress.findMany({
        include: {
          customer: true,
        },
      })
    ).map((a) => [a.customer.memberCode, a]),
  );

  const orderTemplates = [
    { number: 'ORD-20260526-0001', memberCode: 'MBR001', outletCode: 'OUT-001', status: OrderStatus.COMPLETED, serviceName: 'Cuci Dingin (Cold Wash) 15kg', qty: 1, payment: PaymentMethod.QRIS, withPromo: true },
    { number: 'ORD-20260526-0002', memberCode: 'MBR002', outletCode: 'OUT-001', status: OrderStatus.PAID, serviceName: 'Cuci + Kering 15kg', qty: 1, payment: PaymentMethod.CASH, withPromo: false },
    { number: 'ORD-20260526-0003', memberCode: 'MBR003', outletCode: 'OUT-002', status: OrderStatus.WASHING, serviceName: 'Express 3 Jam', qty: 1, payment: PaymentMethod.TRANSFER, withPromo: true },
    { number: 'ORD-20260526-0004', memberCode: 'MBR004', outletCode: 'OUT-002', status: OrderStatus.READY_PICKUP, serviceName: 'Setrika Premium', qty: 2, payment: PaymentMethod.WALLET, withPromo: false },
    { number: 'ORD-20260526-0005', memberCode: 'MBR005', outletCode: 'OUT-003', status: OrderStatus.RECEIVED, serviceName: 'Dry Clean Jas', qty: 1, payment: PaymentMethod.QRIS, withPromo: false },
    { number: 'ORD-20260526-0006', memberCode: 'MBR001', outletCode: 'OUT-003', status: OrderStatus.DRAFT, serviceName: 'Cuci Sepatu', qty: 1, payment: PaymentMethod.CASH, withPromo: false },
    { number: 'ORD-20260526-0007', memberCode: 'MBR002', outletCode: 'OUT-001', status: OrderStatus.COMPLETED, serviceName: 'Cuci + Kering 15kg', qty: 1, payment: PaymentMethod.WALLET, withPromo: true },
    { number: 'ORD-20260526-0008', memberCode: 'MBR003', outletCode: 'OUT-001', status: OrderStatus.CANCELLED, serviceName: 'Cuci Dingin (Cold Wash) 15kg', qty: 1, payment: PaymentMethod.CASH, withPromo: false },
    { number: 'ORD-20260526-0009', memberCode: 'MBR004', outletCode: 'OUT-002', status: OrderStatus.COMPLETED, serviceName: 'Setrika Premium', qty: 3, payment: PaymentMethod.QRIS, withPromo: false },
    { number: 'ORD-20260526-0010', memberCode: 'MBR005', outletCode: 'OUT-003', status: OrderStatus.PAID, serviceName: 'Express 3 Jam', qty: 1, payment: PaymentMethod.TRANSFER, withPromo: true },
    { number: 'ORD-20260526-0011', memberCode: 'MBR001', outletCode: 'OUT-001', status: OrderStatus.DRYING, serviceName: 'Cuci + Kering 15kg', qty: 1, payment: PaymentMethod.QRIS, withPromo: false },
    { number: 'ORD-20260526-0012', memberCode: 'MBR002', outletCode: 'OUT-002', status: OrderStatus.WAITING_PAYMENT, serviceName: 'Cuci Sepatu', qty: 2, payment: PaymentMethod.PAYMENT_GATEWAY, withPromo: false },
  ];

  const orderResults: { id: string; number: string; status: OrderStatus; customerId?: string | null }[] = [];

  for (let i = 0; i < orderTemplates.length; i += 1) {
    const template = orderTemplates[i];
    const customer = customers.find((c) => c.memberCode === template.memberCode);
    const outlet = outletByCode.get(template.outletCode);
    const service = serviceByName.get(template.serviceName);
    if (!customer || !outlet || !service) continue;

    const servicePrice = await prisma.servicePrice.findUnique({
      where: { serviceId_outletId: { serviceId: service.id, outletId: outlet.id } },
    });
    if (!servicePrice) continue;

    const subtotal = servicePrice.price * template.qty;
    const discountAmount = template.withPromo ? Math.min(20000, subtotal * 0.2) : 0;
    const deliveryFee = i % 3 === 0 ? 10000 : 0;
    const totalAmount = subtotal - discountAmount + deliveryFee;
    const kiosk = kiosks[i % kiosks.length];

    const orderDate = addHours(new Date(), -36 + i * 3);
    const status =
      template.status === OrderStatus.CANCELLED
        ? OrderStatus.CANCELLED
        : template.status;

    const order = await prisma.order.create({
      data: {
        orderNumber: template.number,
        customerId: customer.id,
        customerAddressId: addressMap.get(customer.memberCode)?.id,
        outletId: outlet.id,
        kioskId: kiosk.id,
        sourcePlatform: 'WEB_ADMIN',
        orderDate,
        status,
        subtotal,
        discountAmount,
        deliveryFee,
        totalAmount,
        estimatedFinishAt: addHours(orderDate, servicePrice.estimatedDurationHours),
        completedAt:
          status === OrderStatus.COMPLETED ? addHours(orderDate, servicePrice.estimatedDurationHours + 2) : null,
        cancelledAt: status === OrderStatus.CANCELLED ? addHours(orderDate, 1) : null,
        cancelReason: status === OrderStatus.CANCELLED ? 'Pelanggan batal' : null,
        notes: `Seed order ${template.number}`,
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        serviceId: service.id,
        serviceName: service.name,
        quantity: template.qty,
        unit: servicePrice.unit,
        pricePerUnit: servicePrice.price,
        subtotal,
      },
    });

    const orderedStatuses: OrderStatus[] = [
      OrderStatus.DRAFT,
      OrderStatus.WAITING_PAYMENT,
      OrderStatus.PAID,
      OrderStatus.RECEIVED,
      OrderStatus.WASHING,
      OrderStatus.DRYING,
      OrderStatus.IRONING,
      OrderStatus.PACKING,
      OrderStatus.READY_PICKUP,
      OrderStatus.COMPLETED,
    ];
    const targetIndex = orderedStatuses.indexOf(status);
    if (targetIndex >= 0) {
      for (let s = 0; s <= targetIndex; s += 1) {
        await prisma.orderStatusLog.create({
          data: {
            orderId: order.id,
            status: orderedStatuses[s],
            notes: `Status -> ${orderedStatuses[s]}`,
            createdBy: userByEmail.get('admin@laundry.local')?.id,
            createdAt: addHours(orderDate, s),
          },
        });
      }
    } else if (status === OrderStatus.CANCELLED) {
      await prisma.orderStatusLog.createMany({
        data: [
          {
            orderId: order.id,
            status: OrderStatus.DRAFT,
            notes: 'Order dibuat',
            createdBy: userByEmail.get('admin@laundry.local')?.id,
            createdAt: orderDate,
          },
          {
            orderId: order.id,
            status: OrderStatus.CANCELLED,
            notes: 'Order dibatalkan',
            createdBy: userByEmail.get('admin@laundry.local')?.id,
            createdAt: addHours(orderDate, 1),
          },
        ],
      });
    }

    const paidStatuses: OrderStatus[] = [
      OrderStatus.PAID,
      OrderStatus.RECEIVED,
      OrderStatus.WASHING,
      OrderStatus.DRYING,
      OrderStatus.IRONING,
      OrderStatus.PACKING,
      OrderStatus.READY_PICKUP,
      OrderStatus.COMPLETED,
    ];
    const isPaidStatus = paidStatuses.includes(status);

    await prisma.payment.create({
      data: {
        orderId: order.id,
        paymentNumber: `PAY-${template.number}`,
        paymentMethod: template.payment,
        amount: totalAmount,
        status: isPaidStatus ? PaymentStatus.PAID : PaymentStatus.PENDING,
        paidAt: isPaidStatus ? addHours(orderDate, 1) : null,
        externalId: template.payment === PaymentMethod.QRIS ? `QR-${template.number}` : null,
        notes: 'Seed payment',
      },
    });

    if (template.payment === PaymentMethod.WALLET && isPaidStatus && customer.wallet) {
      const before = customer.wallet.balance;
      const after = Math.max(0, before - totalAmount);
      await prisma.wallet.update({
        where: { id: customer.wallet.id },
        data: { balance: after },
      });
      await prisma.walletTransaction.create({
        data: {
          walletId: customer.wallet.id,
          orderId: order.id,
          transactionType: WalletTransactionType.PAYMENT,
          amount: -totalAmount,
          balanceBefore: before,
          balanceAfter: after,
          description: `Pembayaran order ${order.orderNumber}`,
          idempotencyKey: `seed-wallet-pay-${order.orderNumber}`,
        },
      });
    }

    if (template.withPromo && customer.id) {
      const promo = promos[i % promos.length];
      await prisma.promoUsage.create({
        data: {
          promoId: promo.id,
          customerId: customer.id,
          orderId: order.id,
          discount: discountAmount,
          usedAt: addHours(orderDate, 1),
        },
      });
      await prisma.promo.update({
        where: { id: promo.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    orderResults.push({
      id: order.id,
      number: order.orderNumber,
      status: order.status,
      customerId: order.customerId,
    });
  }
  console.log(`✅ Orders ready: ${orderResults.length}`);

  const adminUser = userByEmail.get('admin@laundry.local');
  if (adminUser) {
    await prisma.auditLog.createMany({
      data: [
        {
          userId: adminUser.id,
          action: 'SEED_INITIALIZED',
          entity: 'SYSTEM',
          entityId: 'seed-v2',
          changes: { modules: 'all', totalOrders: orderResults.length },
          ipAddress: '127.0.0.1',
          userAgent: 'seed-script',
        },
        {
          userId: adminUser.id,
          action: 'CREATE_PROMO',
          entity: 'PROMO',
          entityId: promos[0]?.id,
          changes: { code: promos[0]?.code },
          ipAddress: '127.0.0.1',
          userAgent: 'seed-script',
        },
      ],
    });
  }
  console.log('✅ Audit logs ready');

  const counts = {
    users: await prisma.user.count(),
    outlets: await prisma.outlet.count(),
    outletUsers: await prisma.outletUser.count(),
    services: await prisma.service.count(),
    servicePrices: await prisma.servicePrice.count(),
    customers: await prisma.customer.count(),
    addresses: await prisma.customerAddress.count(),
    wallets: await prisma.wallet.count(),
    walletTransactions: await prisma.walletTransaction.count(),
    promos: await prisma.promo.count(),
    promoRules: await prisma.promoRule.count(),
    promoUsages: await prisma.promoUsage.count(),
    kiosks: await prisma.kiosk.count(),
    kioskSessions: await prisma.kioskSession.count(),
    devices: await prisma.iotDevice.count(),
    iotCommands: await prisma.iotCommand.count(),
    iotEvents: await prisma.iotEvent.count(),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    orderStatusLogs: await prisma.orderStatusLog.count(),
    payments: await prisma.payment.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  console.log('🎉 Seed completed successfully!');
  console.table(counts);
  console.log('\n📋 Default credentials:');
  console.log('   Super Admin: admin@laundry.local / Password123!');
  console.log('   Owner      : owner@dicuciin.id / Password123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
