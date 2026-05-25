import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Hash password untuk super admin
  const hashedPassword = await bcrypt.hash('Password123!', 10);

  // 1. Create Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@laundry.local' },
    update: {},
    create: {
      email: 'admin@laundry.local',
      phone: '081234567890',
      name: 'Super Admin',
      passwordHash: hashedPassword,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    },
  });
  console.log('✅ Super Admin created:', superAdmin.email);

  // 2. Create Default Outlet
  const outlet = await prisma.outlet.upsert({
    where: { code: 'OUT-001' },
    update: {},
    create: {
      code: 'OUT-001',
      name: 'Outlet Pusat',
      address: 'Jl. Laundry No. 1, Jakarta',
      phone: '021-12345678',
      isActive: true,
    },
  });
  console.log('✅ Outlet created:', outlet.name);

  // 3. Create Services
  // Check if services already exist
  let cuciKiloan = await prisma.service.findFirst({
    where: { name: 'Cuci Kiloan' },
  });
  if (!cuciKiloan) {
    cuciKiloan = await prisma.service.create({
      data: {
        name: 'Cuci Kiloan',
        serviceType: 'WASH',
        description: 'Layanan cuci kiloan reguler',
        isActive: true,
      },
    });
  }

  let setrika = await prisma.service.findFirst({
    where: { name: 'Setrika' },
  });
  if (!setrika) {
    setrika = await prisma.service.create({
      data: {
        name: 'Setrika',
        serviceType: 'IRON',
        description: 'Layanan setrika saja',
        isActive: true,
      },
    });
  }

  let express = await prisma.service.findFirst({
    where: { name: 'Express' },
  });
  if (!express) {
    express = await prisma.service.create({
      data: {
        name: 'Express',
        serviceType: 'EXPRESS',
        description: 'Layanan cuci express (selesai dalam 3 jam)',
        isActive: true,
      },
    });
  }

  console.log('✅ Services created: Cuci Kiloan, Setrika, Express');

  // 4. Create Service Prices for Default Outlet
  await prisma.servicePrice.upsert({
    where: {
      serviceId_outletId: {
        serviceId: cuciKiloan.id,
        outletId: outlet.id,
      },
    },
    update: {},
    create: {
      serviceId: cuciKiloan.id,
      outletId: outlet.id,
      pricingType: 'PER_KG',
      price: 7000,
      unit: 'kg',
      estimatedDurationHours: 48,
      isActive: true,
    },
  });

  await prisma.servicePrice.upsert({
    where: {
      serviceId_outletId: {
        serviceId: setrika.id,
        outletId: outlet.id,
      },
    },
    update: {},
    create: {
      serviceId: setrika.id,
      outletId: outlet.id,
      pricingType: 'PER_KG',
      price: 5000,
      unit: 'kg',
      estimatedDurationHours: 24,
      isActive: true,
    },
  });

  await prisma.servicePrice.upsert({
    where: {
      serviceId_outletId: {
        serviceId: express.id,
        outletId: outlet.id,
      },
    },
    update: {},
    create: {
      serviceId: express.id,
      outletId: outlet.id,
      pricingType: 'PER_KG',
      price: 15000,
      unit: 'kg',
      estimatedDurationHours: 3,
      isActive: true,
    },
  });

  console.log('✅ Service prices created for Outlet Pusat');

  console.log('🎉 Seed completed successfully!');
  console.log('\n📋 Default credentials:');
  console.log('   Email: admin@laundry.local');
  console.log('   Password: Password123!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
