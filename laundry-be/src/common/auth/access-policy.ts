import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Bentuk `req.user` dari JwtStrategy. */
export interface AuthUser {
  userId: string;
  role: UserRole | string;
  email?: string;
}

/** Semua role internal (bukan pelanggan). */
export const STAFF_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.ADMIN_OUTLET,
  UserRole.CASHIER,
  UserRole.OPERATOR,
  UserRole.TECHNICIAN,
];

/** Role manajemen (laporan keuangan, refund, dll). */
export const ADMIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.ADMIN_OUTLET,
];

/** Role yang boleh mengelola akun user lain. */
export const USER_ADMIN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.OWNER];

/** Role dengan akses lintas outlet (global). */
export const GLOBAL_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.OWNER];

export function isStaff(user: AuthUser | undefined | null): boolean {
  return !!user && (STAFF_ROLES as string[]).includes(user.role as string);
}

/**
 * Pastikan [user] boleh mengakses data customer [customerId]:
 * staf selalu boleh; customer hanya miliknya sendiri.
 * Melempar 404 bila customer tidak ada, 403 bila bukan pemilik.
 */
export async function assertCustomerAccess(
  prisma: PrismaService,
  user: AuthUser,
  customerId: string,
): Promise<void> {
  if (isStaff(user)) return;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { userId: true },
  });
  if (!customer) throw new NotFoundException('Customer tidak ditemukan');
  if (customer.userId !== user.userId) {
    throw new ForbiddenException('Tidak boleh mengakses data customer lain');
  }
}

/**
 * Pastikan [user] boleh mengakses order [orderId]. Order tanpa customer
 * (kiosk/tamu) hanya untuk staf.
 */
export async function assertOrderAccess(
  prisma: PrismaService,
  user: AuthUser,
  orderId: string,
): Promise<void> {
  if (isStaff(user) && (GLOBAL_ROLES as string[]).includes(user.role as string)) return;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { outletId: true, customer: { select: { userId: true } } },
  });
  if (!order) throw new NotFoundException('Order not found');
  if (isStaff(user)) {
    // Staf non-global: hanya order di outlet yang ditugaskan.
    const link = await prisma.outletUser.findFirst({
      where: { userId: user.userId, outletId: order.outletId },
      select: { id: true },
    });
    if (!link) throw new ForbiddenException('Order ini berada di outlet lain');
    return;
  }
  if (order.customer?.userId !== user.userId) {
    throw new ForbiddenException('Tidak boleh mengakses order ini');
  }
}

/** customerId milik user login (role CUSTOMER), atau null bila belum punya profil. */
export async function ownCustomerId(
  prisma: PrismaService,
  user: AuthUser,
): Promise<string | null> {
  const customer = await prisma.customer.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  return customer?.id ?? null;
}

/**
 * Untuk request yang membawa `customerId`/`partnerId` di body (checkout, quote,
 * pricing, buat order): staf boleh atas nama siapa pun; customer hanya untuk
 * dirinya sendiri, dan partner B2B hanya untuk partner miliknya.
 * Mengembalikan body dengan identitas yang sudah dipastikan.
 */
export async function scopeCheckoutIdentity<
  T extends { customerId?: string; partnerId?: string },
>(prisma: PrismaService, user: AuthUser, dto: T): Promise<T> {
  // Batch 1.5: `kioskId` hanya boleh di-set oleh rute perangkat kiosk
  // (/kiosks/device/*). Order kiosk menyalakan mesin begitu dibayar (tanpa
  // scan QR), jadi pemanggil JWT tidak boleh menandai order-nya sebagai kiosk.
  dto = stripKioskBinding(dto);
  if (isStaff(user)) return dto;

  if (dto.partnerId) {
    const partner = await prisma.b2BPartner.findUnique({
      where: { id: dto.partnerId },
      select: { userId: true },
    });
    if (!partner || partner.userId !== user.userId) {
      throw new ForbiddenException('Tidak boleh bertransaksi atas nama partner ini');
    }
    return dto;
  }

  const ownId = await ownCustomerId(prisma, user);
  if (!ownId) throw new ForbiddenException('Akun ini belum memiliki profil customer');
  if (dto.customerId && dto.customerId !== ownId) {
    throw new ForbiddenException('Tidak boleh bertransaksi atas nama customer lain');
  }
  return { ...dto, customerId: ownId };
}


/**
 * Lingkup outlet untuk laporan/daftar operasional.
 * - `null`  → global (SUPER_ADMIN/OWNER tanpa filter outlet).
 * - array  → hanya outlet tersebut.
 * Staf non-global hanya boleh outlet yang ditugaskan (OutletUser); meminta
 * outlet lain → 403; belum ditugaskan ke outlet mana pun → 403.
 */
export async function resolveOutletScope(
  prisma: PrismaService,
  user: AuthUser,
  requestedOutletId?: string,
): Promise<string[] | null> {
  if ((GLOBAL_ROLES as string[]).includes(user.role as string)) {
    return requestedOutletId ? [requestedOutletId] : null;
  }
  if (!isStaff(user)) {
    throw new ForbiddenException('Tidak memiliki akses ke data outlet');
  }
  const links = await prisma.outletUser.findMany({
    where: { userId: user.userId },
    select: { outletId: true },
  });
  const assigned = links.map((l) => l.outletId);
  if (assigned.length === 0) {
    throw new ForbiddenException('Akun ini belum ditugaskan ke outlet mana pun');
  }
  if (requestedOutletId) {
    if (!assigned.includes(requestedOutletId)) {
      throw new ForbiddenException('Tidak boleh mengakses data outlet lain');
    }
    return [requestedOutletId];
  }
  return assigned;
}

/** Hapus penanda kiosk dari payload yang datang lewat JWT (lihat scopeCheckoutIdentity). */
export function stripKioskBinding<T>(dto: T): T {
  if (dto && typeof dto === 'object' && 'kioskId' in (dto as object)) {
    const { kioskId: _ignored, ...rest } = dto as Record<string, unknown>;
    return rest as T;
  }
  return dto;
}
